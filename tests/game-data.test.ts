import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createAuthDatabase, createGameDatabase, gameMigration, gameSeed, leagueId, lakersId, warriorsId, scheduledGameId } from "./helpers/game-database";

describe("Milestone 2 PostgreSQL migration and development seed", () => {
  let db: PGlite;
  before(async () => { db = await createGameDatabase(); });
  after(async () => { await db?.close(); });

  async function insertGame(overrides: { league?: string; home?: string; away?: string; status?: string } = {}) {
    return db.query<{ id: string; created_at: Date }>(`
      insert into public.games (league_id, home_team_id, away_team_id, starts_at, status)
      values ($1, $2, $3, '2026-10-21T00:00:00Z', $4) returning id, created_at
    `, [overrides.league ?? leagueId, overrides.home ?? lakersId, overrides.away ?? warriorsId, overrides.status ?? "scheduled"]);
  }

  test("both migrations apply in order and seed one league, four teams, three games and three rooms", async () => {
    const counts = await db.query(`select
      (select count(*)::int from leagues) as leagues,
      (select count(*)::int from teams) as teams,
      (select count(*)::int from games) as games,
      (select count(*)::int from game_rooms) as rooms
    `);
    assert.deepEqual(counts.rows, [{ leagues: 1, teams: 4, games: 3, rooms: 3 }]);
    const fixtures = await db.query(`select g.id, g.status, g.starts_at,
      h.city || ' ' || h.name as home, a.city || ' ' || a.name as away,
      g.home_score, g.away_score
      from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id
      order by g.starts_at`);
    assert.deepEqual(fixtures.rows, [
      { id: "30000000-0000-4000-8000-000000000003", status: "final", starts_at: new Date("2026-10-18T23:30:00Z"), home: "New York Knicks", away: "Los Angeles Lakers", home_score: 104, away_score: 108 },
      { id: "30000000-0000-4000-8000-000000000002", status: "live", starts_at: new Date("2026-10-20T00:00:00Z"), home: "Boston Celtics", away: "New York Knicks", home_score: 72, away_score: 68 },
      { id: scheduledGameId, status: "scheduled", starts_at: new Date("2026-10-20T23:00:00Z"), home: "Los Angeles Lakers", away: "Golden State Warriors", home_score: null, away_score: null },
    ]);
    assert.deepEqual((await db.query("select to_regclass('public.messages') as messages")).rows, [{ messages: null }]);
  });

  test("seed reruns preserve rows, room IDs and timestamps without duplicates", async () => {
    const snapshot = await db.query("select jsonb_agg(r order by r.id) as rooms from game_rooms r");
    await db.exec(gameSeed);
    await db.exec(gameSeed);
    assert.deepEqual((await db.query("select jsonb_agg(r order by r.id) as rooms from game_rooms r")).rows, snapshot.rows);
    const counts = await db.query("select count(*)::int as count from games");
    assert.deepEqual(counts.rows, [{ count: 3 }]);
  });

  test("UUID/time defaults work and each new game automatically receives one room", async () => {
    const { rows: [game] } = await insertGame();
    assert.match(game.id, /^[0-9a-f-]{36}$/);
    assert.ok(game.created_at);
    const rooms = await db.query<{ id: string; created_at: Date }>("select id, created_at from game_rooms where game_id = $1", [game.id]);
    assert.equal(rooms.rows.length, 1);
    assert.ok(rooms.rows[0].created_at);
    await assert.rejects(db.query("insert into game_rooms (game_id) values ($1)", [game.id]), /unique constraint/);
    await db.query("delete from games where id = $1", [game.id]);
    assert.equal((await db.query("select id from game_rooms where game_id = $1", [game.id])).rows.length, 0);
  });

  test("league and team identity constraints reject duplicates and missing parents", async () => {
    await assert.rejects(db.query("insert into leagues (name, abbreviation, sport) values ('Duplicate', 'NBA', 'Basketball')"), /unique constraint/);
    await assert.rejects(db.query("insert into teams (league_id, name, abbreviation) values ($1, 'Duplicate', 'LAL')", [leagueId]), /unique constraint/);
    await assert.rejects(db.query("insert into teams (name, abbreviation) values ('No league', 'NONE')"), /not-null constraint/);
    await assert.rejects(db.query("insert into teams (league_id, name, abbreviation) values ($1, 'Missing league', 'NONE')", [randomUUID()]), /foreign key constraint/);
    await assert.rejects(db.query("insert into game_rooms (game_id) values ($1)", [randomUUID()]), /foreign key constraint/);
  });

  test("games reject identical teams, missing parents, wrong leagues and invalid statuses", async () => {
    await assert.rejects(insertGame({ away: lakersId }), /games_different_teams/);
    await assert.rejects(insertGame({ home: randomUUID() }), /foreign key constraint/);
    await assert.rejects(insertGame({ league: randomUUID() }), /foreign key constraint/);
    await assert.rejects(insertGame({ status: "unknown" }), /check constraint/);
    const otherLeagueId = randomUUID();
    await db.query("insert into leagues (id, name, abbreviation, sport) values ($1, 'Other', 'OTHER', 'Basketball')", [otherLeagueId]);
    await assert.rejects(insertGame({ league: otherLeagueId }), /foreign key constraint/);
    await assert.rejects(db.query("update games set home_score = -1 where id = $1", [scheduledGameId]), /check constraint/);
    await assert.rejects(db.query("update games set league_id = null where id = $1", [scheduledGameId]), /not-null constraint/);
    await assert.rejects(db.query("update games set starts_at = null where id = $1", [scheduledGameId]), /not-null constraint/);
    for (const status of ["scheduled", "live", "final", "postponed", "cancelled"]) {
      await db.query("update games set status = $2 where id = $1", [scheduledGameId, status]);
    }
    await db.query("update games set status = 'scheduled' where id = $1", [scheduledGameId]);
    await db.query("delete from leagues where id = $1", [otherLeagueId]);
  });

  test("deleting referenced leagues or teams is restricted, not broadly cascaded", async () => {
    await assert.rejects(db.query("delete from leagues where id = $1", [leagueId]), /foreign key constraint/);
    await assert.rejects(db.query("delete from teams where id = $1", [lakersId]), /foreign key constraint/);
    assert.equal((await db.query("select id from games")).rows.length, 3);
  });

  test("RLS is enabled on all sports tables with only authenticated SELECT policies", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where oid in ('leagues'::regclass, 'teams'::regclass, 'games'::regclass, 'game_rooms'::regclass)");
    assert.equal(rows.rows.length, 4);
    assert.ok(rows.rows.every(row => row.relrowsecurity === true));
    const policies = await db.query<{ cmd: string; roles: string[] }>("select cmd, roles from pg_policies where tablename in ('leagues','teams','games','game_rooms')");
    assert.equal(policies.rows.length, 4);
    assert.ok(policies.rows.every(row => row.cmd === "SELECT" && row.roles.includes("authenticated")));
    await db.exec("set role authenticated");
    try {
      for (const table of ["leagues", "teams", "games", "game_rooms"]) {
        assert.ok((await db.query(`select id from public.${table}`)).rows.length > 0);
        await assert.rejects(db.query(`insert into public.${table} default values`), /permission denied/);
        await assert.rejects(db.query(`update public.${table} set created_at = now()`), /permission denied/);
        await assert.rejects(db.query(`delete from public.${table}`), /permission denied/);
      }
      await assert.rejects(db.query("select create_room_for_game()"), /permission denied/);
    } finally { await db.exec("reset role"); }
    await db.exec("set role anon");
    try {
      for (const table of ["leagues", "teams", "games", "game_rooms"]) {
        await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
      }
    } finally { await db.exec("reset role"); }
  });

  test("RLS still denies writes even if table write grants are accidentally added later", async () => {
    await db.exec("grant insert, update, delete on leagues, teams, games, game_rooms to authenticated");
    await db.exec("set role authenticated");
    try {
      for (const table of ["leagues", "teams", "games", "game_rooms"]) {
        assert.equal((await db.query(`update public.${table} set created_at = now()`)).affectedRows, 0);
        assert.equal((await db.query(`delete from public.${table}`)).affectedRows, 0);
      }
      await assert.rejects(db.query("insert into leagues (name, abbreviation, sport) values ('Spoof', 'SPF', 'Basketball')"), /row-level security/);
      await assert.rejects(db.query("insert into teams (league_id, name, abbreviation) values ($1, 'Spoof', 'SPF')", [leagueId]), /row-level security/);
      await assert.rejects(insertGame(), /row-level security/);
      await assert.rejects(db.query("insert into game_rooms (game_id) values ($1)", [scheduledGameId]), /row-level security/);
    } finally {
      await db.exec("reset role");
      await db.exec("revoke insert, update, delete on leagues, teams, games, game_rooms from authenticated");
    }
  });

  test("Milestone 1 profile trigger still creates exactly one profile after sports migration", async () => {
    const id = randomUUID();
    await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [id, { username: "game_fan" }]);
    assert.deepEqual((await db.query("select id, username from profiles where id = $1", [id])).rows, [{ id, username: "game_fan" }]);
    await db.query("update auth.users set raw_user_meta_data = $2 where id = $1", [id, { username: "changed_metadata" }]);
    assert.deepEqual((await db.query("select id, username from profiles where id = $1", [id])).rows, [{ id, username: "game_fan" }]);
  });
});

test("unexpected legacy sports tables fail safely without replacing their data or auth schema", async () => {
  const db = await createAuthDatabase();
  try {
    await db.exec("create table public.leagues (legacy_value text); insert into leagues values ('preserve me')");
    await assert.rejects(db.exec(gameMigration), /already exists/);
    await db.exec("rollback");
    assert.deepEqual((await db.query("select * from leagues")).rows, [{ legacy_value: "preserve me" }]);
    assert.deepEqual((await db.query("select to_regclass('public.teams') as teams")).rows, [{ teams: null }]);
    assert.deepEqual((await db.query("select to_regclass('public.profiles') as profiles")).rows, [{ profiles: "profiles" }]);
  } finally { await db.close(); }
});
