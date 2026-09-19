import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { launchServer } from "./server-harness";
// Real server, real sockets, durations shrunk fifty-fold: a Brisk decision is
// half a second and the time bank under a second.
it("the room drains the bank, then ends an idle player's turn", async () => {
  const server = await launchServer({ MOOD_CLOCK_SCALE: "0.02" });
  const { post, join } = server;
  try {
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
    await server.stop();
  }
}, 40000);
