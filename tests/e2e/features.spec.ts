import { test, expect } from "@playwright/test";
import jsQR from "jsqr";

test.use({ hasTouch: true });

test("invites encode only the room URL and support sharing, cancellation, and clipboard fallback", async ({
  page,
  browserName,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (
      browserName === "webkit" &&
      e.message === "Wrong protocol for WebSocket '[object Object]'" &&
      e.stack?.includes("connect")
    )
      return;
    errors.push(e.message);
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as any).sharedInvite = data;
        if ((window as any).cancelShare)
          throw new DOMException("Cancelled", "AbortError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if ((window as any).denyCopy)
            throw new DOMException("Denied", "NotAllowedError");
          (window as any).copiedInvite = text;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("YOUR NAME AT THE TABLE").fill("Invite tester");
  await page.getByRole("button", { name: "Create a table", exact: true }).tap();
  await expect(page.locator(".invite-code")).toBeVisible();
  await page.getByRole("button", { name: "Share invite & QR code" }).tap();
  const dialog = page.getByRole("dialog", {
    name: "Invite friends",
    exact: true,
  });
  const qr = dialog.getByRole("img", { name: /QR code to join room/ });
  await expect(qr).toBeVisible();
  const data = await qr.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const canvas = document.createElement("canvas");
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(el, 0, 0);
    return {
      pixels: Array.from(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      ),
      width: canvas.width,
      height: canvas.height,
    };
  });
  const url = page.url();
  expect(
    jsQR(new Uint8ClampedArray(data.pixels), data.width, data.height)?.data,
  ).toBe(url);
  expect(new URL(url).search).toBe("");
  await dialog.getByRole("button", { name: "Share invite", exact: true }).tap();
  expect(await page.evaluate(() => (window as any).sharedInvite.url)).toBe(url);
  await page.evaluate(() => {
    (window as any).cancelShare = true;
  });
  await dialog.getByRole("button", { name: "Share invite", exact: true }).tap();
  await expect(dialog).not.toContainText("Sharing couldn’t open");
  await dialog.getByRole("button", { name: "Copy link", exact: true }).tap();
  expect(await page.evaluate(() => (window as any).copiedInvite)).toBe(url);
  await page.evaluate(() => {
    (window as any).denyCopy = true;
  });
  await dialog.getByRole("button", { name: "Copied", exact: true }).tap();
  await expect(dialog.getByRole("status")).toContainText("Select the link");
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("invite-phone.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guided practice teaches choices, changing scores and Hurt Feelings through a complete match", async ({
  page,
}, info) => {
  test.setTimeout(120000); // Includes the intentionally paced practice bot turns.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Learn by playing.", exact: false })
    .tap();
  const practice = page.getByRole("dialog", { name: "Guided first game" });
  await expect(practice).toBeVisible();
  await expect(
    practice.getByRole("button", { name: "Play Serenity", exact: true }),
  ).toBeDisabled();
  await practice
    .getByRole("button", { name: "Choose Serenity", exact: true })
    .tap();
  await practice
    .getByRole("button", { name: "Play Serenity", exact: true })
    .tap();
  await practice
    .getByRole("button", { name: "Explain your practice score" })
    .tap();
  const score = page.getByRole("dialog", { name: "Score breakdown" });
  await expect(score.locator(".score-details-total strong")).toHaveText(
    "3POINTS",
  );
  await score.getByRole("button", { name: "Read Serenity", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Serenity card details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close card", exact: true }).tap();
  await expect(
    score.getByRole("button", { name: "Read Serenity", exact: true }),
  ).toBeFocused();
  await score.getByRole("button", { name: "Close score breakdown" }).tap();
  await practice.getByRole("button", { name: "End turn", exact: true }).tap();
  await expect(
    practice.getByRole("heading", { name: "Meet Hurt Feelings" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(practice).toContainText("Ember wins with 6");
  await practice.getByRole("button", { name: "Try the extra play" }).tap();
  await expect(
    practice.getByRole("heading", { name: "Change the table" }),
  ).toBeVisible();
  await expect(practice).toContainText("2 plays available");
  await practice
    .getByRole("button", { name: "Choose Anger", exact: true })
    .tap();
  await practice.getByRole("button", { name: "Play Anger", exact: true }).tap();
  await expect(practice.locator(".effect-notice")).toContainText(
    "3 → 6 points",
  );
  await practice
    .getByRole("button", { name: "Choose Apathy", exact: true })
    .tap();
  await practice
    .getByRole("button", { name: "Confirm Apathy", exact: true })
    .tap();
  await expect(practice.locator(".effect-notice")).toContainText("Discarded");
  await practice
    .getByRole("button", { name: "Choose Love", exact: true })
    .tap();
  await practice.getByRole("button", { name: "Play Love", exact: true }).tap();
  await practice
    .getByRole("button", { name: "Explain your practice score" })
    .tap();
  await expect(score.locator(".score-details-total strong")).toHaveText(
    "7POINTS",
  );
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await score.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  await page.screenshot({
    path: info.outputPath("score-breakdown-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("score-breakdown-phone.png"),
    animations: "disabled",
  });
  await score.getByRole("button", { name: "Close score breakdown" }).tap();
  await practice.getByRole("button", { name: "End turn", exact: true }).tap();
  await practice
    .getByRole("button", { name: "Choose Tranquility", exact: true })
    .tap();
  await practice
    .getByRole("button", { name: "Play Tranquility", exact: true })
    .tap();
  await practice.getByRole("button", { name: "End turn", exact: true }).tap();
  await expect(
    practice.getByRole("heading", { name: "You can pass too" }),
  ).toBeVisible();
  await practice.getByRole("button", { name: "End turn", exact: true }).tap();
  await expect(
    practice.getByRole("heading", { name: "You’ve got a feel for it" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mood-learned"))).toBe(
    "1",
  );
  await page.screenshot({
    path: info.outputPath("practice-complete-phone.png"),
    animations: "disabled",
  });
  await practice.getByRole("button", { name: "Find your next table" }).tap();
  await expect(practice).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Revisit the practice table/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
