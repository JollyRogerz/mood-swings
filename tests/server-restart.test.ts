import { it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client, type Room } from "@colyseus/sdk";
import type { View } from "../src/game/types";
// Launch the real server in isolated storage, including a full process restart.
it("recovers a private multiplayer match after the server process restarts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mood-restart-"));
  const port = await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  let proc: ChildProcess | undefined;
  async function launch() {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
    delete env.DATABASE_URL;
    proc = spawn(
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
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) return;
      } catch {}
      if (proc.exitCode !== null) throw new Error(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Server startup timed out: " + output);
  }
  async function stop() {
    if (!proc || proc.exitCode !== null) return;
    const done = new Promise<void>((r) => proc!.once("exit", () => r()));
    proc.kill("SIGTERM");
    await done;
    proc = undefined;
  }
  async function post(url: string, body: unknown) {
    const r = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r.ok).toBe(true);
    return r.json();
  }
  async function join(code: string, token: string, name: string) {
    await post(`/api/rooms/${code}/connect`, { token });
    const room = await new Client(base).joinById(code, { token, name });
    room.reconnection.enabled = false;
    let view: View | undefined;
    room.onMessage("view", (v: View) => (view = v));
    room.onMessage("error", () => {});
    room.send("sync");
    await expect.poll(() => !!view).toBe(true);
    return {
      room,
      get view() {
        return view!;
      },
    };
  }
  try {
    await launch();
    const tokenA = randomUUID(),
      tokenB = randomUUID(),
      { code } = await post("/api/rooms", { name: "Alice", token: tokenA });
    const a = await join(code, tokenA, "Alice"),
      b = await join(code, tokenB, "Bob");
    a.room.send("start", { mode: "retail" });
    await expect.poll(() => a.view.status).toBe("playing");
    await expect.poll(() => b.view.status).toBe("playing");
    const original = a.view.hand.map((c) => c.def),
      active = a.view.active === a.view.you ? a : b;
    const other = active === a ? b : a;
    active.room.send("action", {
      revision: active.view.revision,
      action: { type: "pass" },
    });
    await expect.poll(() => a.view.active).toBe(other.view.you);
    const round = a.view.round;
    expect(a.view.hand).toHaveLength(5);
    expect(b.view.hand).toHaveLength(5);
    expect(a.view).not.toHaveProperty("deck");
    await stop();
    await launch();
    const resumed = await join(code, tokenA, "Alice");
    expect(resumed.view.round).toBe(round);
    expect(resumed.view.hand.map((c) => c.def)).toEqual(original);
    expect(resumed.view.active).toBe(other.view.you);
    expect(resumed.view.players).toHaveLength(2);
    const resumedB = await join(code, tokenB, "Bob");
    await expect.poll(() => resumed.view.revision).toBe(resumedB.view.revision);
    const lastActor =
      resumed.view.active === resumed.view.you ? resumed : resumedB;
    lastActor.room.send("action", {
      revision: lastActor.view.revision,
      action: { type: "pass" },
    });
    await expect.poll(() => resumed.view.round).toBe(2);
    expect(resumed.view.roundPauseMs).toBeGreaterThan(0);
    await stop();
    await launch();
    const duringResults = await join(code, tokenA, "Alice");
    const duringResultsB = await join(code, tokenB, "Bob");
    await expect
      .poll(() => duringResults.view.revision)
      .toBe(duringResultsB.view.revision);
    expect(duringResults.view.roundPauseMs).toBeGreaterThan(0);
    const nextActor =
      duringResults.view.active === duringResults.view.you
        ? duringResults
        : duringResultsB;
    let error = "";
    nextActor.room.onMessage("error", (message: string) => {
      error = message;
    });
    nextActor.room.send("action", {
      revision: nextActor.view.revision,
      action: { type: "pass" },
    });
    await expect.poll(() => error).toContain("round results");
    expect(nextActor.view.round).toBe(2);
    await duringResults.room.leave();
    await duringResultsB.room.leave();
  } finally {
    await stop();
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
