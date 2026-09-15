"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { signOut } from "@/lib/auth/flows";

export function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await signOut(createClient().auth);
      if (result.error) {
        setError(result.error);
        return;
      }
      // A full navigation discards cached authenticated Server Components.
      // replace also keeps this signed-in page out of the current history entry.
      if (result.destination) {
        window.location.replace(result.destination);
      }
    } catch {
      setError("We couldn't sign you out. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={logout} disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? "Signing out..." : "Logout"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
