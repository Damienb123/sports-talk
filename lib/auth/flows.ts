import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = SupabaseClient["auth"];
type AuthFailure = { code?: string; message: string };

export type AuthResult =
  | { destination: "/games" | "/auth/sign-up-success" | "/auth/login"; error?: never }
  | { error: string; destination?: never };

export const USERNAME_PATTERN = "[A-Za-z0-9_]{3,30}";
export const USERNAME_HELP = "Use 3–30 letters, numbers, or underscores.";

function errorMessage(error: AuthFailure, operation: "signup" | "login") {
  switch (error.code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "Please confirm your email before signing in.";
    case "user_already_exists":
    case "email_exists":
      return "Unable to register with these details. Try signing in instead.";
    case "weak_password":
      return "Choose a stronger password that meets the account password requirements.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "signup_disabled":
      return "Registration is currently unavailable. Please try again later.";
    default:
      return operation === "signup"
        ? "We couldn't create your account. Try a different username, or try again later."
        : "We couldn't sign you in. Please try again.";
  }
}

export async function signUp(
  auth: Pick<Auth, "signUp">,
  input: { username: string; email: string; password: string; repeatPassword: string },
  origin: string,
): Promise<AuthResult> {
  const username = input.username.trim();
  if (!new RegExp(`^${USERNAME_PATTERN}$`).test(username)) {
    return { error: USERNAME_HELP };
  }
  if (!input.email.trim() || !input.password) {
    return { error: "Email and password are required." };
  }
  if (input.password !== input.repeatPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const { data, error } = await auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: { username },
        emailRedirectTo: new URL("/auth/confirm", origin).toString(),
      },
    });
    if (error) return { error: errorMessage(error, "signup") };
    // Supabase returns no session when email confirmation is required.
    return { destination: data.session ? "/games" : "/auth/sign-up-success" };
  } catch {
    return { error: "Unable to reach authentication. Check your connection and try again." };
  }
}

export async function signIn(
  auth: Pick<Auth, "signInWithPassword">,
  input: { email: string; password: string },
): Promise<AuthResult> {
  if (!input.email.trim() || !input.password) {
    return { error: "Email and password are required." };
  }
  try {
    const { data, error } = await auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });
    if (error) return { error: errorMessage(error, "login") };
    if (!data.session) return { error: "No session was established. Please sign in again." };
    return { destination: "/games" };
  } catch {
    return { error: "Unable to reach authentication. Check your connection and try again." };
  }
}

export async function signOut(auth: Pick<Auth, "signOut">): Promise<AuthResult> {
  try {
    const { error } = await auth.signOut({ scope: "local" });
    if (error) return { error: "We couldn't sign you out. Please try again." };
    return { destination: "/auth/login" };
  } catch {
    return { error: "We couldn't sign you out. Check your connection and try again." };
  }
}

export async function confirmEmail(
  auth: Pick<Auth, "verifyOtp" | "exchangeCodeForSession">,
  params: URLSearchParams,
): Promise<boolean> {
  try {
    const code = params.get("code");
    if (code) {
      const flowId = params.get("sb_flow_id");
      const { data, error } = await auth.exchangeCodeForSession(
        code, flowId ? { flowId } : undefined,
      );
      return !error && !!data.session;
    }
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    // Only email signup confirmation is supported here, not recovery or invites.
    if (tokenHash && (type === "email" || type === "signup")) {
      const { data, error } = await auth.verifyOtp({ token_hash: tokenHash, type });
      return !error && !!data.session;
    }
    return false;
  } catch {
    return false;
  }
}
