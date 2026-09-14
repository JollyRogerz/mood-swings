import { test, expect } from "@playwright/test";

test("public tables are discoverable and donations remain optional", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Table visibility")).toHaveValue("private");
  await page.getByLabel("Your name at the table").fill("Community Host");
  await page.getByLabel("Table visibility").selectOption("public");
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(page.getByLabel("Lobby visibility")).toHaveValue("public");
  const context = await browser.newContext();
  const guest = await context.newPage();
  try {
    await guest.goto("/");
    const listing = guest
      .locator(".public-room-grid article")
      .filter({ hasText: "Community Host" });
    await expect(listing).toBeVisible();
    await guest.getByLabel("Your name at the table").fill("Community Guest");
    await listing.getByRole("button", { name: "Join table" }).click();
    await expect(
      guest.getByText("Community Host", { exact: true }),
    ).toBeVisible();
    await expect(guest.getByLabel("Lobby visibility")).toHaveCount(0);
    await guest
      .getByRole("button", { name: "Leave table", exact: true })
      .click();
    await page.getByLabel("Lobby visibility").selectOption("private");
    await guest.reload();
    await expect(
      guest
        .locator(".public-room-grid article")
        .filter({ hasText: "Community Host" }),
    ).toHaveCount(0);
    await guest
      .getByText("Enjoying the table? Support the maintainer ♡")
      .click();
    await expect(guest.locator(".donation-panel code")).toHaveText(
      "0x5e61495C929fC93355f245e5D6A31Bf142e73E69",
    );
    await guest.screenshot({
      path: "output/playwright/community-desktop.png",
      fullPage: true,
    });
    await guest.setViewportSize({ width: 390, height: 844 });
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: "output/playwright/community-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
