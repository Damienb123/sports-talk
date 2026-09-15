import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createRoomDatabase, fixtureAuthorIds, finalGameId } from "./helpers/room-database";
import { gameSeed, leagueId, lakersId, warriorsId } from "./helpers/game-database";

describe("message schema, ownership and seed", () => {
  let db: PGlite;
  let roomId: string;
  before(async () => {
    db = await createRoomDatabase();
    roomId = (await db.query<{ id: string }>("select id from game_rooms where game_id = $1", [finalGameId])).rows[0].id;
  });
  after(async () => { await db?.close(); });

  const insert = (content: string, userId = fixtureAuthorIds[0], room = roomId) => db.query(
    "insert into messages (room_id, user_id, content) values ($1, $2, $3) returning id, created_at", [room, userId, content],
  );

  test("migration applies after M1/M2, adds only required columns, index, defaults and RLS", async () => {
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'messages' order by ordinal_position");
    assert.deepEqual(columns.rows.map(row => row.column_name), ["id", "room_id", "user_id", "content", "created_at"]);
    assert.deepEqual((await db.query("select relrowsecurity from pg_class where oid = 'messages'::regclass")).rows, [{ relrowsecurity: true }]);
    const index = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'messages_room_created_at_idx'");
    assert.match(index.rows[0].indexdef, /\(room_id, created_at\)/);
    const result = await insert("A good start.");
    assert.ok(result.rows[0]);
  });

  test("foreign keys reject missing rooms and profiles", async () => {
    await assert.rejects(insert("No room", fixtureAuthorIds[0], randomUUID()), /foreign key constraint/);
    await assert.rejects(insert("No author", randomUUID()), /foreign key constraint/);
  });

  test("empty, whitespace-only, oversized and null content are rejected by PostgreSQL", async () => {
    for (const content of ["", " ", "\t\n\r", "\u00a0\u2003\ufeff", "x".repeat(1001), "🏀".repeat(1001)]) {
      await assert.rejects(insert(content), /check constraint/);
    }
    await assert.rejects(db.query("insert into messages (room_id,user_id,content) values ($1,$2,null)", [roomId, fixtureAuthorIds[0]]), /not-null constraint/);
    await insert("🏀".repeat(1000));
    await insert("First line\nSecond line");
  });

  test("authenticated readers can read, insert as themselves, and cannot impersonate another user", async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [fixtureAuthorIds[0]]);
    await db.exec("set role authenticated");
    try {
      assert.ok((await db.query("select id from messages where room_id = $1", [roomId])).rows.length >= 6);
      await insert("Own message");
      await assert.rejects(insert("Impersonation", fixtureAuthorIds[1]), /row-level security/);
      await assert.rejects(db.query("insert into messages (room_id,user_id,content,created_at) values ($1,$2,'forged time',now())", [roomId, fixtureAuthorIds[0]]), /permission denied/);
      await assert.rejects(db.query("update messages set content = 'edited' where user_id = $1", [fixtureAuthorIds[0]]), /permission denied/);
      await assert.rejects(db.query("delete from messages where user_id = $1", [fixtureAuthorIds[0]]), /permission denied/);
    } finally { await db.exec("reset role"); }
  });

  test("anonymous users cannot read or insert even with an auth ID setting", async () => {
    await db.exec("set role anon");
    try {
      await assert.rejects(db.query("select * from messages"), /permission denied/);
      await assert.rejects(insert("Anonymous"), /permission denied/);
    } finally { await db.exec("reset role"); }
  });

  test("profile deletion is restricted; deleting a room cascades only its messages", async () => {
    await assert.rejects(db.query("delete from profiles where id = $1", [fixtureAuthorIds[0]]), /foreign key constraint/);
    const game = await db.query<{ id: string }>("insert into games (league_id, home_team_id, away_team_id, starts_at) values ($1,$2,$3,'2026-10-21T00:00:00Z') returning id", [leagueId, lakersId, warriorsId]);
    const room = (await db.query<{ id: string }>("select id from game_rooms where game_id = $1", [game.rows[0].id])).rows[0];
    await insert("Temporary room history", fixtureAuthorIds[0], room.id);
    await db.query("delete from game_rooms where id = $1", [room.id]);
    assert.equal((await db.query("select id from messages where room_id = $1", [room.id])).rows.length, 0);
    assert.ok((await db.query("select id from messages where room_id = $1", [roomId])).rows.length >= 6);
  });

  test("fixtures require opt-in, preserve IDs/authorship on reruns and create no Auth users", async () => {
    const before = await db.query("select id,user_id,content,created_at from messages order by id");
    await db.exec(gameSeed);
    await db.exec(gameSeed);
    assert.deepEqual((await db.query("select id,user_id,content,created_at from messages order by id")).rows, before.rows);
    assert.equal((await db.query("select id from auth.users")).rows.length, 3);
    await db.query("select set_config('sports_talk.seed_author_ids', '', false)");
    await db.exec(gameSeed);
    assert.deepEqual((await db.query("select id,user_id,content,created_at from messages order by id")).rows, before.rows);
    await db.query("select set_config('sports_talk.seed_author_ids', $1, false)", [randomUUID()]);
    await assert.rejects(db.exec(gameSeed), /existing development profile IDs/);
    await db.exec("rollback");
  });
});
