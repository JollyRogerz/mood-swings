import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { table, add } from "../helpers";

test("finished games persist once, appear in a profile, and qualify for the leaderboard", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(path.join(os.tmpdir(), "mood-stats-"));
  let proc: ChildProcess | undefined;
  const friendContext = await browser.newContext();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await mkdir(path.join(root, ".runtime/rooms"), { recursive: true });
    for (const name of ["dist", "assets"])
      await symlink(path.resolve(name), path.join(root, name));
    const port = await new Promise<number>((resolve) => {
      const s = createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), MOOD_ACCOUNTS: "memory" };
    delete env.DATABASE_URL;
    delete env.BETTER_AUTH_URL;
    delete env.RAILWAY_PUBLIC_DOMAIN;
    proc = spawn(process.execPath, [path.resolve("dist/server.js")], {
      cwd: root,
      env,
      stdio: "pipe",
    });
    let logs = "";
    proc.stderr?.on("data", (d) => (logs += d));
    proc.stdout?.on("data", (d) => (logs += d));
    const base = `http://localhost:${port}`;
    await expect
      .poll(async () => {
        if (proc!.exitCode !== null) throw new Error(logs);
        return fetch(base + "/api/health")
          .then((r) => r.ok)
          .catch(() => false);
      })
      .toBe(true);
    await page.goto(base);
    // Real session and profile routes; passkey registration has its own browser tests.
    await page.request.post(base + "/api/auth/sign-in/anonymous", {
      data: {},
      headers: { origin: base },
    });
    await page.request.post(base + "/api/account/username", {
      data: { username: "RecordKeeper" },
      headers: { origin: base },
    });
    const profile = await (
      await page.request.get(base + "/api/account")
    ).json();
    const tokens = [randomUUID(), randomUUID()];
    const ids = tokens.map((t) =>
      createHash("sha256").update(t).digest("hex").slice(0, 24),
    );
    await page.addInitScript((token) => {
      localStorage.setItem("mood-session", token);
      localStorage.setItem("mood-name", "RecordKeeper");
    }, tokens[0]);
    const friend = await friendContext.newPage();
    await friend.addInitScript((token) => {
      localStorage.setItem("mood-session", token);
      localStorage.setItem("mood-name", "Friend");
    }, tokens[1]);
    // Three almost-finished matches keep the test focused on the real finish
    // transition and persistence rather than many minutes of random card play.
    for (let match = 0; match < 3; match++) {
      const code = ["STATSAAA", "STATSBBB", "STATSCCC"][match];
      const g = table();
      g.players.forEach((p, i) => {
        p.id = ids[i];
        p.name = i ? "Friend" : "RecordKeeper";
      });
      g.order = [...ids];
      g.host = ids[0];
      g.players[0].wins = 2;
      g.round = 3;
      g.pace = "quick";
      g.matchAccounts = { [ids[0]]: profile.user.id, [ids[1]]: null };
      add(g, "serenity", "play", ids[0]);
      add(g, "apathy", "hand", ids[0]);
      add(g, "apathy", "hand", ids[1]);
      await writeFile(
        path.join(root, `.runtime/rooms/${code}.json`),
        JSON.stringify(g),
      );
      await page.goto(base + "/room/" + code);
      await friend.goto(base + "/room/" + code);
      for (const player of [page, friend]) {
        await expect(player.locator(".end-turn")).toBeEnabled();
        await player.locator(".end-turn").click();
        await player.getByRole("button", { name: "Do it now" }).click();
      }
      await expect
        .poll(
          async () =>
            (await (await page.request.get(base + "/api/account/stats")).json())
              .games,
        )
        .toBe(match + 1);
      await page.reload();
      expect(
        (await (await page.request.get(base + "/api/account/stats")).json())
          .games,
      ).toBe(match + 1);
    }
    await page.goto(base);
    await page.getByRole("button", { name: "Your profile" }).click();
    const stats = page.getByRole("region", { name: "Your game statistics" });
    await expect(stats).toContainText("100%");
    await expect(stats).toContainText("Games");
    await page.getByRole("button", { name: "Close profile" }).click();
    await page
      .getByRole("button", { name: "Leaderboard", exact: true })
      .click();
    const leaderboard = page.getByRole("dialog", { name: "Leaderboard" });
    await expect(
      leaderboard.getByRole("row", { name: /1 RecordKeeper 3 3 100%/ }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await leaderboard.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("leaderboard-phone.png") });
    await page.keyboard.press("Escape");
    await expect(leaderboard).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await friendContext.close();
    if (proc && proc.exitCode === null) {
      const stopped = new Promise((r) => proc!.once("exit", r));
      proc.kill("SIGTERM");
      await stopped;
    }
    await rm(root, { recursive: true, force: true });
  }
});
