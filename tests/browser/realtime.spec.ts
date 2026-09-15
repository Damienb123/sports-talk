import { test, expect, type BrowserContext, type Page, type WebSocketRoute } from "@playwright/test";
import type { Message } from "../../lib/supabase/database.types";

// Only the delivery boundary is emulated. The app uses the installed Realtime
// SDK; every delivered row below is first read from the test PostgreSQL database.
async function delivery(context: BrowserContext) {
  const subscriptions = new Map<string, { socket: WebSocketRoute; join: string; topic: string; filter: string }>();
  await context.routeWebSocket("**/realtime/v1/websocket**", socket => {
    socket.onMessage(raw => {
      const [join, ref, topic, event, payload] = JSON.parse(String(raw));
      const reply = (response: object = {}) => socket.send(JSON.stringify([join, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "phx_join") {
        const changes = payload.config.postgres_changes;
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ event: "INSERT", schema: "public", table: "messages" });
        subscriptions.set(topic, { socket, join, topic, filter: changes[0].filter });
        reply({ postgres_changes: [{ ...changes[0], id: 1 }] });
      } else if (event === "phx_leave") { subscriptions.delete(topic); reply(); }
      else if (event === "heartbeat") reply();
    });
    socket.onClose(() => {
      for (const [topic, subscription] of subscriptions) if (subscription.socket === socket) subscriptions.delete(topic);
    });
  });
  return {
    subscriptions,
    emit(row: Message, force = false) {
      for (const entry of subscriptions.values()) {
        if (!force && entry.filter !== `room_id=eq.${row.room_id}`) continue;
        entry.socket.send(JSON.stringify([entry.join, null, entry.topic, "postgres_changes", {
          ids: [1], data: { schema: "public", table: "messages", type: "INSERT", record: row, old_record: {}, columns: [], commit_timestamp: row.created_at },
        }]));
      }
    },
    fail() {
      for (const entry of subscriptions.values()) entry.socket.send(JSON.stringify([entry.join, null, entry.topic, "phx_error", {}]));
    },
  };
}

async function login(page: Page, email: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
}

test("two sessions receive persisted messages once without receiver refresh, and navigation cleans room channels", async ({ browser, request }) => {
  await request.get("http://127.0.0.1:55331/mode?value=normal");
  const a = await browser.newContext({ baseURL: "http://localhost:3101" });
  const b = await browser.newContext({ baseURL: "http://localhost:3101" });
  try {
    const wireA = await delivery(a); const wireB = await delivery(b);
    const pageA = await a.newPage(); const pageB = await b.newPage();
    await login(pageA, "fan@example.test"); await login(pageB, "fanb@example.test");
    const fixture: { id: string } = await (await request.get("http://127.0.0.1:55331/test-room")).json();
    const room = `/games/${fixture.id}`;
    const receiverReady = pageB.waitForResponse(response => response.url().includes("/rest/v1/messages") && response.request().method() === "GET");
    await pageA.goto(room); await pageB.goto(room);
    expect(await (await receiverReady).json()).toEqual([]);
    await expect.poll(() => wireA.subscriptions.size).toBe(1);
    await expect.poll(() => wireB.subscriptions.size).toBe(1);
    await expect(pageB.getByText("The conversation starts here")).toBeVisible();
    const receiverRequests: string[] = [];
    pageB.on("request", request => { if (new URL(request.url()).pathname.startsWith("/games")) receiverRequests.push(request.url()); });
    const content = "Realtime test A local";
    await pageA.getByRole("textbox").fill(content);
    await pageA.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pageA.getByText("Message sent.", { exact: true })).toBeVisible();
    await expect(pageA.getByText(content, { exact: true })).toHaveCount(1);
    const rows: Message[] = await (await request.get(`http://127.0.0.1:55331/test-messages?content=${encodeURIComponent(content)}`)).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("50000000-0000-4000-8000-000000000001");
    wireA.emit(rows[0]); wireB.emit(rows[0]); wireB.emit(rows[0]);
    await expect(pageB.getByText(content, { exact: true })).toHaveCount(1);
    await expect(pageB.getByText("courtside_fan", { exact: true })).toBeVisible();
    await expect(pageA.getByText(content, { exact: true })).toHaveCount(1);
    expect(receiverRequests).toEqual([]);
    await pageB.getByRole("textbox").fill("Realtime test B local");
    await pageB.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pageB.getByText("Message sent.", { exact: true })).toBeVisible();
    const otherRows: Message[] = await (await request.get("http://127.0.0.1:55331/test-messages?content=Realtime%20test%20B%20local")).json();
    expect(otherRows).toHaveLength(1); expect(otherRows[0].room_id).toBe(rows[0].room_id);
    expect(otherRows[0].user_id).toBe("50000000-0000-4000-8000-000000000002");
    wireA.emit(otherRows[0]); wireB.emit(otherRows[0]);
    await expect(pageA.getByText("Realtime test B local", { exact: true })).toHaveCount(1);
    await expect(pageA.getByText("knicks_fan", { exact: true })).toBeVisible();
    // Client navigation exercises cleanup rather than relying on page teardown.
    await pageB.getByRole("link", { name: "Back to games", exact: true }).click();
    await expect.poll(() => wireB.subscriptions.size).toBe(0);
    await pageB.locator('a[href="/games/30000000-0000-4000-8000-000000000002"]').click();
    await expect.poll(() => wireB.subscriptions.size).toBe(1);
    wireB.emit(rows[0], true); // defensive guard even if the delivery service misroutes
    await expect(pageB.getByRole("region", { name: "Message history" }).getByText(content, { exact: true })).toHaveCount(0);
    await pageB.getByRole("link", { name: "Back to games", exact: true }).click();
    await expect.poll(() => wireB.subscriptions.size).toBe(0);
    await pageB.locator(`a[href="${room}"]`).click();
    await expect.poll(() => wireB.subscriptions.size).toBe(1);
    await expect(pageB.getByText(content, { exact: true })).toHaveCount(1);
    wireB.fail();
    await expect(pageB.getByText("Live updates are unavailable.", { exact: false })).toBeVisible();
    await expect(pageB.getByText(content, { exact: true })).toHaveCount(1);
    await pageB.getByRole("textbox").fill("Send despite channel failure");
    await pageB.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pageB.getByText("Send despite channel failure", { exact: true })).toHaveCount(1);
  } finally { await a.close(); await b.close(); }
});
