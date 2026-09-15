import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const authMigration = readFileSync(resolve("supabase/migrations/20260908000000_auth_profiles.sql"), "utf8");
export const gameMigration = readFileSync(resolve("supabase/migrations/20260908010000_game_data.sql"), "utf8");
export const gameSeed = readFileSync(resolve("supabase/seed.sql"), "utf8");

export async function createAuthDatabase() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated;
  `);
  await db.exec(authMigration);
  return db;
}

export async function createGameDatabase() {
  const db = await createAuthDatabase();
  try {
    await db.exec(gameMigration);
    await db.exec(gameSeed);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export const leagueId = "10000000-0000-4000-8000-000000000001";
export const lakersId = "20000000-0000-4000-8000-000000000001";
export const warriorsId = "20000000-0000-4000-8000-000000000002";
export const scheduledGameId = "30000000-0000-4000-8000-000000000001";
