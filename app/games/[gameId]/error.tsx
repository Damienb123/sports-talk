"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";

export default function GameRoomError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Unable to load this game room</h1>
      <p role="alert">The conversation could not be loaded. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
      <Link href="/games" className="underline underline-offset-4">Back to games</Link>
      <LogoutButton />
    </main>
  );
}
