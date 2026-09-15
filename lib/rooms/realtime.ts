import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Message } from "../supabase/database.types";
import { historyQuery, HISTORY_LIMIT, type RoomMessage } from "./queries";

export function mergeMessages(roomId: string, ...lists: RoomMessage[][]): RoomMessage[] {
  const rows = new Map<string, RoomMessage>();
  for (const list of lists) for (const row of list) {
    if (row.room_id !== roomId) continue;
    const previous = rows.get(row.id);
    rows.set(row.id, { ...row, author: row.author?.username ? row.author : previous?.author ?? row.author });
  }
  const fraction = (time: string) => (time.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6);
  return [...rows.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    || fraction(a.created_at).localeCompare(fraction(b.created_at))
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(-HISTORY_LIMIT);
}

export type LiveState = "connecting" | "live" | "unavailable";
let subscriptionSequence = 0;
export function subscribeToRoom(
  client: SupabaseClient<Database>, roomId: string,
  receive: (messages: RoomMessage[]) => void, status: (state: LiveState) => void,
) {
  let active = true;
  const controller = new AbortController();
  const inFlight = new Set<string>();
  // removeChannel is async; a rapid remount must not reuse the leaving channel
  // (the singleton SDK caches channels by topic).
  const channel = client.channel(`game-room:${roomId}:${++subscriptionSequence}`);
  channel.on<Message>("postgres_changes", {
    event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}`,
  }, async ({ new: row }) => {
    if (!active || row.room_id !== roomId || !row.id || inFlight.has(row.id)) return;
    if (typeof row.content !== "string" || typeof row.user_id !== "string" || !Number.isFinite(Date.parse(row.created_at))) return;
    inFlight.add(row.id);
    try {
      const { data, error } = await client.from("messages")
        .select("id, room_id, user_id, content, created_at, author:profiles!messages_user_id_fkey(username)")
        .eq("room_id", roomId).eq("id", row.id).abortSignal(controller.signal).maybeSingle();
      if (!active) return;
      // The event is a persisted row delivered under Realtime's RLS checks.
      // If display lookup fails, retain that row with the existing neutral label.
      receive([!error && data ? data : { ...row, author: { username: "" } }]);
    } catch {
      if (active) receive([{ ...row, author: { username: "" } }]);
    } finally { inFlight.delete(row.id); }
  }).subscribe(state => {
    if (!active) return;
    if (state === "SUBSCRIBED") {
      status("live");
      // A single bounded read closes the initial subscribe gap and recovers the
      // latest window after SDK reconnection, without polling or custom retries.
      void (async () => {
        try {
          const { data, error } = await historyQuery(client, roomId).abortSignal(controller.signal);
          if (active && !error && data) receive(data.slice(0, HISTORY_LIMIT));
          else if (active && error) status("unavailable");
        } catch { if (active) status("unavailable"); }
      })();
    } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") status("unavailable");
  });
  return () => {
    active = false;
    controller.abort();
    void client.removeChannel(channel).catch(() => { /* Already unavailable; no UI after unmount. */ });
  };
}
