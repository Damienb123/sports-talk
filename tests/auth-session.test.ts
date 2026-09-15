import assert from "node:assert/strict";
import { test } from "node:test";
import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";
import { signIn, signOut } from "../lib/auth/flows";

test("real browser and server Supabase clients share login cookies and clear them on logout", async () => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111", aud: "authenticated",
    app_metadata: { provider: "email" }, user_metadata: { username: "fan_one" },
    created_at: "2026-09-08T00:00:00Z", email: "fan@example.test",
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  // HS256 forces getClaims to validate with Auth's /user endpoint. The fake
  // HTTP service below is the only mocked boundary; cookie encoding, parsing,
  // session persistence and claims handling use the installed Supabase SDK.
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt, aud: "authenticated", email: user.email })}.${Buffer.from("test-signature").toString("base64url")}`;
  const jar = new Map<string, string>();
  let validatedOnServer = 0;
  let logouts = 0;
  const fetchAuth: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const credentials = JSON.parse(String(init?.body));
      if (credentials.password !== "correct-password") {
        return Response.json({ code: "invalid_credentials", msg: "Invalid login credentials" }, {
          status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" },
        });
      }
      return Response.json({ user, access_token: token, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: expiresAt });
    }
    if (url.pathname === "/auth/v1/user") {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
      validatedOnServer++;
      return Response.json(user);
    }
    if (url.pathname === "/auth/v1/logout") {
      assert.equal(url.searchParams.get("scope"), "local");
      logouts++;
      return Response.json({});
    }
    assert.fail(`Unexpected auth endpoint: ${url.pathname}`);
  };
  const options = {
    global: { fetch: fetchAuth },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
        for (const cookie of cookies) {
          if (cookie.options.maxAge === 0) jar.delete(cookie.name);
          else jar.set(cookie.name, cookie.value);
        }
      },
    },
  };
  const client = () => createServerClient("https://auth.example.test", "test-publishable-key", options);
  const browser = createBrowserClient("https://auth.example.test", "test-publishable-key", { ...options, isSingleton: false });

  const anonymous = await client().auth.getClaims();
  assert.equal(anonymous.data, null);
  const invalid = await signIn(browser.auth, { email: user.email, password: "wrong-password" });
  assert.deepEqual(invalid, { error: "Email or password is incorrect." });
  assert.equal(jar.size, 0);

  for (let attempt = 0; attempt < 3; attempt++) {
    assert.deepEqual(await signIn(browser.auth, { email: user.email, password: "correct-password" }), { destination: "/games" });
    assert.ok(jar.size > 0);
    const serverRead = await client().auth.getClaims();
    assert.equal(serverRead.error, null);
    assert.equal(serverRead.data?.claims.sub, user.id);
    assert.deepEqual(await signOut(browser.auth), { destination: "/auth/login" });
    assert.equal(jar.size, 0);
    assert.equal((await client().auth.getClaims()).data, null);
  }
  assert.equal(validatedOnServer, 3);
  assert.equal(logouts, 3);
});
