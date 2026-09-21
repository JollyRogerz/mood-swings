import { test, expect } from "@playwright/test";

test("a browser rejecting notification permission leaves settings usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: class {
        static permission = "default";
        static async requestPermission() {
          throw new Error("Not supported here");
        }
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Table settings", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Turn notifications" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Turn notifications" }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Create a table", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("unsupported notification construction cannot crash an active table", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  const friendContext = await browser.newContext();
  try {
    const friend = await friendContext.newPage();
    for (const player of [page, friend]) {
      player.on("pageerror", (e) => errors.push(e.message));
      await player.addInitScript(() => {
        localStorage.setItem(
          "mood-preferences",
          JSON.stringify({ notify: true }),
        );
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        (window as any).__notificationAttempts = 0;
        Object.defineProperty(window, "Notification", {
          configurable: true,
          value: class {
            static permission = "granted";
            constructor() {
              (window as any).__notificationAttempts++;
              throw new TypeError("Use a service worker on this browser");
            }
          },
        });
      });
    }
    await page.goto("/");
    await page.getByLabel("Your name at the table").fill("Host");
    await page
      .getByRole("button", { name: "Create a table", exact: true })
      .click();
    await expect(page.locator(".invite-code")).toBeVisible();
    await friend.goto(page.url());
    await friend.getByLabel("Your name at the table").fill("Friend");
    await friend.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page.locator(".lobby-seat.occupied")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Start the game", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as any).__notificationAttempts)) +
          (await friend.evaluate(() => (window as any).__notificationAttempts)),
      )
      .toBeGreaterThan(0);
    await expect(page.locator(".board")).toBeVisible();
    await expect(friend.locator(".board")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await friendContext.close();
  }
});
