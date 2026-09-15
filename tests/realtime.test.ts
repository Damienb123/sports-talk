import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Message } from "../lib/supabase/database.types";
import type { RoomMessage } from "../lib/rooms/queries";
import { mergeMessages, subscribeToRoom } from "../lib/rooms/realtime";
import { createRoomDatabase } from "./helpers/room-database";

const row: RoomMessage = { id: "a", room_id: "room-a", user_id: "user-a", content: "Persisted", created_at: "2026-09-11T00:00:00.000001Z", author: { username: "fan_a" } };
test("ID merge preserves chronological microsecond ordering, author fallback and room scope", () => {
  const later = { ...row, id: "0", created_at: "2026-09-11T00:00:00.000002Z" };
  const result = mergeMessages("room-a", [later, row], [row, { ...row, author: { username: "" } }, { ...row, id: "other", room_id: "room-b" }]);
  assert.deepEqual(result.map(message => message.id), ["a", "0"]);
  assert.equal(result[0].author.username, "fan_a");
  assert.equal(mergeMessages("room-a", ...Array.from({ length: 150 }, (_, i) => [{ ...row, id: String(i).padStart(3, "0") }])).length, 100);
});

test("subscription filters INSERTs, resolves authors, degrades safely and ignores work after cleanup", async () => {
  let event!: (value: { new: Message }) => Promise<void>;
  let state!: (value: string) => void;
  let removed = 0;
  let failed = false;
  const received: RoomMessage[] = [];
  const statuses: string[] = [];
  const channel = {
    on(kind: string, filter: object, callback: typeof event) {
      assert.equal(kind, "postgres_changes");
      assert.deepEqual(filter, { event: "INSERT", schema: "public", table: "messages", filter: "room_id=eq.room-a" });
      event = callback; return channel;
    },
    subscribe(callback: typeof state) { state = callback; return channel; },
  };
  const builder = {
    select() { return builder; }, eq() { return builder; }, abortSignal() { return builder; },
    order() { return builder; }, limit() { return builder; },
    async maybeSingle() { return { data: failed ? null : row, error: failed ? {} : null }; },
    then(resolve: (value: object) => void) { resolve({ data: [row], error: null }); },
  };
  const client = { channel: () => channel, from: () => builder, removeChannel: async () => { removed++; } } as unknown as SupabaseClient<Database>;
  const stop = subscribeToRoom(client, "room-a", rows => received.push(...rows), value => statuses.push(value));
  await event({ new: { ...row, room_id: "room-b" } }); assert.equal(received.length, 0);
  await event({ new: row }); assert.equal(received[0].author.username, "fan_a");
  failed = true; await event({ new: { ...row, id: "fallback" } });
  assert.equal(received[1].author.username, "");
  state("CHANNEL_ERROR"); state("CLOSED"); state("SUBSCRIBED");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(statuses, ["unavailable", "unavailable", "live"]);
  stop(); const count = received.length;
  await event({ new: row }); state("SUBSCRIBED");
  assert.equal(received.length, count); assert.equal(removed, 1);
});

test("publication migration adds only messages, preserves existing membership and tolerates already enabled", async () => {
  const db = await createRoomDatabase();
  try {
    const migration = readFileSync("supabase/migrations/20260911000000_messages_realtime.sql", "utf8");
    await db.exec("create publication supabase_realtime for table public.games");
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows,
      [{ tablename: "games" }, { tablename: "messages" }]);
    assert.deepEqual((await db.query("select relrowsecurity from pg_class where oid='messages'::regclass")).rows, [{ relrowsecurity: true }]);
    await db.exec("drop publication supabase_realtime"); await db.exec(migration);
    assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows, [{ tablename: "messages" }]);
  } finally { await db.close(); }
});
