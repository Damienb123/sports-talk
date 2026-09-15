import Link from "next/link";

export default function GameNotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 md:p-10">
      <h1 className="text-2xl font-semibold">Game not found</h1>
      <p>This game does not exist or is no longer available.</p>
      <Link href="/games" className="underline underline-offset-4">Back to games</Link>
    </main>
  );
}
