import { test, expect } from "@playwright/test";
test("two friends create a table, play a mood, and reconnect", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A little strategy. A lot of feelings.",
    }),
  ).toBeVisible();
  await page.screenshot({ path: "output/playwright/home.png", fullPage: true });
  await page.getByLabel("Your name at the table").fill("Alice");
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  const url = page.url();
  expect(url).toMatch(/room\/[A-Z2-9]{8}$/);
  const context = await browser.newContext();
  const friend = await context.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.goto(url);
  await friend.getByLabel("Your name at the table").fill("Bob");
  await friend.getByRole("button", { name: "Join", exact: true }).click();
  await expect(friend.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByText("Bob", { exact: true })).toBeVisible();
  await expect(friend.getByLabel("Table pace", { exact: true })).toBeDisabled();
  await page.getByLabel("Table pace", { exact: true }).selectOption("relaxed");
  await expect(friend.getByLabel("Table pace", { exact: true })).toHaveValue(
    "relaxed",
  );
  await page.getByLabel("Table pace", { exact: true }).selectOption("standard");
  await expect(friend.getByLabel("Table pace", { exact: true })).toHaveValue(
    "standard",
  );
  await page.screenshot({
    path: "output/playwright/lobby.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(page.locator(".hand-card")).toHaveCount(5);
  await expect(friend.locator(".hand-card")).toHaveCount(5);
  await expect(page.locator(".board")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/table.png",
    fullPage: true,
  });
  const aliceActive = await page.locator(".end-turn").isEnabled();
  const current = aliceActive ? page : friend;
  await current.locator(".hand-card.playable").first().click();
  await current.getByRole("button", { name: "Play mood", exact: true }).click();
  let sawReveal = false;
  // Resolve mandatory decisions and skip optional effects from either player's browser.
  for (let i = 0; i < 30; i++) {
    const a = page.locator(".choice-panel"),
      b = friend.locator(".choice-panel");
    await expect
      .poll(
        async () =>
          (await a.count()) +
          (await b.count()) +
          (await current.locator(".played-card-reveal").count()) +
          (await current
            .getByRole("button", { name: /^(End turn|Continue|Moving on)$/ })
            .isEnabled()
            .then((x) => (x ? 1 : 0))) +
          // The turn may already have ended by itself.
          (/’s turn|Round results/.test(
            await current.locator(".turn-status").innerText(),
          )
            ? 1
            : 0),
      )
      .toBeGreaterThan(0);
    const reveal = current.locator(".played-card-reveal");
    if (await reveal.count()) {
      sawReveal = true;
      const id = await reveal.getAttribute("data-play-id");
      await expect(page.locator(".played-card-reveal")).toBeVisible();
      await expect(friend.locator(".played-card-reveal")).toBeVisible();
      await expect(current.locator(".end-turn")).toBeDisabled();
      const observer = current === page ? friend : page;
      await expect(observer.locator(".played-card-reveal")).toHaveCSS(
        "opacity",
        "1",
      );
      await expect(
        observer.locator(".played-card-reveal > .eyebrow"),
      ).not.toHaveText("YOU PLAYED");
      await observer.screenshot({ path: "output/playwright/played-card.png" });
      // One player cannot skip the other person's reading time.
      await observer
        .getByRole("button", { name: "I’m ready", exact: true })
        .click();
      await expect(
        observer.getByRole("button", { name: "Ready · waiting for the table" }),
      ).toBeDisabled();
      await expect(current.locator(".end-turn")).toBeDisabled();
      await current
        .getByRole("button", { name: "I’m ready", exact: true })
        .click();
      await expect(
        current.locator(`.played-card-reveal[data-play-id="${id}"]`),
      ).toHaveCount(0);
      continue;
    }
    const chooser = (await a.count())
      ? page
      : (await b.count())
        ? friend
        : null;
    if (!chooser) break;
    const promptId = await chooser
      .locator(".choice-panel")
      .getAttribute("data-prompt-id");
    const skip = chooser.getByRole("button", { name: "Skip effect" });
    if (await skip.count()) {
      await skip.click();
    } else {
      const hint = await chooser.locator(".choice-panel>p").innerText();
      const min = Number(hint.match(/Choose (\d+)/)?.[1] ?? 1);
      for (let n = 0; n < min; n++)
        await chooser.locator(".choice-options>button").nth(n).click();
      await chooser.getByRole("button", { name: /^Confirm/ }).click();
    }
    await expect(
      chooser.locator(`.choice-panel[data-prompt-id="${promptId}"]`),
    ).toHaveCount(0);
    await expect(chooser.locator(".toast")).toHaveCount(0);
  }
  expect(sawReveal).toBe(true);
  // With nothing left to play, the turn ends by itself; otherwise end it.
  const endTurn = current.getByRole("button", {
    name: /^(End turn|Continue|Moving on)$/,
  });
  if (await endTurn.isEnabled()) await endTurn.click();
  await expect(endTurn).toBeDisabled();
  await expect
    .poll(async () => await current.locator(".turn-status").innerText(), {
      timeout: 15000,
    })
    .not.toMatch(/Your turn|Moving on/);
  await expect(page.locator(".mood-card")).toHaveCount(
    await friend.locator(".mood-card").count(),
  );
  const aliceCards = await page
    .locator(".hand-card img")
    .evaluateAll((els) => els.map((e) => e.getAttribute("alt")));
  await page.reload();
  await expect(page.locator(".board")).toBeVisible();
  await expect(page.locator(".hand-card")).toHaveCount(aliceCards.length);
  expect(
    await page
      .locator(".hand-card img")
      .evaluateAll((els) => els.map((e) => e.getAttribute("alt"))),
  ).toEqual(aliceCards);
  expect(errors).toEqual([]);
  await context.close();
});
test("catalog search, card inspection, rules, and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "The cards" }).click();
  await expect(page.locator(".catalog-grid>button")).toHaveCount(133);
  await page.getByLabel("Search cards").fill("Love");
  await expect(page.locator(".catalog-grid>button")).toHaveCount(1);
  await page.locator(".catalog-grid>button").hover();
  await expect(page.locator(".card-zoom img")).toHaveAttribute("alt", "Love");
  const zoom = await page.locator(".card-zoom").boundingBox();
  expect(zoom!.width).toBeGreaterThanOrEqual(350);
  expect(zoom!.x + zoom!.width).toBeLessThanOrEqual(1440);
  await page.screenshot({
    path: "output/playwright/card-hover.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".card-zoom")).toHaveCount(0);
  await page.locator(".catalog-grid>button").click();
  await expect(page.locator(".inspect-modal h2")).toHaveText("Love");
  await page.getByRole("button", { name: "Close card", exact: true }).click();
  await page.getByRole("button", { name: "Close catalog" }).click();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.locator(".help-modal")).toBeVisible();
  await page.getByRole("button", { name: "Close rules" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "output/playwright/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("four friends finish a match and return to a rematch lobby", async ({
  browser,
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill("Player One");
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  const url = page.url();
  const contexts = [];
  const pages = [page];
  for (const name of ["Player Two", "Player Three", "Player Four"]) {
    const context = await browser.newContext();
    contexts.push(context);
    const friend = await context.newPage();
    pages.push(friend);
    await friend.goto(url);
    await friend.getByLabel("Your name at the table").fill(name);
    await friend.getByRole("button", { name: "Join", exact: true }).click();
    await expect(
      friend.getByRole("heading", { name: "Good company is on its way." }),
    ).toBeVisible();
  }
  await expect(page.locator(".lobby-seat.occupied")).toHaveCount(4);
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(page.locator(".player-zone")).toHaveCount(3);
  await page.screenshot({
    path: "output/playwright/four-players.png",
    fullPage: true,
  });
  for (let turn = 0; turn < 12; turn++) {
    let actor = pages[0];
    await expect
      .poll(
        async () => {
          for (const p of pages) {
            if (await p.locator(".end-turn").isEnabled()) {
              actor = p;
              return true;
            }
          }
          return false;
        },
        { timeout: 20000 },
      )
      .toBe(true);
    await actor.locator(".end-turn").click();
    if (turn < 11) await expect(actor.locator(".end-turn")).toBeDisabled();
    if (turn === 3) {
      const results = page.getByRole("dialog", { name: "Round 1 results" });
      await expect(results).toBeVisible();
      await expect(results.locator(".round-score-list > div")).toHaveCount(4);
      await expect(
        results.getByRole("heading", { name: /wins the round!/ }),
      ).toBeVisible();
      await expect(
        results.getByText("HURT FEELINGS", { exact: true }),
      ).toBeVisible();
      await expect(
        results.getByText("FIRST NEXT ROUND", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: "output/playwright/round-results.png" });
      await expect(results).toHaveCount(0, { timeout: 15000 });
      const review = page.getByRole("button", { name: "Review last round" });
      await review.click();
      const recap = page.getByRole("dialog", { name: "Round 1 recap" });
      await expect(recap.locator(".round-score-list > div")).toHaveCount(4);
      await expect(
        recap.getByText("HURT FEELINGS", { exact: true }),
      ).toBeVisible();
      await expect(
        recap.getByText("FIRST NEXT ROUND", { exact: true }),
      ).toBeVisible();
      await expect(recap.locator(".round-progress")).toHaveCount(0);
      await page.screenshot({ path: "output/playwright/round-recap.png" });
      await page.keyboard.press("Escape");
      await expect(recap).toHaveCount(0);
      await expect(review).toBeFocused();
    }
  }
  await expect(page.locator(".winner-modal")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Another round of feelings" }).click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  await expect(page.locator(".lobby-seat.occupied")).toHaveCount(4);
  for (const context of contexts) await context.close();
});
test("solo play adds a selectable bot that takes turns and completes the match", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill("Solo player");
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(
    page.getByRole("heading", { name: "Good company is on its way." }),
  ).toBeVisible();
  await page.getByLabel("Bot difficulty").selectOption("fly");
  await page.getByRole("button", { name: "Add bot", exact: true }).click();
  await expect(page.getByText("fly brain bot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Drosophila" }).click();
  await expect(page.locator(".lobby-seat.occupied")).toHaveCount(1);
  await page.getByLabel("Bot difficulty").selectOption("hard");
  await page.getByRole("button", { name: "Add bot", exact: true }).click();
  await expect(page.getByText("hard bot", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start the game" }),
  ).toHaveClass(/attention/);
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(page.locator(".board")).toBeVisible();
  // The opponent's hand shows as card backs; reactions float over the avatar.
  await expect(page.locator(".hand-fan")).toHaveCount(1);
  await expect(page.locator(".hand-fan .card-back.mini")).toHaveCount(5);
  await expect(page.locator(".reaction-bar button")).toHaveCount(8);
  await page.getByRole("button", { name: "React 🔥" }).click();
  await expect(page.locator(".you-label .reaction-bubble")).toHaveText("🔥");
  for (let n = 0; n < 60; n++) {
    await expect
      .poll(
        async () =>
          (await page.locator(".winner-modal").count()) > 0 ||
          (await page.locator(".played-card-reveal").count()) > 0 ||
          (await page.locator(".choice-panel").count()) > 0 ||
          (await page.locator(".end-turn").isEnabled()),
        { timeout: 20000 },
      )
      .toBe(true);
    if (await page.locator(".winner-modal").count()) break;
    const reveal = page.locator(".played-card-reveal");
    if (await reveal.count()) {
      const id = await reveal.getAttribute("data-play-id");
      await expect(
        page.locator(`.played-card-reveal[data-play-id="${id}"]`),
      ).toHaveCount(0);
      continue;
    }
    const panel = page.locator(".choice-panel");
    if (await panel.count()) {
      const promptId = await panel.getAttribute("data-prompt-id");
      const skip = page.getByRole("button", { name: "Skip effect" });
      if (await skip.count()) await skip.click();
      else {
        const hint = await panel.locator(":scope>p").innerText(),
          min = Number(hint.match(/Choose (\d+)/)?.[1] ?? 1);
        for (let i = 0; i < min; i++)
          await panel.locator(".choice-options>button").nth(i).click();
        await page.getByRole("button", { name: /^Confirm/ }).click();
      }
      await expect(
        page.locator(`.choice-panel[data-prompt-id="${promptId}"]`),
      ).toHaveCount(0);
    } else {
      await page.locator(".end-turn").click();
      await expect(page.locator(".end-turn")).toBeDisabled();
    }
    await expect(page.locator(".toast")).toHaveCount(0);
  }
  await expect(page.locator(".winner-modal")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/bot-win.png",
    fullPage: true,
  });
});
