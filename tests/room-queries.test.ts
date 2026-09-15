import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { getGameRoom, HISTORY_LIMIT } from "../lib/rooms/queries";

const game = {
  id: "30000000-0000-4000-8000-000000000003", starts_at: "2026-10-18T23:30:00Z", status: "final",
  home_score: 104, away_score: 108,
  league: { name: "National Basketball Association", abbreviation: "NBA" },
  home_team: { name: "Knicks", city: "New York", abbreviation: "NYK" },
  away_team: { name: "Lakers", city: "Los Angeles", abbreviation: "LAL" },
  room: { id: "60000000-0000-4000-8000-000000000001" },
};
const message = { id: "40000000-0000-4000-8000-000000000001", user_id: "50000000-0000-4000-8000-000000000001", room_id: game.room.id, content: "What a finish.", created_at: "2026-10-19T01:36:00Z", author: { username: "courtside_fan" } };
function client(fetcher: typeof fetch) {
  return createClient<Database>("https://room.example.test", "test-publishable-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
}

test("room loads game context and bounded chronological author history with two reads", async () => {
  const paths: string[] = [];
  const result = await getGameRoom(client(async input => {
    const url = new URL(String(input)); paths.push(url.pathname);
    if (url.pathname.endsWith("/games")) {
      assert.match(url.searchParams.get("select")!, /room:game_rooms!game_rooms_game_id_fkey/);
      assert.equal(url.searchParams.get("id"), `eq.${game.id}`);
      return Response.json([game]);
    }
    assert.equal(url.searchParams.get("room_id"), `eq.${game.room.id}`);
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
    assert.equal(url.searchParams.get("limit"), String(HISTORY_LIMIT + 1));
    assert.match(url.searchParams.get("select")!, /author:profiles!messages_user_id_fkey\(username\)/);
    return Response.json([message]);
  }), game.id);
  assert.deepEqual(paths, ["/rest/v1/games", "/rest/v1/messages"]);
  assert.equal(result?.kind, "ready");
  if (result?.kind === "ready") assert.deepEqual(result.messages, [message]);
});

test("invalid/missing games stay not-found and missing rooms do not load messages or create rooms", async () => {
  assert.equal(await getGameRoom(client(async () => { assert.fail("No query for invalid UUID"); }), "invalid"), null);
  assert.equal(await getGameRoom(client(async () => Response.json([])), game.id), null);
  let calls = 0;
  const result = await getGameRoom(client(async () => { calls++; return Response.json([{ ...game, room: null }]); }), game.id);
  assert.equal(result?.kind, "missing-room");
  assert.equal(calls, 1);
});

test("empty history is distinct from provider errors and the history cap is explicit", async () => {
  const empty = await getGameRoom(client(async input => Response.json(String(input).includes("/games?") ? [game] : [])), game.id);
  assert.equal(empty?.kind, "ready");
  if (empty?.kind === "ready") assert.deepEqual(empty.messages, []);
  const capped = await getGameRoom(client(async input => Response.json(String(input).includes("/games?") ? [game] : Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => ({ ...message, id: String(i) })))), game.id);
  if (capped?.kind !== "ready") assert.fail("Expected room");
  assert.equal(capped.messages.length, HISTORY_LIMIT);
  assert.equal(capped.historyLimited, true);
  assert.equal(capped.messages[0].id, "99");
  assert.equal(capped.messages[99].id, "0"); // newest row survives the cap
  await assert.rejects(getGameRoom(client(async input => String(input).includes("/games?")
    ? Response.json([game]) : Response.json({ message: "internal database error", code: "42501" }, { status: 403 })), game.id),
  { message: "We couldn't load the conversation. Please try again." });
});
