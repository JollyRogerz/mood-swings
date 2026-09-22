import { test, expect } from "@playwright/test";
import { catalog } from "../../src/game/catalog";
test("host chooses a saved deck, guests see the source, and the shared game starts", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  const base = new URL(page.url()).origin;
  await page.request.post(base + "/api/auth/sign-in/anonymous", {
    data: {},
    headers: { origin: base },
  });
  await page.request.post(base + "/api/account/username", {
    data: { username: `Host${Date.now().toString(36)}` },
    headers: { origin: base },
  });
  const saved = await page.request.post(base + "/api/account/decks", {
    data: { name: "Pocket deck", cards: catalog.slice(0, 12).map((c) => c.id) },
    headers: { origin: base },
  });
  const deck = await saved.json();
  await page.reload();
  await page.getByLabel("Your name at the table").fill("Collector");
  await page
    .getByRole("button", { name: "Create a table", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Shared deck", exact: true })
    .selectOption(deck.id);
  await expect(page.getByText("Pocket deck", { exact: true })).toBeVisible();
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(page.url());
  await guest.getByLabel("Your name at the table").fill("Guest");
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest.getByText("Pocket deck", { exact: true })).toBeVisible();
  await expect(
    guest.getByRole("combobox", { name: "Shared deck", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start the game", exact: false })
    .click();
  await expect(page.locator(".hand-card")).toHaveCount(5);
  await expect(guest.locator(".hand-card")).toHaveCount(5);
  await ctx.close();
});
