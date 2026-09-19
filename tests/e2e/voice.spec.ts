import { test, expect, type Page } from "@playwright/test";
// Chromium's fake microphone produces a repeating beep, so two real browsers
// can hold a real peer-to-peer call in CI with no hardware.
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});
const seatBadge = (page: Page, name: string) =>
  page
    .locator(".player-zone, .lobby-seat")
    .filter({ hasText: name })
    .locator(".voice-badge");
test("two friends talk over a direct connection; the gallery cannot join", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill("Alice");
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(page.locator(".invite-code")).toBeVisible();
  const url = page.url();
  const friendContext = await browser.newContext({
    permissions: ["microphone"],
  });
  const friend = await friendContext.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.goto(url);
  await friend.getByLabel("Your name at the table").fill("Bob");
  await friend.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Bob", { exact: true })).toBeVisible();
  // Voice is opt-in, works in the lobby, and you arrive muted.
  await expect(page.locator(".voice-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Join voice chat" }).click();
  await expect(
    page.getByRole("button", { name: "Unmute microphone" }),
  ).toBeVisible();
  await expect(seatBadge(friend, "Alice")).toHaveClass(/muted/);
  await expect(
    friend.getByRole("button", { name: "Join voice chat" }),
  ).toContainText("1 talking");
  await friend.getByRole("button", { name: "Join voice chat" }).click();
  await expect(seatBadge(page, "Bob")).toBeVisible();
  // Once Bob unmutes, Alice hears him: his badge lights up on her screen.
  await friend.getByRole("button", { name: "Unmute microphone" }).click();
  await expect(seatBadge(page, "Bob")).not.toHaveClass(/muted/);
  await expect(seatBadge(page, "Bob")).toHaveClass(/talking/, {
    timeout: 30000,
  });
  await expect(seatBadge(page, "Bob")).not.toHaveClass(/failed|connecting/);
  // Alice is still muted, so Bob never sees her talking.
  await expect(seatBadge(friend, "Alice")).not.toHaveClass(/talking/);
  await page.getByRole("button", { name: "Unmute microphone" }).click();
  await expect(seatBadge(friend, "Alice")).toHaveClass(/talking/, {
    timeout: 30000,
  });
  // The call carries on into the game.
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(friend.locator(".board")).toBeVisible();
  await expect(seatBadge(friend, "Alice")).toHaveClass(/talking/, {
    timeout: 30000,
  });
  // Spectators see who is in voice but get no controls.
  const watcherContext = await browser.newContext();
  const watcher = await watcherContext.newPage();
  await watcher.goto(url + "?watch=1");
  await watcher.getByLabel("Your name at the table").fill("Watcher");
  await watcher.getByRole("button", { name: "Watch this table" }).click();
  await expect(watcher.locator(".spectator-bar")).toBeVisible();
  await expect(watcher.locator(".voice-dock")).toHaveCount(0);
  await expect(watcher.locator(".voice-badge")).toHaveCount(2);
  // Hanging up removes the badge everywhere.
  await friend.getByRole("button", { name: "Leave voice chat" }).click();
  await expect(seatBadge(page, "Bob")).toHaveCount(0);
  await expect(
    friend.getByRole("button", { name: "Join voice chat" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await watcherContext.close();
  await friendContext.close();
});
