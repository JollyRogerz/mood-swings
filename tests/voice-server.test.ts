import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { launchServer } from "./server-harness";
it("the room introduces two talking players to each other and nobody else", async () => {
  const server = await launchServer();
  try {
    const [ta, tb, tc, td] = [1, 2, 3, 4].map(() => randomUUID());
    const { code } = await server.post("/api/rooms", {
      name: "Alice",
      token: ta,
    });
    const a = await server.join(code, ta, "Alice"),
      b = await server.join(code, tb, "Bob"),
      c = await server.join(code, tc, "Cara"),
      watcher = await server.join(code, td, "Dan", { spectate: true });
    const inbox = (who: typeof a) => {
      const got: { from: string; data: unknown }[] = [];
      let roster: Record<string, { muted: boolean }> = {};
      who.room.onMessage("rtc", (m) => got.push(m));
      who.room.onMessage("voice", (r) => (roster = r));
      return {
        got,
        get roster() {
          return roster;
        },
      };
    };
    const [ia, ib, ic, iw] = [a, b, c, watcher].map(inbox);
    expect(a.view.voice).toEqual({});
    expect(a.view.ice?.[0].urls[0]).toMatch(/^stun:/);
    expect(watcher.view.ice).toBeUndefined();
    // Joining starts muted unless the player says otherwise.
    a.room.send("voice", { on: true });
    b.room.send("voice", { on: true, muted: false });
    await expect
      .poll(() => ic.roster)
      .toEqual({
        [a.view.you]: { muted: true },
        [b.view.you]: { muted: false },
      });
    expect(iw.roster).toEqual(ic.roster);
    // Spectators cannot join voice.
    watcher.room.send("voice", { on: true });
    await expect.poll(() => watcher.errors.join()).toContain("Spectators");
    // A handshake message reaches only its addressee, rebuilt from known fields.
    const offer = { description: { type: "offer", sdp: "v=0", junk: true } };
    a.room.send("rtc", { to: b.view.you, data: offer, extra: 1 });
    await expect
      .poll(() => ib.got)
      .toEqual([
        {
          from: a.view.you,
          data: { description: { type: "offer", sdp: "v=0" } },
        },
      ]);
    // Not in voice, malformed, or to yourself: dropped.
    a.room.send("rtc", { to: c.view.you, data: offer });
    c.room.send("rtc", { to: a.view.you, data: offer });
    a.room.send("rtc", {
      to: b.view.you,
      data: { description: { type: "x" } },
    });
    a.room.send("rtc", { to: a.view.you, data: offer });
    b.room.send("rtc", { to: a.view.you, data: { candidate: null } });
    await expect
      .poll(() => ia.got)
      .toEqual([{ from: b.view.you, data: { candidate: null } }]);
    expect(ib.got).toHaveLength(1);
    expect(ic.got).toEqual([]);
    expect(iw.got).toEqual([]);
    // Muting and leaving update everyone; a dropped connection leaves voice.
    a.room.send("voice", { on: true, muted: false });
    await expect.poll(() => ic.roster[a.view.you]).toEqual({ muted: false });
    const bob = b.view.you;
    await b.room.leave();
    await expect.poll(() => bob in ic.roster).toBe(false);
    a.room.send("voice", { on: false });
    await expect.poll(() => ic.roster).toEqual({});
    await Promise.all([a, c, watcher].map((x) => x.room.leave()));
  } finally {
    await server.stop();
  }
}, 40000);
