import { test, expect } from "@playwright/test";

test("table comfort settings persist and support keyboard and mobile use", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const settings = page.getByRole("button", {
    name: "Table settings",
    exact: true,
  });
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Table settings" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Sound effects" }),
  ).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "Sound effects" }).check();
  await dialog.getByLabel("Effects volume").fill("55");
  await dialog.getByLabel("Card motion").selectOption("reduced");
  await expect(page.locator(".app")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await page.reload();
  await settings.click();
  await expect(
    dialog.getByRole("checkbox", { name: "Sound effects" }),
  ).toBeChecked();
  await expect(dialog.getByLabel("Effects volume")).toHaveValue("55");
  await expect(dialog.getByLabel("Card motion")).toHaveValue("reduced");
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "output/playwright/comfort-mobile.png" });
  await dialog.getByRole("button", { name: "Close settings" }).click();
  expect(errors).toEqual([]);
});

test("catalog keyboard navigation restores nested focus and recovers an empty search", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "The cards", exact: true });
  await trigger.click();
  const catalog = page.getByRole("dialog", {
    name: "Card catalog",
    exact: true,
  });
  const close = catalog.getByRole("button", { name: "Close catalog" });
  await expect(close).toBeFocused();
  await page.getByLabel("Search cards").fill("Love");
  const card = catalog.locator(".catalog-grid > button");
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(card).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await card.focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("dialog", { name: "Love card details" });
  await expect(
    details.getByRole("button", { name: "Close card", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(card).toBeFocused();
  await expect(catalog).toBeVisible();
  await page.getByLabel("Search cards").fill("no-such-mood-123");
  await expect(
    catalog.getByRole("heading", { name: "No moods found." }),
  ).toBeVisible();
  await catalog.getByRole("button", { name: "Show all cards" }).click();
  await expect(catalog.locator(".catalog-grid > button")).toHaveCount(133);
  await expect(page.getByLabel("Search cards")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(catalog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
