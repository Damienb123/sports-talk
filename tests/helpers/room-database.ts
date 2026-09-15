import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGameDatabase, gameSeed } from "./game-database";

export const messagesMigration = readFileSync(resolve("supabase/migrations/20260909000000_messages.sql"), "utf8");
export const fixtureAuthorIds = [
  "50000000-0000-4000-8000-000000000001",
  "50000000-0000-4000-8000-000000000002",
  "50000000-0000-4000-8000-000000000003",
];
export const finalGameId = "30000000-0000-4000-8000-000000000003";

export async function createRoomDatabase() {
  const db = await createGameDatabase();
  try {
    await db.exec(messagesMigration);
    // These Auth rows are ONLY in embedded PostgreSQL's emulated auth schema.
    // Hosted fixtures use genuine users created through Supabase Auth instead.
    for (const [index, id] of fixtureAuthorIds.entries()) {
      await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [id, { username: ["courtside_fan", "knicks_fan", "hoops_fan"][index] }]);
    }
    await db.query("select set_config('sports_talk.seed_author_ids', $1, false)", [fixtureAuthorIds.join(",")]);
    await db.exec(gameSeed);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
