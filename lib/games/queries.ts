import type { QueryData, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export const GAME_SUMMARY_SELECT = `
    id, starts_at, status, home_score, away_score,
    league:leagues!games_league_id_fkey(name, abbreviation),
    home_team:teams!games_home_team_id_fkey(name, city, abbreviation),
    away_team:teams!games_away_team_id_fkey(name, city, abbreviation)
  `;

function gamesQuery(supabase: SupabaseClient<Database>) {
  return supabase.from("games").select(GAME_SUMMARY_SELECT);
}

export type GameSummary = QueryData<ReturnType<typeof gamesQuery>>[number];

export function isGameId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function requireRelations(game: GameSummary) {
  if (!game.home_team || !game.away_team || !game.league) {
    throw new Error("We couldn't load the teams for this game. Please try again.");
  }
  return game;
}

// Called only after page-level authentication, using the existing server client.
export async function listGames(supabase: SupabaseClient<Database>): Promise<GameSummary[]> {
  const { data, error } = await gamesQuery(supabase)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("We couldn't load games. Please try again.");
  return (data ?? []).map(requireRelations);
}

export async function getGame(supabase: SupabaseClient<Database>, gameId: string): Promise<GameSummary | null> {
  if (!isGameId(gameId)) return null;
  const { data, error } = await gamesQuery(supabase).eq("id", gameId).maybeSingle();
  if (error) throw new Error("We couldn't load this game. Please try again.");
  return data ? requireRelations(data) : null;
}
