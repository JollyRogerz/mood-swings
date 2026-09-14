import { describe, it, expect } from "vitest";
import { acknowledgeReveal, isPace, pacing } from "../src/game/pacing";
import { table } from "./helpers";

function revealing() {
  const game = table(3);
  game.players.forEach((p) => (p.connected = true));
  game.lastPlayed = { id: 17, actor: "a", def: "love", originalDef: "love" };
  game.playPauseUntil = 16000;
  return game;
}
describe("shared reading pace", () => {
  it("keeps existing rooms at standard pace and validates untrusted settings", () => {
    expect(pacing().reveal).toBe(6000);
    expect(isPace("quick")).toBe(true);
    for (const bad of ["__proto__", "constructor", null, {}, "instant"])
      expect(isPace(bad)).toBe(false);
    expect(pacing("quick").results).toBeGreaterThan(6000);
  });
  it("waits for every connected human, excludes bots, and leaves the game turn untouched", () => {
    const game = revealing();
    game.players[2].bot = "fly";
    const before = {
      revision: game.revision,
      turn: game.turn,
      index: game.turnIndex,
    };
    expect(acknowledgeReveal(game, "a", 17, 12000)).toBe(true);
    expect(game.playPauseUntil).toBe(16000);
    expect(acknowledgeReveal(game, "b", 17, 12100)).toBe(true);
    expect(game.playPauseUntil).toBe(12220);
    expect({
      revision: game.revision,
      turn: game.turn,
      index: game.turnIndex,
    }).toEqual(before);
  });
  it("ignores stale, duplicate, expired, bot and unseated acknowledgements", () => {
    const game = revealing();
    game.players[2].bot = "normal";
    expect(acknowledgeReveal(game, "a", 16, 12000)).toBe(false);
    expect(acknowledgeReveal(game, "outsider", 17, 12000)).toBe(false);
    expect(acknowledgeReveal(game, "c", 17, 12000)).toBe(false);
    expect(acknowledgeReveal(game, "a", 17, 12000)).toBe(true);
    expect(acknowledgeReveal(game, "a", 17, 12001)).toBe(false);
    expect(acknowledgeReveal(game, "b", 17, 16000)).toBe(false);
    expect(game.revealReady).toEqual(["a"]);
    expect(game.playPauseUntil).toBe(16000);
  });
  it("keeps the full result sequence when a final-card reveal ends early", () => {
    const game = revealing();
    game.roundPauseUntil = 25000;
    game.players[1].connected = game.players[2].connected = false;
    acknowledgeReveal(game, "a", 17, 12000);
    expect(game.roundPauseUntil! - game.playPauseUntil!).toBe(9000);
  });
  it("retains a minimum reveal and never lengthens its deadline", () => {
    const game = revealing();
    game.players[1].connected = game.players[2].connected = false;
    acknowledgeReveal(game, "a", 17, 10100);
    expect(game.playPauseUntil).toBe(11200);
    const almostDone = revealing();
    almostDone.players[1].connected = almostDone.players[2].connected = false;
    acknowledgeReveal(almostDone, "a", 17, 15980);
    expect(almostDone.playPauseUntil).toBe(16000);
  });
});
