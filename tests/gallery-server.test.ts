import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { launchServer } from "./server-harness";
it("spectators watch without seats or secrets; the host can seat a bot for an absent friend; results close when everyone is ready", async () => {
  const server = await launchServer();
  try {
    const [ta, tb, tc, td] = [1, 2, 3, 4].map(() => randomUUID());
    const { code } = await server.post("/api/rooms", {
      name: "Alice",
      token: ta,
      visibility: "public",
    });
    const a = await server.join(code, ta, "Alice"),
      b = await server.join(code, tb, "Bob");
    // Watching by choice, from the lobby.
    const c = await server.join(code, tc, "Cara", { spectate: true });
    expect(c.view.spectator).toBe(true);
    expect(c.view.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    await expect.poll(() => a.view.spectators).toBe(1);
    c.room.send("start", { mode: "retail" });
    await expect.poll(() => c.errors.join()).toContain("Spectators can watch");
    expect(a.view.status).toBe("lobby");
    a.room.send("pace", { pace: "quick" });
    a.room.send("start", { mode: "retail" });
    await expect.poll(() => c.view.status).toBe("playing");
    // Arriving after the start means watching, never an error.
    const d = await server.join(code, td, "Dan");
    expect(d.view.spectator).toBe(true);
    await expect.poll(() => a.view.spectators).toBe(2);
    expect(await server.listing()).toMatchObject([
      { code, status: "playing", pace: "quick", spectators: 2, players: 2 },
    ]);
    // The gallery sees the public table only.
    expect(d.view.hand).toEqual([]);
    expect(d.view.playable).toEqual({});
    expect(d.view.prompt).toBeUndefined();
    expect(d.view.players.map((p) => p.handCount)).toEqual([5, 5]);
    // No card from anyone's hand reaches the gallery, under any field.
    const hidden = new Set([...a.view.hand, ...b.view.hand].map((c) => c.uid));
    const seen = [...d.view.hand, ...d.view.moods, ...d.view.discard];
    expect(seen.filter((c) => hidden.has(c.uid))).toEqual([]);
    expect(JSON.stringify(d.view)).not.toContain('"zone":"hand"');
    expect(JSON.stringify(d.view)).not.toContain('"zone":"deck"');
    d.room.send("action", {
      revision: d.view.revision,
      action: { type: "pass" },
    });
    await expect.poll(() => d.errors.join()).toContain("Spectators can watch");
    // Both players pass: the round ends and its results can be closed early.
    for (let i = 0; i < 2; i++) {
      const mover = a.view.active === a.view.you ? a : b;
      const revision = mover.view.revision;
      mover.room.send("action", { revision, action: { type: "pass" } });
      await expect.poll(() => a.view.revision).toBeGreaterThan(revision);
    }
    await expect.poll(() => a.view.lastRound?.round).toBe(1);
    await expect.poll(() => a.view.history?.length).toBe(1);
    expect(a.view.roundPauseMs).toBeGreaterThan(4000);
    d.room.send("results-ready", { round: 1 });
    a.room.send("results-ready", { round: 1 });
    await expect.poll(() => a.view.resultsReady).toEqual([a.view.you]);
    expect(a.view.roundPauseMs).toBeGreaterThan(3000);
    b.room.send("results-ready", { round: 1 });
    await expect.poll(() => b.view.resultsReady?.length).toBe(2);
    expect(b.view.roundPauseMs).toBeLessThanOrEqual(2500);
    // A present friend cannot be replaced; an absent one can, and gets the seat back.
    const bob = b.view.you;
    a.room.send("seat-bot", { id: bob });
    await expect.poll(() => a.errors.join()).toContain("still at the table");
    await b.room.leave();
    await expect
      .poll(() => a.view.players.find((p) => p.id === bob)?.connected)
      .toBe(false);
    d.room.send("seat-bot", { id: bob });
    await expect.poll(() => d.errors.length).toBe(2);
    a.room.send("seat-bot", { id: bob });
    await expect
      .poll(() => a.view.players.find((p) => p.id === bob))
      .toMatchObject({ bot: "normal", substitute: true, connected: true });
    expect(a.view.log.at(-1)!.text).toMatch(/A bot is playing for Bob/);
    const back = await server.join(code, tb, "Bob");
    expect(back.view.spectator).toBe(false);
    expect(back.view.hand.length).toBeGreaterThan(0);
    const seat = back.view.players.find((p) => p.id === bob)!;
    expect(seat.bot).toBeUndefined();
    expect(seat.substitute).toBeUndefined();
    await Promise.all([a, back, c, d].map((x) => x.room.leave()));
  } finally {
    await server.stop();
  }
}, 40000);
