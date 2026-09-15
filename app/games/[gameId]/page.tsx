import { Suspense } from "react";
import { notFound } from "next/navigation";
import { authenticatedGamesClient } from "@/lib/games/server";
import { getGameRoom } from "@/lib/rooms/queries";
import { GameRoomView, MissingGameRoom } from "@/components/rooms/game-room";

async function GameDetail({ params }: { params: Promise<{ gameId: string }> }) {
  const { supabase } = await authenticatedGamesClient();
  const { gameId } = await params;
  const result = await getGameRoom(supabase, gameId);
  if (!result) notFound();
  if (result.kind === "missing-room") {
    console.error("Missing game room for valid game", { gameId });
    return <MissingGameRoom game={result.game} />;
  }
  return <GameRoomView room={result} />;
}

export default function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  return (
      <Suspense fallback={<main className="mx-auto flex h-dvh max-w-4xl items-center justify-center"><p role="status">Loading game room...</p></main>}>
        <GameDetail params={params} />
      </Suspense>
  );
}
