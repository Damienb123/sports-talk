import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { isGameId } from "../games/queries";
import { validateDraft, SEND_FAILURE, type SendResult } from "./composer";

// Server mutation core. Accepts no claimed author or room ID. The session client
// uses ordinary authenticated privileges; PostgreSQL remains the final boundary.
export async function persistMessage(supabase: SupabaseClient<Database>, gameId: unknown, content: unknown): Promise<SendResult> {
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { ok: false, error: "Please sign in to send messages." };
    if (typeof content !== "string") return { ok: false, error: "Write a message before sending." };
    const validation = validateDraft(content);
    if (validation.error) return { ok: false, error: validation.error };
    if (typeof gameId !== "string" || !isGameId(gameId)) return { ok: false, error: "This game is unavailable." };
    const { data: game, error: gameError } = await supabase.from("games")
      .select("id, room:game_rooms!game_rooms_game_id_fkey(id)").eq("id", gameId).maybeSingle();
    if (gameError) return { ok: false, error: "Unable to load this game. Please try again." };
    if (!game) return { ok: false, error: "This game is unavailable." };
    if (!game.room) {
      console.error("Message submission missing game room", { gameId });
      return { ok: false, error: "This game room is unavailable. Please try again later." };
    }
    const { data: message, error } = await supabase.from("messages")
      .insert({ room_id: game.room.id, user_id: auth.user.id, content })
      .select("id").single();
    if (error || !message) {
      console.error("Message insert failed", { gameId });
      return { ok: false, error: error?.code === "42501" ? "You don't have permission to send here. Please sign in again." : SEND_FAILURE };
    }
    return { ok: true };
  } catch {
    console.error("Message submission request failed");
    return { ok: false, error: SEND_FAILURE };
  }
}
