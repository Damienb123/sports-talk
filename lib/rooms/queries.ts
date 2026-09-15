import type { QueryData, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { GAME_SUMMARY_SELECT, isGameId, requireRelations, type GameSummary } from "../games/queries";

export const HISTORY_LIMIT = 100;

export function historyQuery(supabase: SupabaseClient<Database>, roomId: string) {
  return supabase.from("messages")
    .select("id, room_id, user_id, content, created_at, author:profiles!messages_user_id_fkey(username)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT + 1);
}

export type RoomMessage = QueryData<ReturnType<typeof historyQuery>>[number];
export type LoadedGameRoom = {
  kind: "ready"; game: GameSummary; room: { id: string };
  messages: RoomMessage[]; historyLimited: boolean;
};
export type GameRoomResult = LoadedGameRoom | { kind: "missing-room"; game: GameSummary } | null;

// Two bounded server reads after authentication, independent of message count.
export async function getGameRoom(supabase: SupabaseClient<Database>, gameId: string): Promise<GameRoomResult> {
  if (!isGameId(gameId)) return null;
  const { data, error } = await supabase.from("games")
    .select(`${GAME_SUMMARY_SELECT}, room:game_rooms!game_rooms_game_id_fkey(id)`)
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw new Error("We couldn't load this game room. Please try again.");
  if (!data) return null;
  const game = requireRelations(data);
  if (!data.room) return { kind: "missing-room", game };

  const { data: messages, error: historyError } = await historyQuery(supabase, data.room.id);
  if (historyError) throw new Error("We couldn't load the conversation. Please try again.");
  return {
    kind: "ready", game, room: data.room,
    messages: (messages ?? []).slice(0, HISTORY_LIMIT).reverse(),
    historyLimited: (messages?.length ?? 0) > HISTORY_LIMIT,
  };
}
