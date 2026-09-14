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
