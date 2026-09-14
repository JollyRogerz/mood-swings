import { test, expect, type Page, type Locator } from "@playwright/test";

const phone = { width: 390, height: 844 };
test.use({ viewport: phone, isMobile: true, hasTouch: true });

async function fits(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  await expect(async () => {
    const box = (await element.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }).toPass({ timeout: 5000 });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function host(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill("Pocket Player");
  await page.getByRole("button", { name: "Create a table" }).tap();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
}

test("touch catalog stays readable and restores the page after nested inspection", async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (const size of [{ width: 320, height: 568 }, phone]) {
    await page.setViewportSize(size);
    await noOverflow(page);
    for (const label of ["Table settings", "The cards", "How to play"]) {
      const box = (await page
        .getByRole("button", { name: label, exact: true })
        .boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.evaluate(() => scrollTo(0, 250));
  const y = await page.evaluate(() => scrollY);
  // Programmatic activation keeps the initial scroll position for this assertion.
  await page
    .getByRole("button", { name: "The cards" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
  await page.getByLabel("Search cards").fill("Love");
  await page.locator(".catalog-grid > button").tap();
  await expect(page.locator(".card-zoom")).toHaveCount(0);
  const card = page.getByRole("dialog", { name: "Love card details" });
  await fits(page, card);
  expect(
    (await card.locator("img").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(280);
  await page.screenshot({ path: info.outputPath("touch-card.png") });
  // A shorter visible area must still allow the dialog to close and scroll.
  await page.setViewportSize({ width: 390, height: 500 });
  await fits(page, card);
  // Mobile keyboards can shrink only the visual viewport, leaving layout height unchanged.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, "height", {
      configurable: true,
      value: 350,
    });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const box = (await card.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(350);
  await page.evaluate(() => {
    Reflect.deleteProperty(visualViewport!, "height");
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.getByRole("button", { name: "Close card", exact: true }).tap();
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
  await page.getByRole("button", { name: "Close catalog" }).tap();
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
  await page.setViewportSize(phone);
  await page.getByRole("button", { name: "How to play" }).tap();
  await fits(page, page.getByRole("dialog", { name: "How to play" }));
  await page.getByRole("button", { name: "Close rules" }).tap();
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();
  expect(data.display).toBe("standalone");
  for (const icon of data.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/");
  }
  expect(
    (await request.get("/apple-touch-icon.png")).headers()["content-type"],
  ).toContain("image/png");
  expect(errors).toEqual([]);
});

test("four seats support touch, opponent navigation, rotation, reactions, and round results", async ({
  browser,
  page,
}, info) => {
  test.setTimeout(90000);
  await host(page);
  const contexts = [];
  const pages = [page];
  for (const name of ["Maple", "Willow", "Cedar"]) {
    const context = await browser.newContext({
      viewport: phone,
      isMobile: true,
      hasTouch: true,
    });
    contexts.push(context);
    const friend = await context.newPage();
    pages.push(friend);
    await friend.goto(page.url());
    await friend.getByLabel("Your name at the table").fill(name);
    await friend.getByRole("button", { name: "Join", exact: true }).tap();
    await expect(friend.locator(".lobby-seat.occupied")).toHaveCount(
      pages.length,
    );
  }
  await page.getByLabel("Table pace", { exact: true }).selectOption("quick");
  await page.getByRole("button", { name: "Start the game" }).tap();
  await expect(page.locator(".hand-card")).toHaveCount(5);
  await noOverflow(page);
  await fits(page, page.getByRole("navigation", { name: "Opponent scores" }));
  await expect(page.locator(".opponent-overview button")).toHaveCount(3);
  await page.locator(".opponent-overview button").last().tap();
  await expect
    .poll(() => page.locator(".opponent-row").evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(400);
  const lastSeat = page.locator(".opponent-row > .player-zone").last();
  await expect
    .poll(async () => (await lastSeat.boundingBox())!.x)
    .toBeLessThan(70);
  await page.locator(".hand-card").last().tap();
  await expect(page.locator(".card-zoom")).toHaveCount(0);
  await fits(page, page.locator(".card-action"));
  expect(
    await page.locator(".hand-cards").evaluate((e) => e.scrollLeft),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Inspect", exact: true }).tap();
  await fits(page, page.locator(".inspect-modal"));
  await page.getByRole("button", { name: "Close card", exact: true }).tap();
  await page.getByRole("button", { name: "Deselect card", exact: true }).tap();
  await page.getByRole("button", { name: "Show reactions" }).tap();
  await page.getByRole("button", { name: "React 🔥" }).tap();
  await expect(page.locator(".you-label .reaction-bubble")).toHaveText("🔥");
  await expect(page.locator(".reaction-bar")).toBeHidden();
  await page.screenshot({ path: info.outputPath("portrait-table.png") });
  await page.setViewportSize({ width: 844, height: 390 });
  await noOverflow(page);
  await page.locator(".hand-card").first().tap();
  await fits(page, page.locator(".card-action"));
  await page.getByRole("button", { name: "Inspect", exact: true }).tap();
  await fits(page, page.locator(".inspect-modal"));
  await page.getByRole("button", { name: "Close card", exact: true }).tap();
  await page.getByRole("button", { name: "Deselect card", exact: true }).tap();
  await page.getByRole("button", { name: "Show reactions" }).tap();
  await expect(page.getByRole("button", { name: "React 🔥" })).toBeVisible();
  await page.getByRole("button", { name: "Show reactions" }).tap();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("landscape-table.png") });
  await page.setViewportSize({ width: 768, height: 1024 });
  await noOverflow(page);
  await fits(page, page.getByRole("navigation", { name: "Opponent scores" }));
  const rail = (await page.locator(".opponent-row").boundingBox())!;
  expect((await lastSeat.boundingBox())!.width).toBeLessThan(rail.width * 0.55);
  await page.screenshot({
    path: info.outputPath("tablet-table.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await noOverflow(page);
  await page.locator(".hand-card").first().tap();
  await page.getByRole("button", { name: "Inspect", exact: true }).tap();
  await fits(page, page.locator(".inspect-modal"));
  await page.getByRole("button", { name: "Close card", exact: true }).tap();
  await page.getByRole("button", { name: "Deselect card", exact: true }).tap();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => scrollTo(0, 0));
  await noOverflow(page);
  await fits(page, page.getByRole("navigation", { name: "Opponent scores" }));
  await page.setViewportSize(phone);
  for (let turn = 0; turn < 4; turn++) {
    let actor = pages[0];
    await expect
      .poll(async () => {
        for (const p of pages)
          if (await p.locator(".end-turn").isEnabled()) {
            actor = p;
            return true;
          }
        return false;
      })
      .toBe(true);
    await actor.locator(".end-turn").tap();
    await expect(actor.locator(".end-turn")).toBeDisabled();
  }
  const results = page.getByRole("dialog", { name: "Round 1 results" });
  await fits(page, results);
  await expect(results.locator(".round-score-list > div")).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("phone-results.png") });
  await expect(results).toHaveCount(0, { timeout: 15000 });
  await page.getByRole("button", { name: "Review last round" }).tap();
  const recap = page.getByRole("dialog", { name: "Round 1 recap" });
  await fits(page, recap);
  await expect(
    recap.getByText("FIRST NEXT ROUND", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("phone-recap.png") });
  await recap.getByRole("button", { name: "Back to table" }).tap();
  await expect(recap).toHaveCount(0);
  await noOverflow(page);
  for (const context of contexts) await context.close();
});

test("two phones play a card, read the shared reveal, and resolve effects by touch", async ({
  browser,
  page,
}, info) => {
  await host(page);
  const context = await browser.newContext({
    viewport: phone,
    isMobile: true,
    hasTouch: true,
  });
  const friend = await context.newPage();
  await friend.goto(page.url());
  await friend.getByLabel("Your name at the table").fill("Touch Friend");
  await friend.getByRole("button", { name: "Join", exact: true }).tap();
  await expect(page.locator(".lobby-seat.occupied")).toHaveCount(2);
  await page.getByLabel("Table pace", { exact: true }).selectOption("relaxed");
  await page.getByRole("button", { name: "Start the game" }).tap();
  await expect(page.locator(".hand-card")).toHaveCount(5);
  await expect(friend.locator(".hand-card")).toHaveCount(5);
  const actor = (await page.locator(".end-turn").isEnabled()) ? page : friend;
  await actor.locator(".hand-card.playable").first().tap();
  await fits(actor, actor.locator(".card-action"));
  await actor.getByRole("button", { name: "Play mood", exact: true }).tap();
  let sawReveal = false;
  for (let step = 0; step < 30; step++) {
    await expect
      .poll(async () => {
        return (
          (await page.locator(".choice-panel").count()) +
          (await friend.locator(".choice-panel").count()) +
          (await actor.locator(".played-card-reveal").count()) +
          Number(await actor.locator(".end-turn").isEnabled()) +
          Number(
            /’s turn|Round results/.test(
              await actor.locator(".turn-status").innerText(),
            ),
          )
        );
      })
      .toBeGreaterThan(0);
    const reveal = actor.locator(".played-card-reveal");
    if (await reveal.count()) {
      sawReveal = true;
      const id = await reveal.getAttribute("data-play-id");
      for (const p of [page, friend]) {
        await fits(p, p.locator(".played-card-reveal"));
        await expect(p.locator(".end-turn")).toBeDisabled();
      }
      await actor.setViewportSize({ width: 844, height: 390 });
      await fits(actor, reveal);
      await actor.screenshot({ path: info.outputPath("landscape-reveal.png") });
      await actor.setViewportSize(phone);
      await page.getByRole("button", { name: "I’m ready", exact: true }).tap();
      await expect(
        page.getByRole("button", { name: "Ready · waiting for the table" }),
      ).toBeDisabled();
      await friend
        .getByRole("button", { name: "I’m ready", exact: true })
        .tap();
      await expect(
        actor.locator(`.played-card-reveal[data-play-id="${id}"]`),
      ).toHaveCount(0);
      continue;
    }
    const chooser = (await page.locator(".choice-panel").count())
      ? page
      : (await friend.locator(".choice-panel").count())
        ? friend
        : null;
    if (!chooser) break;
    const panel = chooser.locator(".choice-panel");
    await fits(chooser, panel);
    const id = await panel.getAttribute("data-prompt-id");
    const skip = chooser.getByRole("button", { name: "Skip effect" });
    if (await skip.count()) await skip.tap();
    else {
      const min = Number(
        (await panel.locator(":scope > p").innerText()).match(
          /Choose (\d+)/,
        )?.[1] ?? 1,
      );
      for (let n = 0; n < min; n++)
        await panel.locator(".choice-options > button").nth(n).tap();
      await chooser.getByRole("button", { name: /^Confirm/ }).tap();
    }
    await expect(
      chooser.locator(`.choice-panel[data-prompt-id="${id}"]`),
    ).toHaveCount(0);
    await expect(chooser.locator(".toast")).toHaveCount(0);
  }
  expect(sawReveal).toBe(true);
  await noOverflow(page);
  await noOverflow(friend);
  await context.close();
});
