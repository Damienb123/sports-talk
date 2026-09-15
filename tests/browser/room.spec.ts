import { test, expect } from "@playwright/test";

const room = "/games/30000000-0000-4000-8000-000000000003";
test.beforeEach(async ({ page, request }) => {
  await request.get("http://127.0.0.1:55331/mode?value=normal");
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill("fan@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
});

test("seeded history, draft validation, empty room and logout", async ({ page }) => {
  await page.goto(room);
  await expect(page.getByRole("heading", { name: "Game Room", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Messages", exact: true }).locator("li")).toHaveCount(6);
  await expect(page.getByText("courtside_fan", { exact: true }).first()).toBeVisible();
  const input = page.getByRole("textbox", { name: "Message this game room" });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await input.fill("   "); await expect(send).toBeDisabled();
  await input.fill("a".repeat(1001)); await expect(send).toBeDisabled();
  await input.fill("Great game!"); await send.focus(); await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.getByText("Message sent.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Messages", exact: true }).locator("li")).toHaveCount(7);
  await expect(page.getByText("Great game!", { exact: true })).toBeVisible();
  await page.goto("/games/30000000-0000-4000-8000-000000000001");
  await expect(page.getByText("The conversation starts here")).toBeVisible();
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto(room); await expect(page).toHaveURL(/\/auth\/login$/);
});

for (const width of [375, 390, 430, 1280]) {
  test(`scrolling conversation and reachable composer at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await request.get("http://127.0.0.1:55331/mode?value=long");
    await page.goto(room);
    const history = page.getByRole("region", { name: "Message history" });
    await expect(history).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await history.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    const header = await page.getByRole("heading", { name: "Game Room", exact: true }).boundingBox();
    const composer = await page.getByRole("textbox", { name: "Message this game room" }).boundingBox();
    expect(header!.y).toBeGreaterThanOrEqual(0);
    expect(composer!.y + composer!.height).toBeLessThan(844);
    await history.evaluate(el => { el.scrollTop = 0; });
    await expect(page.getByText("Only the latest 100 messages are shown.", { exact: false })).toBeAttached();
    await page.screenshot({ path: testInfo.outputPath(`room-${width}.png`) });
  });
}

test("invalid game, missing room and safe load failure", async ({ page, request }) => {
  await page.goto("/games/invalid"); await expect(page.getByText("Game not found", { exact: true })).toBeVisible();
  await request.get("http://127.0.0.1:55331/mode?value=missing-room"); await page.goto(room);
  await expect(page.getByText("This game room is unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await request.get("http://127.0.0.1:55331/mode?value=error"); await page.goto(room);
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Private database detail");
});

test("first persisted message, pending races, newline behavior and refresh", async ({ page, request }) => {
  await page.goto("/games/30000000-0000-4000-8000-000000000001");
  await expect(page.getByText("The conversation starts here")).toBeVisible();
  const input = page.getByRole("textbox", { name: "Message this game room" });
  await input.fill("First message");
  await input.press("Enter"); await input.press("Shift+Enter");
  await expect(input).toHaveValue("First message\n\n");
  await request.get("http://127.0.0.1:55331/mode?value=slow");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending...", exact: true })).toBeDisabled();
  await expect(input).toHaveValue("First message\n\n");
  await input.evaluate(el => { el.closest("form")!.requestSubmit(); el.closest("form")!.requestSubmit(); });
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.getByRole("list", { name: "Messages", exact: true }).locator("li")).toHaveCount(1);
  await expect(page.getByText("First message", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Messages", exact: true }).locator("li")).toHaveCount(1);
});

test("failed write and expired session retain draft and expose safe feedback", async ({ page, request, context }) => {
  await page.goto(room);
  const input = page.getByRole("textbox", { name: "Message this game room" });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await input.fill("Keep this draft");
  await request.get("http://127.0.0.1:55331/mode?value=write-error");
  await send.click();
  await expect(page.locator("main").getByRole("alert")).toContainText("permission");
  await expect(input).toHaveValue("Keep this draft"); await expect(send).toBeEnabled();
  await expect(page.locator("main")).not.toContainText("Private database detail");
  await request.get("http://127.0.0.1:55331/mode?value=normal");
  await page.route("**/games/*", async route => {
    if (route.request().headers()["next-action"]) await route.abort();
    else await route.continue();
  });
  await send.click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Unable to confirm sending");
  await expect(input).toHaveValue("Keep this draft"); await expect(send).toBeEnabled();
  await page.unroute("**/games/*");
  await context.clearCookies();
  await send.click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Please sign in");
  await expect(input).toHaveValue("Keep this draft"); await expect(send).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`${room}$`));
  await page.reload(); await expect(page).toHaveURL(/\/auth\/login$/);
});
