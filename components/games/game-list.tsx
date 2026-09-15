import Link from "next/link";
import type { GameSummary } from "@/lib/games/queries";
import { teamName } from "@/lib/games/display";
import { GameSummaryContent } from "./game-summary";

export function GameList({ games }: { games: GameSummary[] }) {
  if (games.length === 0) {
    return (
      <div className="rounded-xl border p-6">
        <h2 className="font-semibold">No games yet</h2>
        <p className="mt-2 text-muted-foreground">Check back soon for scheduled games.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {games.map((game) => (
        <li key={game.id}>
          <Link
            href={`/games/${game.id}`}
            aria-label={`View ${teamName(game.away_team)} at ${teamName(game.home_team)}`}
            className="block h-full rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <GameSummaryContent game={game} />
            <p className="mt-4 text-sm font-medium underline underline-offset-4">View game</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
