import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function authenticatedGamesClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/auth/login");
  return { supabase, userId: data.claims.sub };
}
