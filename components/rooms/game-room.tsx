import Link from "next/link";
import type { GameSummary } from "@/lib/games/queries";
import type { LoadedGameRoom } from "@/lib/rooms/queries";
import { GAME_STATUS_LABELS, formatGameTime, teamName } from "@/lib/games/display";
import { LogoutButton } from "@/components/logout-button";
import { RealtimeHistory } from "./realtime-history";
import { MessageComposer } from "./message-composer";
import { sendMessage } from "@/app/games/[gameId]/actions";

export function RoomHeader({ game }: { game: GameSummary }) {
  return (
    <header className="shrink-0 border-b bg-muted/30 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <nav aria-label="Game navigation" className="mb-3 flex items-center justify-between gap-3">
        <Link href="/games" className="rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Back to games</Link>
        <LogoutButton />
      </nav>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="text-lg font-semibold">Game Room</h1>
        <span className="text-xs text-muted-foreground">{game.league.abbreviation}</span>
        <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-xs font-medium">{GAME_STATUS_LABELS[game.status]}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[{ side: "Away", team: game.away_team, score: game.away_score }, { side: "Home", team: game.home_team, score: game.home_score }].map(({ side, team, score }) => (
          <div key={side} className="min-w-0">
            <p className="mb-0.5 text-xs text-muted-foreground">{side}</p>
            <div className="flex items-start justify-between gap-2">
              <p className="break-words text-sm font-semibold">{teamName(team)}</p>
              {score !== null && <span aria-label={`${side} score: ${score}`} className="shrink-0 text-lg font-semibold leading-5 tabular-nums">{score}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground"><time dateTime={game.starts_at}>{formatGameTime(game.starts_at)}</time></p>
    </header>
  );
}

export function GameRoomView({ room }: { room: LoadedGameRoom }) {
  return (
    <main className="mx-auto flex h-dvh max-w-4xl flex-col overflow-hidden bg-background md:my-4 md:h-[calc(100dvh-2rem)] md:rounded-xl md:border md:shadow-sm">
      <RoomHeader game={room.game} />
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-6">
        <span aria-hidden="true" className="text-lg text-muted-foreground">#</span>
        <h2 className="text-sm font-semibold">game-chat</h2>
        <p className="ml-auto text-xs text-muted-foreground">Game conversation</p>
      </div>
      <RealtimeHistory key={`history:${room.room.id}`} roomId={room.room.id} initialMessages={room.messages} historyLimited={room.historyLimited} />
      <MessageComposer key={room.room.id} sendAction={sendMessage.bind(null, room.game.id)} />
    </main>
  );
}

export function MissingGameRoom({ game }: { game: GameSummary }) {
  return (
    <main className="mx-auto min-h-dvh max-w-4xl md:my-4 md:rounded-xl md:border">
      <RoomHeader game={game} />
      <div className="space-y-3 p-6" role="alert">
        <h2 className="text-xl font-semibold">This game room is unavailable</h2>
        <p>The game is available, but its conversation could not be opened. Please try again later.</p>
        <Link href="/games" className="inline-block underline underline-offset-4">Return to games</Link>
      </div>
    </main>
  );
}
