import { it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@colyseus/sdk";
import type { View } from "../src/game/types";
// Real server, real sockets, durations shrunk fifty-fold: a Brisk decision is
// half a second and the time bank under a second.
it("the room drains the bank, then ends an idle player's turn", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mood-clock-"));
  const port = await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    MOOD_CLOCK_SCALE: "0.02",
  };
  delete env.DATABASE_URL;
  const proc: ChildProcess = spawn(
    process.execPath,
    [
      "--import",
      path.resolve("node_modules/tsx/dist/loader.mjs"),
      path.resolve("src/server/index.ts"),
    ],
    { cwd: root, env, stdio: "pipe" },
  );
  let output = "";
  proc.stdout?.on("data", (b) => (output += b.toString()));
  proc.stderr?.on("data", (b) => (output += b.toString()));
  const post = async (url: string, body: unknown) => {
    const r = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r.ok).toBe(true);
    return r.json();
  };
  async function join(code: string, token: string, name: string) {
    await post(`/api/rooms/${code}/connect`, { token });
    const room = await new Client(base).joinById(code, { token, name });
    room.reconnection.enabled = false;
    let view: View | undefined;
    const errors: string[] = [];
    room.onMessage("view", (v: View) => (view = v));
    room.onMessage("error", (m: string) => errors.push(m));
    room.onMessage("presence", () => {});
    room.onMessage("reaction", () => {});
    room.send("sync");
    await expect.poll(() => !!view).toBe(true);
    return {
      room,
      errors,
      get view() {
        return view!;
      },
    };
  }
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      if (proc.exitCode !== null) throw new Error(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    const tokenA = randomUUID(),
      tokenB = randomUUID(),
      { code } = await post("/api/rooms", { name: "Alice", token: tokenA });
    const a = await join(code, tokenA, "Alice"),
      b = await join(code, tokenB, "Bob");
    expect(a.view.clock?.setting).toBe("off");
    b.room.send("clock", { clock: "brisk" });
    await expect.poll(() => b.errors.join()).toContain("Only the host");
    a.room.send("clock", { clock: "nonsense" });
    await expect.poll(() => a.errors.join()).toContain("Choose a timer");
    a.room.send("clock", { clock: "brisk" });
    await expect.poll(() => b.view.clock?.setting).toBe("brisk");
    a.room.send("start", { mode: "retail" });
    await expect.poll(() => a.view.status).toBe("playing");
    const first = a.view.active!,
      second = a.view.players.find((p) => p.id !== first)!.id;
    expect(a.view.clock).toMatchObject({ actor: first, overtime: false });
    expect(a.view.clock!.bank[first]).toBe(900);
    // Nobody touches anything: decision time, then the bank, then the table acts.
    await expect
      .poll(() => a.view.clock?.overtime, { timeout: 4000 })
      .toBe(true);
    await expect.poll(() => a.view.active, { timeout: 4000 }).toBe(second);
    expect(a.view.clock!.bank[first]).toBe(0);
    expect(a.view.clock!.bank[second]).toBe(900);
    expect(a.view.log.at(-1)!.text).toMatch(
      /ran out of time; their turn ended/,
    );
    expect(a.view.hand).toHaveLength(5);
    expect(a.view.clock).toMatchObject({ actor: second, overtime: false });
    // Acting in time keeps the second player's bank intact.
    const mover = second === a.view.you ? a : b;
    mover.room.send("action", {
      revision: mover.view.revision,
      action: { type: "pass" },
    });
    await expect.poll(() => a.view.round).toBe(2);
    expect(a.view.clock!.bank[second]).toBe(900);
    await a.room.leave();
    await b.room.leave();
  } finally {
    if (proc.exitCode === null) {
      const done = new Promise<void>((r) => proc.once("exit", () => r()));
      proc.kill("SIGTERM");
      await done;
    }
    await rm(root, { recursive: true, force: true });
  }
}, 40000);
