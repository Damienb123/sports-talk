import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthApiError, type AuthResponse, type Session, type User } from "@supabase/supabase-js";
import { confirmEmail, signIn, signOut, signUp } from "../lib/auth/flows";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: { username: "fan_one" },
  created_at: "2026-09-08T00:00:00Z",
};
const session: Session = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  user,
};
const input = {
  username: " fan_one ", email: " fan@example.test ",
  password: "test-password", repeatPassword: "test-password",
};
const signedIn = { data: { user, session }, error: null };
const confirmationRequired: AuthResponse = { data: { user, session: null }, error: null };

test("signup sends normalized username metadata, never a profile or client-supplied user ID", async () => {
  let calls = 0;
  const result = await signUp({ signUp: async (credentials) => {
    calls++;
    assert.deepEqual(credentials, {
      email: "fan@example.test", password: input.password,
      options: { data: { username: "fan_one" }, emailRedirectTo: "https://sports.example/auth/confirm" },
    });
    return confirmationRequired;
  } }, input, "https://sports.example");
  assert.equal(calls, 1);
  assert.deepEqual(result, { destination: "/auth/sign-up-success" });
});

test("signup with confirmation disabled uses the returned session", async () => {
  assert.deepEqual(await signUp({ signUp: async () => signedIn }, input, "https://sports.example"), { destination: "/games" });
});

test("invalid usernames, empty credentials and mismatched passwords never reach Auth", async () => {
  const auth = { signUp: async () => { assert.fail("Unexpected signup"); } };
  for (const username of ["", "  ", "ab", "x".repeat(31), "fan name", "fan<script>"]) {
    assert.ok((await signUp(auth, { ...input, username }, "https://sports.example")).error);
  }
  assert.ok((await signUp(auth, { ...input, repeatPassword: "different" }, "https://sports.example")).error);
  assert.ok((await signUp(auth, { ...input, email: " " }, "https://sports.example")).error);
});

test("database signup failures are useful and never expose internal provider messages", async () => {
  const result = await signUp({ signUp: async () => ({
    data: { user: null, session: null },
    error: new AuthApiError("internal SQL details", 500, "unexpected_failure"),
  }) }, input, "https://sports.example");
  assert.match(result.error!, /different username/);
  assert.doesNotMatch(result.error!, /internal SQL/);
  assert.equal(result.destination, undefined);
});

test("login establishes a session and targets games", async () => {
  const result = await signIn({ signInWithPassword: async (credentials) => {
    assert.deepEqual(credentials, { email: "fan@example.test", password: input.password });
    return signedIn;
  } }, input);
  assert.deepEqual(result, { destination: "/games" });
});

test("invalid credentials and unconfirmed email stay on the login screen with clear errors", async () => {
  for (const [code, message] of [
    ["invalid_credentials", "Email or password is incorrect."],
    ["email_not_confirmed", "Please confirm your email before signing in."],
  ]) {
    const result = await signIn({ signInWithPassword: async () => ({
      data: { user: null, session: null }, error: new AuthApiError("provider detail", 400, code),
    }) }, input);
    assert.deepEqual(result, { error: message });
  }
});

test("network failures produce an error for signup, login and logout", async () => {
  const fail = async () => { throw new Error("private detail"); };
  for (const result of [
    await signUp({ signUp: fail }, input, "https://sports.example"),
    await signIn({ signInWithPassword: fail }, input),
    await signOut({ signOut: fail }),
  ]) {
    assert.match(result.error!, /connection/);
    assert.doesNotMatch(result.error!, /private detail/);
    assert.equal(result.destination, undefined);
  }
});

test("logout clears the current session, and failures do not report success", async () => {
  assert.deepEqual(await signOut({ signOut: async (options) => {
    assert.deepEqual(options, { scope: "local" });
    return { error: null };
  } }), { destination: "/auth/login" });
  assert.ok((await signOut({ signOut: async () => ({ error: new AuthApiError("failed", 500, "unexpected_failure") }) })).error);
});

test("confirmation exchanges PKCE code and supports token-hash signup email templates", async () => {
  let exchanges = 0;
  let verifications = 0;
  const auth = {
    exchangeCodeForSession: async (code: string, options?: { flowId?: string }) => {
      exchanges++;
      assert.equal(code, "confirmation-code");
      assert.deepEqual(options, { flowId: "signup-flow" });
      return signedIn;
    },
    verifyOtp: async (credentials: Parameters<Parameters<typeof confirmEmail>[0]["verifyOtp"]>[0]) => {
      verifications++;
      assert.deepEqual(credentials, { type: "email", token_hash: "confirmation-hash" });
      return signedIn;
    },
  };
  assert.equal(await confirmEmail(auth, new URLSearchParams("code=confirmation-code&sb_flow_id=signup-flow&next=https://evil.example")), true);
  assert.equal(await confirmEmail(auth, new URLSearchParams("type=email&token_hash=confirmation-hash")), true);
  for (const params of ["", "type=recovery&token_hash=hash", "type=invite&token_hash=hash", "type=email"]) {
    assert.equal(await confirmEmail(auth, new URLSearchParams(params)), false);
  }
  assert.equal(exchanges, 1);
  assert.equal(verifications, 1);
});

test("expired, reused or failed confirmation links do not establish success", async () => {
  const auth = {
    exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: new AuthApiError("expired", 400, "otp_expired") }),
    verifyOtp: async () => { throw new Error("network error"); },
  };
  assert.equal(await confirmEmail(auth, new URLSearchParams("code=used")), false);
  assert.equal(await confirmEmail(auth, new URLSearchParams("type=signup&token_hash=used")), false);
});
