import type { GameStatus } from "../supabase/database.types";

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  scheduled: "Scheduled", live: "Live", final: "Final", postponed: "Postponed", cancelled: "Cancelled",
};

export function teamName(team: { name: string; city: string | null }) {
  return [team.city, team.name].filter(Boolean).join(" ");
}

// Explicit UTC keeps server HTML independent of the deployment's timezone.
export function formatGameTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  }).format(new Date(value));
}
