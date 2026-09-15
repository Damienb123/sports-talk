"use client";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";

export default function GamesError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Unable to load games</h1>
      <p role="alert">Please try again. If this continues, sign out and contact support.</p>
      <Button onClick={reset}>Try again</Button>
      <LogoutButton />
    </main>
  );
}
