import type { GameSummary } from "@/lib/games/queries";
import { formatGameTime, GAME_STATUS_LABELS, teamName } from "@/lib/games/display";

export function GameSummaryContent({ game }: { game: GameSummary }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{game.league.abbreviation}</span>
        <span className="rounded-full border px-3 py-1 font-medium">{GAME_STATUS_LABELS[game.status]}</span>
      </div>
      <dl className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4">
          <dt className="col-span-2 text-xs uppercase tracking-wide text-muted-foreground">Away</dt>
          <dd className="font-semibold">{teamName(game.away_team)}</dd>
          {game.away_score !== null && (
            <dd className="text-xl font-semibold tabular-nums" aria-label={`Away score: ${game.away_score}`}>{game.away_score}</dd>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4">
          <dt className="col-span-2 text-xs uppercase tracking-wide text-muted-foreground">Home</dt>
          <dd className="font-semibold">{teamName(game.home_team)}</dd>
          {game.home_score !== null && (
            <dd className="text-xl font-semibold tabular-nums" aria-label={`Home score: ${game.home_score}`}>{game.home_score}</dd>
          )}
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        <time dateTime={game.starts_at}>{formatGameTime(game.starts_at)}</time>
      </p>
    </div>
  );
}
