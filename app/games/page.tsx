import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { GameList } from "@/components/games/game-list";
import { authenticatedGamesClient } from "@/lib/games/server";
import { listGames } from "@/lib/games/queries";

async function AuthenticatedGames() {
  const { supabase, userId } = await authenticatedGamesClient();
  const [{ data: profile, error: profileError }, games] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", userId).single(),
    listGames(supabase),
  ]);

  if (profileError || !profile) {
    throw new Error("We couldn't load your account. Please try again.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p>Signed in as <strong>{profile.username}</strong>.</p>
        <LogoutButton />
      </div>
      <GameList games={games} />
    </div>
  );
}

export default function GamesPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 p-6 md:p-10">
      <header>
        <p className="text-sm text-muted-foreground">Sports Talk</p>
        <h1 className="mt-1 text-2xl font-semibold">Games</h1>
        <p className="mt-2 text-sm text-muted-foreground">Games are listed by start time. All times shown in UTC.</p>
      </header>
      <Suspense fallback={<p role="status">Loading games...</p>}>
        <AuthenticatedGames />
      </Suspense>
    </main>
  );
}
