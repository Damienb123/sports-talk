import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { PGlite } from "@electric-sql/pglite";
import type { Database, Message } from "../lib/supabase/database.types";
import { persistMessage } from "../lib/rooms/send";
import { createRoomDatabase, fixtureAuthorIds, finalGameId } from "./helpers/room-database";

describe("authenticated message mutation with PostgreSQL RLS", () => {
  let db: PGlite;
  let writes = 0;
  before(async () => { db = await createRoomDatabase(); });
  after(async () => { await db?.close(); });

  async function client(userId: string | null = fixtureAuthorIds[0], mode = "normal") {
    const user = { id: userId, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-09-11T00:00:00Z" };
    const supabase = createClient<Database>("https://send.example.test", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/token")) return Response.json({ access_token: "test-token", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user });
        if (url.pathname.endsWith("/user")) return Response.json(user);
        if (mode === "network") throw new Error("private network details");
        if (url.pathname.endsWith("/games")) {
          const rows = (await db.query<{ id: string; room: { id: string } | null }>(`select g.id, case when r.id is null then null else json_build_object('id',r.id) end as room from games g left join game_rooms r on r.game_id=g.id where g.id=$1`, [url.searchParams.get("id")!.slice(3)])).rows;
          return Response.json(mode === "missing-room" ? rows.map(row => ({ ...row, room: null })) : rows);
        }
        assert.equal(url.pathname, "/rest/v1/messages");
        assert.equal(init?.method, "POST");
        const value = JSON.parse(String(init?.body));
        assert.deepEqual(Object.keys(value).sort(), ["content", "room_id", "user_id"]);
        writes++;
        try {
          const result = await db.transaction(async tx => {
            await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [mode === "rls" ? fixtureAuthorIds[1] : userId]);
            await tx.exec("set local role authenticated");
            return await tx.query("insert into messages (room_id,user_id,content) values ($1,$2,$3) returning id", [value.room_id, value.user_id, value.content]);
          });
          if (mode === "lost-response") return Promise.reject(new Error("private response failure"));
          return Response.json(result.rows[0], { status: 201 });
        } catch { return Response.json({ code: "42501", message: "private policy detail" }, { status: 403 }); }
      } },
    });
    if (userId) await supabase.auth.signInWithPassword({ email: "fan@example.test", password: "test-password" });
    return supabase;
  }

  test("one submission inserts exactly one row with server author/room, exact text and generated defaults", async () => {
    const before = (await db.query("select id from messages")).rows.length;
    const content = "  Great play!\nKeep it going.  ";
    assert.deepEqual(await persistMessage(await client(), finalGameId, content), { ok: true });
    assert.equal((await db.query("select id from messages")).rows.length, before + 1);
    const row = (await db.query<Message>("select * from messages where content=$1", [content])).rows[0];
    assert.equal(row.user_id, fixtureAuthorIds[0]);
    assert.equal(row.room_id, (await db.query<{ id: string }>("select id from game_rooms where game_id=$1", [finalGameId])).rows[0].id);
    assert.equal(row.content, content);
    assert.match(row.id, /^[0-9a-f-]{36}$/);
    assert.ok(Number.isFinite(new Date(row.created_at).getTime()));
  });

  test("server independently rejects absent/non-string/blank/overlength content without inserting", async () => {
    const supabase = await client();
    const before = writes;
    for (const content of [null, undefined, 123, {}, "", " \n\t", "\u00a0\ufeff", "x".repeat(1001), "🏀".repeat(1001)]) {
      assert.equal((await persistMessage(supabase, finalGameId, content)).ok, false);
    }
    assert.equal(writes, before);
    assert.deepEqual(await persistMessage(supabase, finalGameId, "🏀".repeat(1000)), { ok: true });
  });

  test("anonymous, malformed/missing game, room UUID masquerading as game, missing room fail without writes", async () => {
    const before = writes;
    const anonymous = await persistMessage(await client(null), finalGameId, "No session");
    assert.equal(anonymous.ok, false);
    if (!anonymous.ok) assert.match(anonymous.error, /sign in/);
    const unrelatedRoom = (await db.query<{ id: string }>("select id from game_rooms where game_id<>$1 limit 1", [finalGameId])).rows[0].id;
    for (const id of [null, "bad", "99999999-9999-4999-8999-999999999999", unrelatedRoom]) {
      assert.equal((await persistMessage(await client(), id, "No room")).ok, false);
    }
    assert.equal((await persistMessage(await client(fixtureAuthorIds[0], "missing-room"), finalGameId, "Missing")).ok, false);
    assert.equal(writes, before);
  });

  test("second user is attributed to their own verified identity; RLS rejects mismatched ownership", async () => {
    assert.deepEqual(await persistMessage(await client(fixtureAuthorIds[1]), finalGameId, "User B message"), { ok: true });
    assert.equal((await db.query<{ user_id: string }>("select user_id from messages where content='User B message'")).rows[0].user_id, fixtureAuthorIds[1]);
    const result = await persistMessage(await client(fixtureAuthorIds[0], "rls"), finalGameId, "Impersonation");
    assert.equal(result.ok, false);
    if (!result.ok) assert.doesNotMatch(result.error, /private policy/);
    assert.equal((await db.query("select id from messages where content='Impersonation'")).rows.length, 0);
  });

  test("network failures return safe feedback and never retry a write automatically", async () => {
    const before = writes;
    const result = await persistMessage(await client(fixtureAuthorIds[0], "network"), finalGameId, "Network");
    assert.equal(result.ok, false);
    if (!result.ok) assert.doesNotMatch(result.error, /private network/);
    assert.equal(writes, before);
  });

  test("a lost insert response is reported as uncertain and the SDK does not retry the POST", async () => {
    const before = writes;
    const result = await persistMessage(await client(fixtureAuthorIds[0], "lost-response"), finalGameId, "Committed but response lost");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /check the conversation before trying again/);
    assert.equal(writes, before + 1);
    assert.equal((await db.query("select id from messages where content='Committed but response lost'")).rows.length, 1);
  });
});
