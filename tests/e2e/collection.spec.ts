import { test, expect } from "@playwright/test";
test("a player logs a physical deck and controls its public visibility", async ({
  page,
  request,
}, info) => {
  await page.goto("/");
  const base = new URL(page.url()).origin,
    username = `Binder${Date.now().toString(36)}`;
  await page.request.post(base + "/api/auth/sign-in/anonymous", {
    data: {},
    headers: { origin: base },
  });
  await page.request.post(base + "/api/account/username", {
    data: { username },
    headers: { origin: base },
  });
  await page.reload();
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page.getByRole("link", { name: "Manage my decks" }).click();
  await page.getByRole("button", { name: "Add a deck", exact: true }).click();
  await page.getByLabel("Deck name", { exact: true }).fill("My first deck");
  await page.getByLabel("Find a mood").fill("Love");
  await page.locator(".binder-grid input[type=checkbox]").check();
  await page.getByRole("button", { name: "Save deck", exact: true }).click();
  await expect(page.getByText("1 / 133 moods collected")).toBeVisible();
  expect(
    (await (await request.get(base + `/api/profiles/${username}`)).json())
      .collection,
  ).toBeNull();
  await page.getByLabel("Share my decks and collection publicly").click();
  await expect(
    page.getByLabel("Share my decks and collection publicly"),
  ).toBeChecked();
  await expect
    .poll(
      async () =>
        !!(await (await request.get(base + `/api/profiles/${username}`)).json())
          .collection,
    )
    .toBe(true);
  await page.getByRole("link", { name: "View your public profile" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: username, exact: true }),
  ).toBeVisible();
  await page.getByText("My first deck · 1 moods").click();
  await expect(
    page.getByRole("img", { name: "Love", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("collection-phone.png") });
});
