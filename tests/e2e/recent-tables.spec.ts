import { expect, test } from "@playwright/test";

test("a recent table survives a return home and can be reopened or removed on a phone", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Recent tables on this device" }),
  ).toHaveCount(0);
  await page.getByLabel("Your name at the table").fill("Returning player");
  await page.getByLabel("Room code").fill("ZZZZZZZZ");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Table not found");
  expect(
    await page.evaluate(() => localStorage.getItem("mood-recent-tables-v1")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Create a table", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  const code = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Leave table" }).click();
  const recent = page.getByRole("region", {
    name: "Recent tables on this device",
  });
  await expect(recent).toContainText(code);
  await expect(recent).toContainText("a seat may not be available");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mood-recent-tables-v1")!),
    ),
  ).toEqual([code]);

  await page.reload();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(recent).toBeVisible();
  await recent.screenshot({ path: info.outputPath("recent-tables-phone.png") });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await recent.getByRole("button", { name: `Open table ${code}` }).click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/room/${code}`);

  await page.getByRole("button", { name: "Leave table" }).click();
  await recent
    .getByRole("button", { name: `Remove table ${code} from recent tables` })
    .click();
  await expect(recent).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("mood-recent-tables-v1")),
  ).toBeNull();

  await page
    .getByRole("button", { name: "Create a table", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave table" }).click();
  await expect(recent).toBeVisible();
  await recent.getByRole("button", { name: "Clear list" }).click();
  await expect(recent).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("mood-recent-tables-v1")),
  ).toBeNull();
});
