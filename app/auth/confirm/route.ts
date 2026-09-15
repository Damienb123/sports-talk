import { createClient } from "@/lib/supabase/server";
import { confirmEmail } from "@/lib/auth/flows";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  let confirmed = false;
  try {
    const supabase = await createClient();
    confirmed = await confirmEmail(supabase.auth, request.nextUrl.searchParams);
  } catch {
    // Display a safe, actionable failure without putting provider errors or
    // one-time tokens into a redirect URL.
  }
  const response = NextResponse.redirect(
    new URL(confirmed ? "/games" : "/auth/error", request.url),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
