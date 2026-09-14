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
    // Browsing must not consume the create/join rate allowance.
    for (let i = 0; i < 35; i++)
      expect((await fetch(base + "/api/rooms")).ok).toBe(true);
    const tokenA = randomUUID(),
      tokenB = randomUUID(),
      { code } = await post("/api/rooms", { name: "Alice", token: tokenA });
    let a = await join(code, tokenA, "Alice"),
      b = await join(code, tokenB, "Bob");
    const listing = async () =>
      (await (await fetch(base + "/api/rooms")).json()).rooms;
    expect(await listing()).toEqual([]);
    let denied = "";
    b.room.onMessage("error", (m: string) => {
      denied = m;
    });
    b.room.send("visibility", { visibility: "public" });
    await expect.poll(() => denied).toContain("Only the host");
    expect(await listing()).toEqual([]);
    a.room.send("visibility", { visibility: "public" });
    await expect
      .poll(listing)
      .toEqual([{ code, hostName: "Alice", players: 2, bots: 0 }]);
    a.room.send("add-bot", { difficulty: "easy" });
    await expect.poll(async () => (await listing())[0]?.players).toBe(3);
    const bot = a.view.players.find((p) => p.bot)!;
    a.room.send("add-bot", { difficulty: "normal" });
    await expect.poll(() => a.view.players.length).toBe(4);
    expect(await listing()).toEqual([]);
    a.room.send("remove-bot", { id: bot.id });
    await expect.poll(async () => (await listing())[0]?.players).toBe(3);
    a.room.send("remove-bot", { id: a.view.players.find((p) => p.bot)!.id });
    await expect.poll(() => a.view.players.length).toBe(2);
    await a.room.leave();
    await expect.poll(listing).toEqual([]);
    const returned = await join(code, tokenA, "Alice");
    await expect
      .poll(listing)
      .toEqual([{ code, hostName: "Alice", players: 2, bots: 0 }]);
    returned.room.send("visibility", { visibility: "private" });
    await expect.poll(() => returned.view.visibility).toBe("private");
    expect(await listing()).toEqual([]);
    returned.room.send("visibility", { visibility: "public" });
    await expect.poll(() => returned.view.visibility).toBe("public");
    a = returned;
    a.room.send("start", { mode: "retail" });
    await expect.poll(() => a.view.status).toBe("playing");
    await expect.poll(() => b.view.status).toBe("playing");
    expect(await listing()).toEqual([]);
    const original = a.view.hand.map((c) => c.def),
      active = a.view.active === a.view.you ? a : b;
    const other = active === a ? b : a;
    // Reactions and presence are ephemeral table chatter shared with everyone.
    const reactions: { player: string; emoji: string }[] = [],
      presences: Record<string, string>[] = [];
    other.room.onMessage(
      "reaction",
      (r: { id: number; player: string; emoji: string }) =>
        reactions.push({ player: r.player, emoji: r.emoji }),
    );
    other.room.onMessage("presence", (p: Record<string, string>) =>
      presences.push(p),
    );
    active.room.onMessage("reaction", () => {});
    active.room.onMessage("presence", () => {});
    active.room.send("react", { emoji: "🍕" });
    active.room.send("react", { emoji: "😂" });
    await expect
      .poll(() => reactions)
      .toEqual([{ player: active.view.you, emoji: "😂" }]);
    active.room.send("presence", { state: "holding" });
    await expect
      .poll(() => presences.at(-1))
      .toEqual({ [active.view.you]: "holding" });
    active.room.send("action", {
      revision: active.view.revision,
      action: { type: "pass" },
    });
    await expect.poll(() => presences.at(-1)).toEqual({});
    await expect.poll(() => a.view.active).toBe(other.view.you);
    const round = a.view.round;
    expect(a.view.hand).toHaveLength(5);
    expect(b.view.hand).toHaveLength(5);
    expect(a.view).not.toHaveProperty("deck");
    await stop();
    await launch();
    const resumed = await join(code, tokenA, "Alice");
    expect(resumed.view.visibility).toBe("public");
    expect(await listing()).toEqual([]);
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
