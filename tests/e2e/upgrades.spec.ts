import { test, expect, type Page } from "@playwright/test";
const collect = (page: Page, errors: string[]) =>
  page.on("pageerror", (e) => errors.push(e.message));
async function host(page: Page, name: string, visibility?: "public") {
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill(name);
  if (visibility)
    await page.getByLabel("Table visibility").selectOption(visibility);
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(page.locator(".invite-code")).toBeVisible();
  return page.url();
}
test("a public table can be watched from the listing; the gallery sees no hands and the host can seat a bot for a friend who left", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  collect(page, errors);
  const url = await host(page, "Gallery Host", "public");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  collect(friend, errors);
  await friend.goto(url);
  await friend.getByLabel("Your name at the table").fill("Friend");
  await friend.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Friend", { exact: true })).toBeVisible();
  await page.getByLabel("Table pace").selectOption("quick");
  await page.getByLabel("Turn timer").selectOption("relaxed");
  // Someone browsing the home page finds the table, its pace and its timer.
  const watcherContext = await browser.newContext();
  const watcher = await watcherContext.newPage();
  collect(watcher, errors);
  await watcher.goto("/");
  await watcher.getByLabel("Your name at the table").fill("Watcher");
  const listing = watcher
    .locator(".public-room-grid article")
    .filter({ hasText: "Gallery Host’s table" });
  await expect(listing).toBeVisible({ timeout: 20000 });
  await expect(listing.locator(".room-chips")).toContainText("Quick pace");
  await expect(listing.locator(".room-chips")).toContainText("Relaxed timer");
  await listing.getByRole("button", { name: /^Watch/ }).click();
  await expect(watcher.locator(".spectator-bar")).toContainText(
    "You’re watching",
  );
  expect(watcher.url()).toContain("?watch=1");
  await expect(page.locator(".lobby-seat.occupied")).toHaveCount(2);
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(watcher.locator(".board")).toBeVisible();
  await expect(page.locator(".gallery-count")).toContainText("1");
  // The gallery gets the public table: both seats, no hand, nothing to press.
  await expect(watcher.locator(".player-zone")).toHaveCount(2);
  await expect(watcher.locator(".hand-section")).toBeHidden();
  await expect(watcher.locator(".hand-card")).toHaveCount(0);
  await expect(watcher.locator(".end-turn")).toBeHidden();
  await expect(watcher.locator(".toast")).toHaveCount(0);
  // A friend who leaves can be covered by a bot, and takes the seat back.
  await expect(page.locator(".seat-bot")).toHaveCount(0);
  await friendContext.close();
  const seatBot = page.getByRole("button", { name: "Seat a bot for Friend" });
  await expect(seatBot).toBeVisible({ timeout: 15000 });
  await seatBot.click();
  await expect(page.locator(".player-zone")).toContainText("standing in");
  await expect(watcher.locator(".table-feedback")).toContainText(
    /A bot is playing for Friend|played|turn/,
  );
  expect(errors).toEqual([]);
  await watcherContext.close();
});
test("undo, keyboard shortcuts, results ready-up, round history, and colour shapes", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  collect(page, errors);
  await host(page, "Solo");
  await page.getByLabel("Table pace").selectOption("quick");
  await page.getByLabel("Bot difficulty").selectOption("easy");
  await page.getByRole("button", { name: "Add bot", exact: true }).click();
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(page.locator(".board")).toBeVisible();
  // A bot's card can put a decision to this player (Confusion asks for a card
  // to pass), and the turn cannot end until it is answered.
  const answerPrompt = async () => {
    const panel = page.locator(".choice-panel");
    if (!(await panel.count())) return;
    const confirm = panel.locator(".choice-actions .primary");
    if (await confirm.isEnabled().catch(() => false))
      await confirm.click().catch(() => {});
    else
      await panel
        .locator('.choice-options > button[aria-pressed="false"]:enabled')
        .first()
        .click({ timeout: 1000 })
        .catch(() => {});
    const now = page.getByRole("button", { name: "Do it now" });
    if (await now.count()) await now.click().catch(() => {});
  };
  const myTurn = async () => {
    await expect
      .poll(
        async () =>
          (await answerPrompt(), true) &&
          (await page.locator(".played-card-reveal").count()) === 0 &&
          (await page.locator(".round-results").count()) === 0 &&
          (await page.locator(".end-turn").isEnabled()),
        { timeout: 40000 },
      )
      .toBe(true);
  };
  await myTurn();
  // Colour shapes are a saved preference.
  await page.getByRole("button", { name: "Table settings" }).click();
  await page.getByLabel("Colour shapes").check();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-cues", "on");
  const cue = await page
    .locator(".hand-card[data-color]")
    .first()
    .evaluate((el) => getComputedStyle(el, "::after").content);
  expect(cue).toMatch(/[○◆■▲✚]/);
  // Ending a turn with cards still playable can be taken back.
  await page.keyboard.press("e");
  await expect(page.locator(".undo-toast")).toContainText("Ending your turn");
  await expect(page.locator(".end-turn")).toBeDisabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".undo-toast")).toHaveCount(0);
  await expect(page.locator(".end-turn")).toBeEnabled();
  // Number keys pick a card; Escape puts it back; ? opens the shortcut list.
  await page.keyboard.press("1");
  await expect(page.locator(".hand-card.selected")).toHaveCount(1);
  await expect(page.locator(".card-action")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".hand-card.selected")).toHaveCount(0);
  await page.keyboard.press("?");
  const help = page.locator(".help-modal");
  await expect(help).toBeVisible();
  await help.getByText("Keyboard shortcuts").click();
  await expect(help.locator(".shortcut-list kbd").first()).toBeVisible();
  await page.getByRole("button", { name: "Close rules" }).click();
  // Pass through two rounds, readying up to close each result early.
  for (const round of [1, 2]) {
    await myTurn();
    await page.keyboard.press("e");
    await page.getByRole("button", { name: "Do it now" }).click();
    const results = page.getByRole("dialog", {
      name: `Round ${round} results`,
    });
    await expect(results).toBeVisible({ timeout: 40000 });
    const started = Date.now();
    await results.getByRole("button", { name: "I’m ready" }).click();
    await expect(results).toHaveCount(0, { timeout: 6000 });
    expect(Date.now() - started).toBeLessThan(6000);
  }
  // Earlier rounds stay available after a newer one replaces "Last round".
  await myTurn();
  const earlier = page.getByLabel("Earlier rounds");
  await expect(earlier).toBeVisible();
  await earlier.selectOption("1");
  await expect(
    page.getByRole("dialog", { name: "Round 1 recap" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to table" }).click();
  expect(errors).toEqual([]);
});
test("a hidden tab gets a turn notification, and a recap of what it missed on return", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  collect(page, errors);
  await page.addInitScript(() => {
    const notes: { title: string; body?: string }[] = [];
    (window as any).__notes = notes;
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      onclick: (() => void) | null = null;
      constructor(title: string, options?: NotificationOptions) {
        notes.push({ title, body: options?.body });
      }
      close() {}
    }
    (window as any).Notification = FakeNotification;
    let hidden = false;
    Object.defineProperty(document, "hidden", { get: () => hidden });
    (window as any).__setHidden = (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  await host(page, "Busy");
  await page.getByLabel("Table pace").selectOption("quick");
  await page.getByLabel("Bot difficulty").selectOption("easy");
  await page.getByRole("button", { name: "Add bot", exact: true }).click();
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(page.locator(".board")).toBeVisible();
  await page.getByRole("button", { name: "Table settings" }).click();
  await page.getByLabel("Turn notifications").check();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect
    .poll(
      async () =>
        (await page.locator(".played-card-reveal").count()) === 0 &&
        (await page.locator(".end-turn").isEnabled()),
      { timeout: 40000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => (window as any).__notes.length)).toBe(0);
  // Look away, end the turn, and let the bot take its turn.
  await page.locator(".end-turn").click();
  await page.getByRole("button", { name: "Do it now" }).click();
  await page.evaluate(() => (window as any).__setHidden(true));
  await expect
    .poll(() => page.evaluate(() => (window as any).__notes.length), {
      timeout: 60000,
    })
    .toBeGreaterThan(0);
  const note = await page.evaluate(() => (window as any).__notes.at(-1));
  expect(note.title).toMatch(/your turn|needs your decision/i);
  await page.evaluate(() => (window as any).__setHidden(false));
  const recap = page.getByRole("status", { name: "While you were away" });
  await expect(recap).toBeVisible();
  await expect(recap.locator("li").first()).not.toBeEmpty();
  await recap.getByRole("button", { name: "Dismiss recap" }).click();
  await expect(recap).toHaveCount(0);
  expect(errors).toEqual([]);
});
