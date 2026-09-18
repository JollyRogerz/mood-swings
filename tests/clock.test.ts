import { describe, expect, it } from "vitest";
import { act, publicView } from "../src/game/engine";
import {
  armClock,
  AWAY_AFTER,
  clockRules,
  clockView,
  expireClock,
  isClock,
  settleClock,
} from "../src/game/clock";
import { timeoutAction } from "../src/game/timeout";
import { add, play, table } from "./helpers";
const live = { humanConnected: true, nothingToDecide: false };
function timed(setting: "relaxed" | "standard" | "brisk" = "standard") {
  const g = table();
  g.clock = setting;
  add(g, "apathy", "hand");
  return g;
}
describe("turn timer with a time bank", () => {
  it("is off by default and validates untrusted settings", () => {
    const g = table();
    armClock(g, 1000, live);
    expect(g.clockState).toBeUndefined();
    expect(clockView(g, 1000).setting).toBe("off");
    expect(isClock("brisk")).toBe(true);
    for (const bad of ["__proto__", "constructor", "instant", null, 5])
      expect(isClock(bad)).toBe(false);
  });
  it("gives the waiting human a fresh allowance and every human a bank", () => {
    const g = timed();
    armClock(g, 1000, live);
    expect(g.clockState).toMatchObject({
      actor: "a",
      startsAt: 1000,
      deadline: 1000 + clockRules("standard").decision,
      overtime: false,
    });
    expect(g.bank).toEqual({ a: 90_000, b: 90_000 });
  });
  it("never runs for bots, exhausted turns, or an empty room", () => {
    const g = timed();
    g.players[0].bot = "easy";
    armClock(g, 1000, live);
    expect(g.clockState).toBeUndefined();
    delete g.players[0].bot;
    armClock(g, 1000, { ...live, nothingToDecide: true });
    expect(g.clockState).toBeUndefined();
    armClock(g, 1000, { ...live, humanConnected: false });
    expect(g.clockState).toBeUndefined();
  });
  it("waits for the reveal and results before it starts", () => {
    const g = timed();
    g.playPauseUntil = 7000;
    g.roundPauseUntil = 16000;
    armClock(g, 1000, live);
    expect(g.clockState!.startsAt).toBe(16000);
    const v = clockView(g, 2000);
    expect(v.startsInMs).toBe(14000);
    expect(v.remainingMs).toBe(clockRules("standard").decision);
  });
  it("starts sooner when everyone is ready early, but never later", () => {
    const g = timed();
    g.playPauseUntil = 7000;
    armClock(g, 1000, live);
    g.playPauseUntil = 2200;
    armClock(g, 2000, live);
    expect(g.clockState!.startsAt).toBe(2200);
    // An unrelated commit (someone reconnects) must not extend the allowance.
    armClock(g, 30_000, live);
    expect(g.clockState!.startsAt).toBe(2200);
    expect(g.clockState!.deadline).toBe(2200 + 45_000);
  });
  it("resets for each decision within the same turn", () => {
    let g = timed();
    armClock(g, 1000, live);
    const first = g.clockState!.key;
    g = play(g, "anger");
    armClock(g, 5000, live);
    expect(g.clockState!.key).not.toBe(first);
    expect(g.clockState!.startsAt).toBe(5000);
  });
  it("drains the bank before timing out, and charges only what was used", () => {
    const g = timed();
    armClock(g, 0, live);
    expect(expireClock(g, 44_999)).toBe("none");
    expect(expireClock(g, 45_000)).toBe("overtime");
    expect(g.clockState).toMatchObject({ overtime: true, deadline: 135_000 });
    expect(clockView(g, 50_000).bank.a).toBe(85_000);
    const before = structuredClone(g);
    const next = act(g, "a", { type: "pass" });
    settleClock(next, before, "a", 65_000);
    expect(next.bank!.a).toBe(70_000);
    expect(next.bank!.b).toBe(90_000);
  });
  it("times out when the bank is empty and marks repeat offenders away", () => {
    const g = timed("brisk");
    armClock(g, 0, live);
    expect(expireClock(g, 25_000)).toBe("overtime");
    expect(expireClock(g, 25_000 + 45_000)).toBe("timeout");
    expect(g.bank!.a).toBe(0);
    expect(g.timeouts!.a).toBe(1);
    expect(g.clockState).toBeUndefined();
    // With no bank left the next expiry is an immediate timeout.
    armClock(g, 100_000, live);
    expect(expireClock(g, 125_000)).toBe("timeout");
    expect(g.timeouts!.a).toBe(AWAY_AFTER);
    expect(clockView(g, 125_000).away).toEqual(["a"]);
    // Away players get the short allowance until they act for themselves.
    g.turn++;
    armClock(g, 130_000, live);
    expect(g.clockState!.budget).toBe(clockRules("brisk").away);
    const next = structuredClone(g);
    settleClock(next, g, "a", 131_000);
    expect(next.timeouts!.a).toBe(0);
  });
  it("tops the bank up a little each round, never past the starting amount", () => {
    const g = timed();
    armClock(g, 0, live);
    g.bank!.a = 10_000;
    g.round = 2;
    g.turn++;
    armClock(g, 1000, live);
    expect(g.bank).toEqual({ a: 30_000, b: 90_000 });
  });
  it("the table skips optional effects, answers mandatory ones, and otherwise ends the turn", () => {
    let g = timed();
    expect(timeoutAction(publicView(g, "a"), 1)).toEqual({ type: "pass" });
    const target = add(g, "apathy", "play", "b");
    g = play(g, "anger");
    const optional = timeoutAction(publicView(g, "a"), 1);
    expect(optional).toMatchObject({ type: "choose", selected: [] });
    const after = act(g, "a", optional);
    expect(after.cards.find((c) => c.uid === target)!.zone).toBe("play");
    let m = timed();
    add(m, "apathy", "hand");
    m = play(m, "bliss");
    expect(m.prompt!.min).toBe(1);
    const forced = timeoutAction(publicView(m, "a"), 1);
    expect(forced.type).toBe("choose");
    expect(() => act(m, "a", forced)).not.toThrow();
  });
});
