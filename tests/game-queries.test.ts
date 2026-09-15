import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { PGlite } from "@electric-sql/pglite";
import type { Database } from "../lib/supabase/database.types";
import { getGame, listGames, type GameSummary } from "../lib/games/queries";
import { createGameDatabase, scheduledGameId } from "./helpers/game-database";

describe("typed game queries", () => {
  let db: PGlite;
  let games: GameSummary[];
  before(async () => {
    db = await createGameDatabase();
    games = (await db.query<GameSummary>(`select g.id, g.starts_at::text, g.status, g.home_score, g.away_score,
      jsonb_build_object('name', l.name, 'abbreviation', l.abbreviation) as league,
      jsonb_build_object('name', h.name, 'city', h.city, 'abbreviation', h.abbreviation) as home_team,
      jsonb_build_object('name', a.name, 'city', a.city, 'abbreviation', a.abbreviation) as away_team
      from games g join leagues l on l.id = g.league_id
      join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id
      order by g.starts_at, g.id`)).rows;
  });
  after(async () => { await db?.close(); });

  function client(fetcher: typeof fetch) {
    return createClient<Database>("https://games.example.test", "test-publishable-key", {
      global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  test("list uses one relational request with named home/away FKs and deterministic time ordering", async () => {
    let calls = 0;
    const supabase = client(async (input) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/games");
      assert.equal(url.searchParams.get("order"), "starts_at.asc,id.asc");
      const select = url.searchParams.get("select")!;
      assert.match(select, /home_team:teams!games_home_team_id_fkey/);
      assert.match(select, /away_team:teams!games_away_team_id_fkey/);
      assert.match(select, /league:leagues!games_league_id_fkey/);
      return Response.json(games);
    });
    assert.deepEqual(await listGames(supabase), games);
    assert.equal(calls, 1);
  });

  test("detail filters by ID and returns the selected game's correct metadata", async () => {
    const expected = games.find(game => game.id === scheduledGameId)!;
    const supabase = client(async input => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("id"), `eq.${scheduledGameId}`);
      return Response.json([expected]);
    });
    assert.deepEqual(await getGame(supabase, scheduledGameId), expected);
  });

  test("malformed IDs cause no database request; valid missing UUIDs return null", async () => {
    const noFetch = client(async () => { assert.fail("Invalid ID must not be queried"); });
    for (const id of ["gameId", "123", "' OR true", "", "../auth/login"]) {
      assert.equal(await getGame(noFetch, id), null);
    }
    assert.equal(await getGame(client(async () => Response.json([])), "99999999-9999-4999-8999-999999999999"), null);
  });

  test("empty list is distinct from provider errors, which do not expose internals", async () => {
    assert.deepEqual(await listGames(client(async () => Response.json([]))), []);
    const broken = client(async () => Response.json({ code: "42501", message: "internal SQL details" }, { status: 403 }));
    await assert.rejects(listGames(broken), { message: "We couldn't load games. Please try again." });
    await assert.rejects(getGame(broken, scheduledGameId), { message: "We couldn't load this game. Please try again." });
  });

  test("missing joined teams fail explicitly instead of rendering incomplete game cards", async () => {
    const broken = client(async () => Response.json([{ ...games[0], home_team: null }]));
    await assert.rejects(listGames(broken), /couldn't load the teams/);
  });
});
