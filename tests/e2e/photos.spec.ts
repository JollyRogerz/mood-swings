import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("a photo earns an automatic badge, stays private, and can be removed", async ({
  page,
  request,
}, info) => {
  await page.goto("/");
  const base = new URL(page.url()).origin;
  const username = `Photo${Date.now().toString(36)}`;
  const headers = { origin: base };
  await page.request.post("/api/auth/sign-in/anonymous", { data: {}, headers });
  await page.request.post("/api/account/username", {
    data: { username },
    headers,
  });
  expect(
    (
      await page.request.post("/api/account/decks", {
        data: { name: "My cards", cards: ["love"] },
        headers,
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/collection");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Ownership photo", { exact: true }).click();
  const buffer = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "green" },
  })
    .jpeg()
    .toBuffer();
  await page
    .getByLabel("Photo for My cards")
    .setInputFiles({ name: "deck.jpg", mimeType: "image/jpeg", buffer });
  await page.getByRole("button", { name: "Submit photo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Photo accepted");
  await expect(page.locator(".deck-photo .photo-badge")).toHaveText(
    "Photo provided",
  );
  const saved = await (
    await page.request.get("/api/account/collection")
  ).json();
  expect(saved.decks[0].verifiedAt).toBeNull();
  expect(
    (
      await request.get(`/api/account/reviews/${saved.decks[0].id}/photo`)
    ).status(),
  ).toBe(401);
  expect((await page.request.get("/api/account/reviews")).status()).toBe(403);
  expect(
    (await (await request.get(`/api/profiles/${username}`)).json()).collection,
  ).toBeNull();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("photo-phone.png") });
  await page.getByRole("button", { name: "Remove photo and badge" }).click();
  await expect(page.locator(".photo-badge")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("removed");
});
