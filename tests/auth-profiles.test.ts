import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  resolve("supabase/migrations/20260908000000_auth_profiles.sql"), "utf8",
);

// PGlite runs real PostgreSQL constraints, triggers and RLS. Only the Supabase
// auth schema/roles and JWT-sub accessor are emulated; no hosted data is touched.
const authSchema = `
  create role anon;
  create role authenticated;
  create role auth_server;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    raw_user_meta_data jsonb not null default '{}',
    last_sign_in_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated, auth_server;
  grant select, insert, update on auth.users to auth_server;
`;

describe("auth profile migration", () => {
  let db: PGlite;
  const ownerId = randomUUID();
  const otherId = randomUUID();

  async function createUser(id: string, metadata: Record<string, unknown>) {
    await db.exec("set role auth_server");
    try {
      await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [id, JSON.stringify(metadata)]);
    } finally {
      await db.exec("reset role");
    }
  }

  async function asUser(id: string, run: () => Promise<void>) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec("set role authenticated");
    try { await run(); }
    finally { await db.exec("reset role"); }
  }

  before(async () => {
    db = await PGlite.create();
    await db.exec(authSchema);
    await db.exec(migration);
    await createUser(ownerId, { username: "owner_fan" });
    await createUser(otherId, { username: "other_fan" });
  });
  after(async () => { await db?.close(); });

  test("Auth insert atomically creates exactly one matching profile with normalized username", async () => {
    const id = randomUUID();
    await createUser(id, { username: "  new_fan  ", id: otherId, user_id: otherId });
    const result = await db.query<{ id: string; username: string; display_name: null; avatar_url: null; created_at: Date }>(
      "select * from public.profiles where id = $1", [id],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, id);
    assert.equal(result.rows[0].username, "new_fan");
    assert.equal(result.rows[0].display_name, null);
    assert.equal(result.rows[0].avatar_url, null);
    assert.ok(result.rows[0].created_at);
  });

  test("duplicate usernames roll back Auth user creation rather than leaving orphan users", async () => {
    const id = randomUUID();
    await assert.rejects(createUser(id, { username: "owner_fan" }), /unique constraint/);
    assert.equal((await db.query("select id from auth.users where id = $1", [id])).rows.length, 0);
    assert.equal((await db.query("select id from public.profiles where id = $1", [id])).rows.length, 0);
  });

  test("missing, blank and malformed usernames are rejected in the database, including direct Auth calls", async () => {
    for (const metadata of [{}, { username: null }, ...["", "  ", "ab", "x".repeat(31), "fan name", "fan<script>"].map(username => ({ username }))]) {
      const id = randomUUID();
      await assert.rejects(createUser(id, metadata), /not-null constraint|check constraint/);
      assert.equal((await db.query("select id from auth.users where id = $1", [id])).rows.length, 0);
    }
  });

  test("repeated sign-in metadata updates never insert or overwrite profiles", async () => {
    for (let i = 0; i < 3; i++) {
      await db.query("update auth.users set last_sign_in_at = now(), raw_user_meta_data = $2 where id = $1", [ownerId, { username: "spoofed_name" }]);
    }
    assert.deepEqual((await db.query("select id, username from public.profiles where id = $1", [ownerId])).rows,
      [{ id: ownerId, username: "owner_fan" }]);
  });

  test("authenticated users can read public profiles and update only their own row", async () => {
    await asUser(ownerId, async () => {
      assert.ok((await db.query("select id from public.profiles")).rows.length >= 2);
      const own = await db.query("update public.profiles set display_name = 'Owner' where id = $1", [ownerId]);
      assert.equal(own.affectedRows, 1);
      const other = await db.query("update public.profiles set display_name = 'Impersonated' where id = $1", [otherId]);
      assert.equal(other.affectedRows, 0);
    });
    assert.equal((await db.query<{ display_name: string }>("select display_name from public.profiles where id = $1", [ownerId])).rows[0].display_name, "Owner");
  });

  test("clients cannot insert/delete profiles, change ownership, or change creation time", async () => {
    await asUser(ownerId, async () => {
      await assert.rejects(db.query("insert into public.profiles (id, username) values ($1, 'extra_fan')", [randomUUID()]), /permission denied/);
      await assert.rejects(db.query("delete from public.profiles where id = $1", [ownerId]), /permission denied/);
      await assert.rejects(db.query("update public.profiles set id = $2 where id = $1", [ownerId, randomUUID()]), /permission denied/);
      await assert.rejects(db.query("update public.profiles set created_at = now() where id = $1", [ownerId]), /permission denied/);
    });
  });

  test("username validation and uniqueness also apply to authorized profile updates", async () => {
    await asUser(ownerId, async () => {
      await assert.rejects(db.query("update public.profiles set username = ' ' where id = $1", [ownerId]), /check constraint/);
      await assert.rejects(db.query("update public.profiles set username = 'other_fan' where id = $1", [ownerId]), /unique constraint/);
    });
  });

  test("anonymous users can read public identity but cannot write or execute the trigger function", async () => {
    await db.exec("set role anon");
    try {
      assert.ok((await db.query("select id from public.profiles")).rows.length >= 2);
      await assert.rejects(db.query("update public.profiles set display_name = 'anonymous'"), /permission denied/);
      await assert.rejects(db.query("select public.create_profile_for_auth_user()"), /permission denied/);
    } finally { await db.exec("reset role"); }
    const flags = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'public.profiles'::regclass");
    assert.equal(flags.rows[0].relrowsecurity, true);
  });

  test("deleting an Auth user cascades to the corresponding profile", async () => {
    const id = randomUUID();
    await createUser(id, { username: "temporary_fan" });
    await db.query("delete from auth.users where id = $1", [id]);
    assert.equal((await db.query("select id from public.profiles where id = $1", [id])).rows.length, 0);
  });
});

test("migration accepts the documented existing profiles table and preserves its rows", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(authSchema);
    await db.exec(`
      create table public.profiles (
        id uuid primary key references auth.users(id) on delete cascade,
        username text unique not null, display_name text, avatar_url text,
        created_at timestamptz default now() not null
      );
    `);
    const id = randomUUID();
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into public.profiles (id, username) values ($1, 'existing_fan')", [id]);
    await db.exec(migration);
    assert.deepEqual((await db.query("select id, username from public.profiles")).rows, [{ id, username: "existing_fan" }]);
  } finally { await db.close(); }
});
