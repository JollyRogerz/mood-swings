import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { table, add } from "../helpers";

test.use({ hasTouch: true });

// A real built server with a known, populated table. All writable state is
// temporary; this fixture never injects data into the configured/live server.
test("populated decisions fit phones and preserve selected targets when played", async ({
  page,
  browser,
  browserName,
}, info) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mood-clarity-"));
  const tokens = [randomUUID(), randomUUID()];
  const ids = tokens.map((token) =>
    createHash("sha256").update(token).digest("hex").slice(0, 24),
  );
  const g = table(4);
  for (let i = 0; i < 2; i++) {
    g.players[i].id = ids[i];
    g.order[i] = ids[i];
  }
  g.host = ids[0];
  g.round = 3;
  g.pace = "relaxed";
  g.players[1].name = "Ember";
  g.lastRound = {
    round: 2,
    scores: { [ids[0]]: 9, [ids[1]]: 12, c: 7, d: 8 },
    winner: ids[1],
    hurtFeelings: "c",
    nextFirst: ids[1],
    order: [...g.order],
  };
  add(g, "anger", "hand", ids[0]);
  add(g, "serenity", "play", ids[0]);
  add(g, "ambivalence", "play", ids[0]);
  add(g, "apathy", "play", ids[1]);
  add(g, "tranquility", "play", ids[1]);
  add(g, "apathy", "play", "c");
  add(g, "discipline", "play", "c");
  add(g, "joy", "play", "d");
  add(g, "ambivalence", "play", "d");
  for (const player of g.players.slice(1)) add(g, "apathy", "hand", player.id);
  await mkdir(path.join(root, ".runtime/rooms"), { recursive: true });
  await writeFile(
    path.join(root, ".runtime/rooms/UXTESTAB.json"),
    JSON.stringify(g),
  );
  await symlink(path.resolve("dist"), path.join(root, "dist"), "dir");
  await symlink(path.resolve("assets"), path.join(root, "assets"), "dir");
  const port = await new Promise<number>((resolve) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1", () => {
      const port = (socket.address() as { port: number }).port;
      socket.close(() => resolve(port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
  delete env.DATABASE_URL;
  let proc: ChildProcess | undefined;
  const context = await browser.newContext();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    // SDK 0.17.43 probes the Node WebSocket constructor inside a try/catch,
    // then uses the browser signature. WebKit reports that caught probe too;
    // the actual connection and all game interactions are asserted below.
    if (
      browserName === "webkit" &&
      e.message === "Wrong protocol for WebSocket '[object Object]'" &&
      e.stack?.includes("connect")
    )
      return;
    errors.push(e.message);
  });
  try {
    proc = spawn(process.execPath, [path.resolve("dist/server.js")], {
      cwd: root,
      env,
      stdio: "pipe",
    });
    let output = "";
    proc.stdout?.on("data", (data) => {
      output += data;
    });
    proc.stderr?.on("data", (data) => {
      output += data;
    });
    await expect
      .poll(async () => {
        if (proc!.exitCode !== null) throw new Error(output);
        try {
          return (await fetch(base + "/api/health")).ok;
        } catch {
          return false;
        }
      })
      .toBe(true);
    await page.addInitScript((token) => {
      localStorage.setItem("mood-session", token);
      localStorage.setItem("mood-name", "Alice");
    }, tokens[0]);
    await page.goto(base + "/room/UXTESTAB");
    await expect(page).toHaveTitle("Your turn · Mood Swings");
    await page
      .getByRole("button", { name: "Your current points", exact: true })
      .tap();
    const scores = page.getByRole("dialog", { name: "Score breakdown" });
    await expect(scores.locator(".score-lines")).toContainText("Serenity");
    await expect(scores.locator(".score-details-total strong")).toHaveText(
      "9POINTS",
    );
    await scores.getByRole("button", { name: "Ember", exact: true }).tap();
    await expect(scores.locator(".score-lines")).toContainText("Tranquility");
    await scores.getByRole("button", { name: "Close score breakdown" }).tap();
    await page.getByRole("button", { name: "Select Anger", exact: true }).tap();
    const panel = page.locator(".card-action");
    await expect(panel.locator(".plan-step")).toBeVisible();
    // Reconnecting a friend changes the revision without ending our turn.
    const friend = await context.newPage();
    await friend.addInitScript((token) => {
      localStorage.setItem("mood-session", token);
      localStorage.setItem("mood-name", "Ember");
    }, tokens[1]);
    await friend.goto(base + "/room/UXTESTAB");
    await expect(friend.locator(".board")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select Anger", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const targets = panel
      .locator(".choice-options > button")
      .filter({ hasText: "Apathy" });
    await targets.nth(0).tap();
    await targets.nth(1).tap();
    await expect(panel.locator(".selection-feedback")).toContainText(
      "8 / 5 points",
    );
    await expect(
      panel.getByRole("button", { name: "Choose (2)", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", { name: "Play mood", exact: true }),
    ).toBeDisabled();
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() => panel.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
        .toBe(true);
      await panel.locator(".selection-feedback").scrollIntoViewIfNeeded();
      const feedback = (await panel
        .locator(".selection-feedback")
        .boundingBox())!;
      expect(feedback.x).toBeGreaterThanOrEqual(0);
      expect(feedback.x + feedback.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: info.outputPath("decision-budget-phone.png"),
      animations: "disabled",
    });
    await targets.nth(1).tap();
    await expect(panel.locator(".selection-feedback")).toContainText(
      "4 / 5 points",
    );
    // Anger may discard itself too. Finishing a play should close the selected
    // card panel even if that same card is now visible in the discard pile.
    await panel
      .getByRole("button", { name: "Anger · Alice · 0", exact: true })
      .tap();
    // Playing directly must apply the highlighted target, without requiring a
    // separate Choose click or silently asking the same question again.
    await panel.getByRole("button", { name: "Play mood", exact: true }).tap();
    await expect(page.locator(".played-card-reveal")).toBeVisible();
    await expect(page.locator(".played-card-reveal")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(page.locator(".board [data-card-name='Apathy']")).toHaveCount(
      1,
    );
    await expect(page.locator(".effect-notice")).toContainText("Discarded");
    await expect(page.locator(".choice-panel")).toHaveCount(0);
    await expect(page.locator(".card-action")).toHaveCount(0);
    await page.getByRole("button", { name: "Review last round" }).tap();
    const recap = page.getByRole("dialog", { name: "Round 2 recap" });
    await expect(
      recap.getByText("FIRST NEXT ROUND", { exact: true }),
    ).toBeVisible();
    await expect(recap.locator(".round-score-list strong")).toHaveText([
      "9",
      "12",
      "7",
      "8",
    ]);
    await page.screenshot({
      path: info.outputPath("recap-phone.png"),
      animations: "disabled",
    });
    await recap.getByRole("button", { name: "Explain Ember’s score" }).tap();
    await expect(scores).toContainText("no detailed breakdown");
    await expect(scores.locator(".score-details-total strong")).toHaveText(
      "12POINTS",
    );
    await scores.getByRole("button", { name: "Close score breakdown" }).tap();
    await recap.getByRole("button", { name: "Back to table" }).tap();
    await expect(recap).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    try {
      await context.close();
      await page.goto("about:blank");
    } finally {
      if (proc && proc.exitCode === null) {
        const stopped = new Promise((resolve) => proc!.once("exit", resolve));
        proc.kill("SIGTERM");
        await stopped;
      }
      await rm(root, { recursive: true, force: true });
    }
  }
});
