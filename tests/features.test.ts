import { describe, expect, it } from "vitest";
import {
  act,
  baseScores,
  liveScoreDetails,
  publicView,
} from "../src/game/engine";
import { advanceLesson, createLessonGame, lesson } from "../src/game/tutorial";
import { tableChanges } from "../src/client/effects";
import { add, choose, find, pass, play, settle, table } from "./helpers";

describe("explainable scores", () => {
  it("explains parity and sums adjacent printed dice instead of concatenating them", () => {
    const g = table();
    add(g, "serenity");
    add(g, "love");
    const lines = liveScoreDetails(g).a.lines;
    expect(lines[0].detail).toContain("2 moods in play is even");
    expect(lines[1].detail).toContain("value is 12");
    expect(lines[1].detail).not.toContain("66");
  });
  it("itemizes additive copies, Bliss and suppressed abilities without changing totals", () => {
    const g = table();
    add(g, "apathy");
    add(g, "exhilaration");
    add(g, "creativity", "play", "a", { copy: "exhilaration" });
    add(g, "bliss", "play", "a", { chosenColor: "black" });
    g.suppressions.push({ target: find(g, "exhilaration").uid, round: 1 });
    const d = liveScoreDetails(g).a;
    expect(d.total).toBe(26);
    expect(d.total).toBe(baseScores(g).a);
    expect(d.lines.reduce((s, l) => s + l.points, 0)).toBe(d.total);
    expect(
      d.lines.filter((l) => l.kind === "bonus").map((l) => l.points),
    ).toEqual([6, 6, 8]);
    expect(
      d.lines.find((l) => l.card === find(g, "exhilaration").uid)?.detail,
    ).toContain("Its card text still applies");
  });
  it("explains conditional values, overrides, then suppression in priority order", () => {
    const g = table();
    const patience = add(g, "patience", "play", "a", { entered: 1 });
    add(g, "idealism");
    expect(liveScoreDetails(g).a.lines[0]).toMatchObject({
      points: 5,
      detail: expect.stringContaining("Idealism"),
    });
    g.suppressions.push({ target: patience, round: 1 });
    expect(liveScoreDetails(g).a.lines[0]).toMatchObject({
      points: 0,
      detail: expect.stringContaining("Suppressed"),
    });
  });
  it("records chosen extra scores exactly once and freezes them for recap", () => {
    let g = table();
    const mine = add(g, "apathy"),
      theirs = add(g, "self-loathing", "play", "b");
    add(g, "enthusiasm");
    add(g, "passion");
    add(g, "exhilaration");
    g = pass(pass(g));
    g = choose(g, [mine]);
    expect(publicView(g, "a", true).scoreDetails?.a.total).toBe(12);
    g = choose(g, [theirs]);
    expect(g.lastRound!.scoreDetails!.a.total).toBe(18);
    const saved = JSON.stringify(g.lastRound!.scoreDetails);
    find(g, "apathy").zone = "hand";
    expect(JSON.stringify(g.lastRound!.scoreDetails)).toBe(saved);
    expect(liveScoreDetails(g).a.total).not.toBe(18);
    expect(
      g
        .lastRound!.scoreDetails!.a.lines.filter((l) => l.kind === "bonus")
        .map((l) => l.points),
    ).toEqual([4, 4, 6]);
  });
  it("records score swaps as adjustments and displays final match scores", () => {
    let g = table();
    add(g, "apathy", "play", "b");
    add(g, "love", "play", "b");
    g.players[0].wins = 2;
    g = choose(play(g, "sneakiness"), ["b"]);
    g = settle(pass(pass(g)));
    expect(g.winner).toBe("a");
    const d = publicView(g, "a", true).scoreDetails!;
    for (const p of g.players) {
      expect(d[p.id].total).toBe(g.lastRound!.scores[p.id]);
      expect(d[p.id].lines.reduce((s, l) => s + l.points, 0)).toBe(
        d[p.id].total,
      );
      expect(d[p.id].lines.at(-1)?.label).toBe("Sneakiness");
      expect(
        publicView(g, "a", true).players.find((x) => x.id === p.id)?.score,
      ).toBe(d[p.id].total);
    }
  });
  it("can finish scoring old snapshots without fabricating missing detail", () => {
    let g = table();
    const low = add(g, "charity");
    add(g, "enthusiasm");
    g = pass(pass(g));
    delete g.scoreDetails;
    g = choose(g, [low]);
    const d = g.lastRound!.scoreDetails!.a;
    expect(d.lines[0].label).toBe("Recorded score");
    expect(d.lines.reduce((s, l) => s + l.points, 0)).toBe(d.total);
  });
  it("Awe produces no scoring record and score details expose no private cards", () => {
    let g = table();
    add(g, "love", "hand", "b");
    add(g, "apathy");
    const v = publicView(g, "a", true);
    expect(JSON.stringify(v.scoreDetails)).not.toContain("Love");
    expect(publicView(g, "a").scoreDetails).toBeUndefined();
    g = settle(pass(pass(settle(play(g, "awe")))));
    expect(g.lastRound?.scoreDetails).toBeUndefined();
    expect(g.lastRound?.skippedBy).toBe("awe");
  });
});
describe("public effect feedback", () => {
  it("explains value flips, suppression, restoration, and transfers", () => {
    const g = table();
    const id = add(g, "serenity");
    const before = publicView(g, "a");
    add(g, "apathy");
    const after = publicView(g, "a");
    expect(tableChanges(before, after)[0]).toMatchObject({
      card: id,
      badge: "+3",
      description: "3 → 6 points",
    });
    g.suppressions.push({ target: id, round: 1 });
    const suppressed = publicView(g, "a");
    expect(tableChanges(after, suppressed)[0].description).toBe(
      "Suppressed · 6 → 0 points",
    );
    g.suppressions = [];
    find(g, "serenity").owner = "b";
    expect(
      tableChanges(suppressed, publicView(g, "a"))[0].description,
    ).toContain("Moved to B · Suppression ended");
  });
  it("reports public discards and own returns without guessing another hand", () => {
    const g = table();
    const id = add(g, "apathy", "play", "b");
    const before = publicView(g, "a");
    find(g, "apathy").zone = "hand";
    expect(tableChanges(before, publicView(g, "a"))[0].badge).toBe("Left play");
    find(g, "apathy").owner = "a";
    expect(tableChanges(before, publicView(g, "a"))[0].badge).toBe(
      "To your hand",
    );
    find(g, "apathy").zone = "discard";
    g.discard = [id];
    expect(tableChanges(before, publicView(g, "a"))[0].badge).toBe("Discarded");
  });
  it("ignores reconnect baselines, new played cards, and changes to hidden hands", () => {
    const g = table();
    const before = publicView(g, "a");
    add(g, "love", "hand", "b");
    add(g, "apathy");
    const after = publicView(g, "a");
    expect(tableChanges(before, after)).toEqual([]);
    expect(tableChanges(after, after)).toEqual([]);
  });
});
describe("guided first game", () => {
  it("starts with a unique shared deck and five cards per player", () => {
    const g = createLessonGame();
    expect(g.cards).toHaveLength(45);
    expect(new Set(g.cards.map((c) => c.def)).size).toBe(45);
    for (const p of g.players)
      expect(
        g.cards.filter((c) => c.zone === "hand" && c.owner === p.id),
      ).toHaveLength(5);
    expect(g.deck).toHaveLength(30);
    expect(g.order[0]).toBe("you");
  });
  it("teaches an actual Hurt Feelings turn and reaches three wins using only legal actions", () => {
    let g = createLessonGame();
    for (let i = 0; i < lesson.length; i++) {
      g = advanceLesson(g, i);
      if (i === 5) {
        expect(g.lastRound).toMatchObject({
          scores: { you: 3, ember: 6, fern: 4 },
          hurtFeelings: "you",
          nextFirst: "ember",
        });
      }
      if (i === 8)
        expect(g.grants.map((gr) => gr.label)).toEqual([
          "Your turn",
          "Hurt Feelings",
        ]);
      if (i === 9) expect(baseScores(g).you).toBe(6);
      if (i === 10) {
        expect(find(g, "apathy").zone).toBe("discard");
        expect(g.grants).toHaveLength(1);
      }
      if (i === 11) expect(baseScores(g).you).toBe(7);
      if (i === 16) expect(g.players[0].wins).toBe(2);
    }
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("you");
    expect(g.lastRound!.scores.you).toBe(13);
    expect(() => act(g, "you", { type: "pass" })).toThrow("not in progress");
  });
});
