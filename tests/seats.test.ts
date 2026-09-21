import { describe, expect, it } from "vitest";
import {
  acknowledgeResults,
  pacing,
  RESULTS_MINIMUM,
} from "../src/game/pacing";
import {
  HISTORY_LIMIT,
  isAbsent,
  reclaimSeat,
  rematchGame,
  recordRound,
  substituteBot,
} from "../src/game/seats";
import { table } from "./helpers";
function playing() {
  const g = table(3);
  g.players.forEach((p) => (p.connected = true));
  return g;
}
describe("bot stand-ins for absent friends", () => {
  it("preserves temporary stand-ins through a rematch and returns their seats", () => {
    const g = playing();
    g.players[1].connected = false;
    substituteBot(g, "a", "b");
    g.players[2].bot = "hard";
    g.status = "finished";
    const next = rematchGame(g, "a", 123, ["a"]);
    expect(next.players[1]).toMatchObject({ bot: "normal", substitute: true });
    expect(reclaimSeat(next, "b")).toBe(true);
    expect(next.players[1].bot).toBeUndefined();
    expect(next.players[2].bot).toBe("hard");
    expect(reclaimSeat(next, "c")).toBe(false);
    const present = rematchGame(g, "a", 123, ["a", "b"]);
    expect(present.players[1].bot).toBeUndefined();
    expect(present.players[1].connected).toBe(true);
    expect(() => rematchGame(g, "b", 123, ["a"])).toThrow("Only the host");
  });
  it("only the host, only mid-game, only for someone who is really gone", () => {
    const g = playing();
    expect(() => substituteBot(g, "b", "c")).toThrow(/Only the host/);
    expect(() => substituteBot(g, "a", "a")).toThrow(/another player/);
    expect(() => substituteBot(g, "a", "zz")).toThrow(/another player/);
    expect(() => substituteBot(g, "a", "c")).toThrow(/still at the table/);
    g.status = "lobby";
    g.players[2].connected = false;
    expect(() => substituteBot(g, "a", "c")).toThrow(/during a game/);
  });
  it("counts a player who keeps timing out as absent", () => {
    const g = playing();
    expect(isAbsent(g, "c")).toBe(false);
    g.timeouts = { c: 2 };
    expect(isAbsent(g, "c")).toBe(true);
    substituteBot(g, "a", "c");
    expect(g.timeouts.c).toBe(0);
  });
  it("keeps the seat intact and hands it back on return", () => {
    const g = playing();
    g.players[1].connected = false;
    g.players[1].wins = 2;
    const revision = g.revision;
    substituteBot(g, "a", "b");
    expect(g.players[1]).toMatchObject({
      id: "b",
      wins: 2,
      bot: "normal",
      substitute: true,
      connected: true,
    });
    expect(g.revision).toBe(revision + 1);
    expect(() => substituteBot(g, "a", "b")).toThrow(/another player/);
    expect(reclaimSeat(g, "b")).toBe(true);
    expect(g.players[1].bot).toBeUndefined();
    expect(g.players[1].substitute).toBeUndefined();
    expect(reclaimSeat(g, "b")).toBe(false);
    // Ordinary bots are never "reclaimed".
    g.players[2].bot = "hard";
    expect(reclaimSeat(g, "c")).toBe(false);
    expect(g.players[2].bot).toBe("hard");
  });
});
describe("round history and closing results early", () => {
  it("remembers each finished round once, up to a limit", () => {
    const before = playing();
    let g = structuredClone(before);
    for (let round = 1; round <= HISTORY_LIMIT + 3; round++) {
      const next = structuredClone(g);
      next.lastRound = { round, scores: { a: round, b: 0, c: 0 }, winner: "a" };
      recordRound(next, g);
      recordRound(next, g);
      g = next;
    }
    expect(g.history).toHaveLength(HISTORY_LIMIT);
    expect(g.history!.at(-1)!.round).toBe(HISTORY_LIMIT + 3);
    const same = structuredClone(g);
    recordRound(same, g);
    expect(same.history).toHaveLength(HISTORY_LIMIT);
  });
  it("waits for every connected human and keeps a minimum on screen", () => {
    const g = playing();
    g.players[2].bot = "easy";
    g.lastRound = { round: 4, scores: {}, winner: "a" };
    const start = 100_000;
    g.roundPauseUntil = start + pacing().results;
    expect(acknowledgeResults(g, "a", 3, start + 500)).toBe(false);
    expect(acknowledgeResults(g, "c", 4, start + 500)).toBe(false);
    expect(acknowledgeResults(g, "zz", 4, start + 500)).toBe(false);
    expect(acknowledgeResults(g, "a", 4, start + 500)).toBe(true);
    expect(acknowledgeResults(g, "a", 4, start + 600)).toBe(false);
    expect(g.roundPauseUntil).toBe(start + pacing().results);
    expect(acknowledgeResults(g, "b", 4, start + 700)).toBe(true);
    expect(g.roundPauseUntil).toBe(start + RESULTS_MINIMUM);
    // Never while the last card of the round is still being revealed.
    const r = playing();
    r.lastRound = { round: 1, scores: {}, winner: "a" };
    r.playPauseUntil = start + 3000;
    r.roundPauseUntil = start + 12_000;
    expect(acknowledgeResults(r, "a", 1, start)).toBe(false);
  });
});
