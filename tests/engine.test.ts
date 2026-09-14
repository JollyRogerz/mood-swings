import { describe, it, expect } from "vitest";
import {
  act,
  addPlayer,
  baseScores,
  canPlay,
  color,
  createGame,
  definition,
  hand,
  inPlay,
  publicView,
  startGame,
  suppressed,
  value,
} from "../src/game/engine";
import { catalog } from "../src/game/catalog";
import { add, choose, find, pass, play, settle, table } from "./helpers";

describe("setup and base rules", () => {
  it("deals five each from a correctly collated shared deck", () => {
    const g = createGame("a", "Alice", 4);
    addPlayer(g, "b", "Bob");
    startGame(g, "a");
    expect(g.cards).toHaveLength(45);
    expect(hand(g, "a")).toHaveLength(5);
    expect(hand(g, "b")).toHaveLength(5);
    expect(g.deck).toHaveLength(35);
    expect(new Set(g.cards.map((c) => c.def)).size).toBe(45);
    const counts: Record<string, number> = {};
    g.cards.forEach(
      (c) =>
        (counts[definition(c).rarity] =
          (counts[definition(c).rarity] ?? 0) + 1),
    );
    expect(counts).toEqual({
      common: 23,
      uncommon: 14,
      rare: 6,
      "mythic rare": 2,
    });
  });
  it("requires the host, two players, and a valid deck", () => {
    const g = createGame("a", "Alice", 1);
    expect(() => startGame(g, "a")).toThrow();
    addPlayer(g, "b", "B");
    expect(() => startGame(g, "b")).toThrow();
    expect(() => startGame(g, "a", "retail", ["apathy"])).toThrow();
  });
  it("keeps seating clockwise when choosing a random first player", () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = createGame("a", "A", seed);
      for (const p of ["b", "c", "d"]) addPlayer(g, p, p);
      startGame(g, "a");
      expect(["abcd", "bcda", "cdab", "dabc"]).toContain(g.order.join(""));
    }
  });
  it("is deterministic for a saved seed", () => {
    const a = createGame("a", "A", 9),
      b = createGame("a", "A", 9);
    for (const g of [a, b]) {
      addPlayer(g, "b", "B");
      startGame(g, "a");
    }
    expect(a).toEqual(b);
  });
  it("awards ties to the earlier player and draws only for losers", () => {
    let g = table();
    add(g, "apathy");
    add(g, "boredom", "play", "b");
    add(g, "love", "deck", "");
    g = pass(pass(g));
    expect(g.players[0].wins).toBe(1);
    expect(g.order[0]).toBe("a");
    expect(hand(g, "a")).toHaveLength(0);
    expect(hand(g, "b")).toHaveLength(1);
    expect(inPlay(g)).toHaveLength(2);
    expect(g.round).toBe(2);
  });
  it("finishes at three wins without consolation draws", () => {
    let g = table();
    g.players[0].wins = 2;
    add(g, "apathy");
    add(g, "love", "deck", "");
    g = pass(pass(g));
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("a");
    expect(g.deck).toHaveLength(1);
  });
  it("rejects out of turn, stale and duplicate choices without mutating input", () => {
    let g = table();
    const id = add(g, "anger", "hand");
    const before = structuredClone(g);
    expect(() =>
      act(g, "b", { type: "play", card: id, grant: "base" }),
    ).toThrow();
    expect(g).toEqual(before);
    g = act(g, "a", { type: "play", card: id, grant: "base" });
    expect(() =>
      act(g, "a", { type: "choose", prompt: "old", selected: [] }),
    ).toThrow();
    expect(() => choose(g, [id, id])).toThrow();
  });
  it("gives Hurt Feelings to the latest player tied for lowest", () => {
    let g = table(3);
    add(g, "apathy");
    g = pass(pass(pass(g)));
    expect(g.nextPlays).toContainEqual(
      expect.objectContaining({ player: "c", label: "Hurt Feelings" }),
    );
    expect(g.players[0].wins).toBe(1);
  });
  it("does not expose other hands, the seed, deck order or continuation data", () => {
    const g = table();
    add(g, "love", "hand", "b");
    add(g, "wrath", "deck", "");
    const v = publicView(g, "a");
    expect(v.hand).toHaveLength(0);
    expect(JSON.stringify(v)).not.toContain("wrath");
    expect(JSON.stringify(v)).not.toContain("love");
    expect(v).not.toHaveProperty("rng");
    expect(v).not.toHaveProperty("queue");
    expect(v.players[1].handCount).toBe(1);
  });
});

describe("live values", () => {
  it.each([
    ["ambivalence", "boredom", "laziness", 3],
    ["discipline", "apathy", "boredom", 3],
    ["disgust", "laziness", "complacency", 3],
    ["disregard", "indifference", "apathy", 3],
    ["frustration", "complacency", "indifference", 3],
    ["enjoyment", "boredom", "complacency", 6],
    ["excitement", "apathy", "laziness", 6],
    ["loyalty", "laziness", "indifference", 6],
    ["obsession", "complacency", "apathy", 6],
    ["pity", "indifference", "boredom", 6],
  ] as const)(
    "%s counts qualifying moods across the whole table",
    (id, a, b, n) => {
      const g = table();
      const uid = add(g, id);
      add(g, a, "play", "b");
      add(g, b, "play", "b");
      expect(
        value(
          g,
          g.cards.find((c) => c.uid === uid)!,
        ),
      ).toBe(n);
    },
  );
  it("updates Patience and Glee on the following round", () => {
    const g = table();
    add(g, "patience", "play", "a", { entered: 1 });
    add(g, "glee", "play", "b", { entered: 1 });
    expect(value(g, find(g, "patience"))).toBe(1);
    expect(value(g, find(g, "glee"))).toBe(6);
    g.round = 2;
    expect(value(g, find(g, "patience"))).toBe(5);
    expect(value(g, find(g, "glee"))).toBe(0);
  });
  it("counts dice totals above six and all five colors for Love", () => {
    const g = table();
    add(g, "love");
    for (const id of ["complacency", "indifference", "apathy", "boredom"])
      add(g, id, "play", "b");
    expect(value(g, find(g, "love"))).toBe(12);
    add(g, "imagination", "play", "b", { chosenColor: "red" });
    expect(value(g, find(g, "love"))).toBe(4);
  });
  it("computes hand, board, and discard formulas", () => {
    const g = table();
    for (const id of [
      "sloth",
      "vanity",
      "euphoria",
      "envy",
      "sadness",
      "wonder",
    ])
      add(g, id);
    find(g, "wonder").chosenColor = "black";
    add(g, "apathy", "play", "b");
    add(g, "boredom", "hand");
    add(g, "apathy", "discard", "");
    expect(value(g, find(g, "sloth"))).toBe(4);
    expect(value(g, find(g, "vanity"))).toBe(6);
    expect(value(g, find(g, "euphoria"))).toBe(7);
    expect(value(g, find(g, "envy"))).toBe(2);
    expect(value(g, find(g, "sadness"))).toBe(2);
    expect(value(g, find(g, "wonder"))).toBe(10);
  });
  it("Idealism overrides two printed alternatives, but not suppression", () => {
    const g = table();
    add(g, "patience", "play", "a", { entered: 1 });
    add(g, "idealism");
    expect(value(g, find(g, "patience"))).toBe(5);
    g.suppressions.push({ target: find(g, "patience").uid, round: 1 });
    expect(value(g, find(g, "patience"))).toBe(0);
  });
  it("zero-valued suppressed moods still count as colors and keep abilities", () => {
    const g = table();
    add(g, "exhilaration");
    add(g, "apathy");
    g.suppressions.push({ target: find(g, "exhilaration").uid, round: 1 });
    expect(baseScores(g).a).toBe(8);
    expect(color(g, find(g, "exhilaration"))).toBe("red");
  });
  it("extra scoring stacks additively, never exponentially", () => {
    const g = table();
    add(g, "exhilaration");
    add(g, "creativity", "play", "a", { copy: "exhilaration" });
    add(g, "apathy");
    expect(baseScores(g).a).toBe(12);
  });
  it("Bliss remembers the discarded color and adds two scores", () => {
    let g = table();
    const cost = add(g, "apathy", "hand");
    add(g, "sadness");
    g = play(g, "bliss");
    g = choose(g, [cost]);
    expect(find(g, "bliss").chosenColor).toBe("black");
    expect(baseScores(g).a).toBe(8);
  });
});

describe("entry abilities and costs", () => {
  it.each([
    "bliss",
    "guile",
    "envy",
    "exhilaration",
    "self-loathing",
    "neurosis",
    "regret",
  ])("%s cannot be played without paying its cost", (id) => {
    const g = table();
    const uid = add(g, id, "hand");
    expect(() =>
      act(g, "a", { type: "play", card: uid, grant: "base" }),
    ).toThrow();
  });
  it("Self-Loathing can sacrifice multiple moods before entering play", () => {
    let g = table();
    const a = add(g, "apathy"),
      b = add(g, "boredom");
    g = play(g, "self-loathing");
    g = choose(g, [a, b]);
    expect(g.discard).toHaveLength(2);
    expect(inPlay(g).map((c) => c.def)).toEqual(["self-loathing"]);
  });
  it("Charity grants one extra play; unused permissions can be passed", () => {
    let g = play(table(), "charity");
    expect(g.grants).toHaveLength(1);
    g = play(g, "apathy");
    expect(g.grants).toHaveLength(0);
    expect(() => play(g, "boredom")).toThrow();
    g = pass(g);
    expect(g.order[g.turnIndex]).toBe("b");
  });
  it("Anger validates the total using a snapshot, including zeros", () => {
    let g = table();
    const a = add(g, "apathy", "play", "b"),
      b = add(g, "boredom", "play", "b");
    g = play(g, "anger");
    expect(() => choose(g, [a, b])).toThrow(/total/);
    g = choose(g, [a, find(g, "anger").uid]);
    expect(g.discard).toHaveLength(2);
    expect(find(g, "boredom").zone).toBe("play");
  });
  it.each([
    ["cheer", "apathy"],
    ["delight", "joy"],
    ["dignity", "charity"],
    ["embarrassment", "boredom"],
  ] as const)("%s accepts the correct printed die", (id, cost) => {
    let g = table();
    const c = add(g, cost, "hand");
    g = play(g, id);
    g = choose(g, [c]);
    expect(value(g, find(g, id))).toBe(5);
    expect(find(g, cost).zone).toBe("discard");
  });
  it("Angst can replay the mood sacrificed as its own cost", () => {
    let g = table();
    const target = add(g, "boredom");
    g = play(g, "angst");
    g = choose(g, [target]);
    expect(g.grants[0].source).toBe("discard");
    g = act(g, "a", { type: "play", card: target, grant: g.grants[0].id });
    expect(find(g, "boredom").zone).toBe("play");
  });
  it("Benevolence checks color before Imagination changes it in play", () => {
    let g = table();
    add(g, "imagination", "play", "a", { chosenColor: "white" });
    g = play(g, "benevolence");
    const red = add(g, "boredom", "hand"),
      white = add(g, "complacency", "hand");
    expect(canPlay(g, "a", find(g, "boredom"), g.grants[0])).toBe(true);
    expect(canPlay(g, "a", find(g, "complacency"), g.grants[0])).toBe(false);
    g = act(g, "a", { type: "play", card: red, grant: g.grants[0].id });
    expect(color(g, find(g, "boredom"))).toBe("white");
  });
  it("Melancholy makes ordinary hand permissions usable from discard", () => {
    const g = table();
    add(g, "melancholy");
    const uid = add(g, "apathy", "discard", "");
    expect(canPlay(g, "a", find(g, "apathy"), g.grants[0])).toBe(true);
    const result = act(g, "a", { type: "play", card: uid, grant: "base" });
    expect(find(result, "apathy").owner).toBe("a");
  });
  it("Stubbornness grants nothing on entry, only at the start of a turn", () => {
    let g = table();
    for (let i = 0; i < 3; i++) add(g, "apathy", "play", "b");
    g = play(g, "stubbornness");
    expect(g.grants).toHaveLength(0);
    g = pass(pass(g));
    g = pass(g);
    expect(g.order[g.turnIndex]).toBe("a");
    expect(g.grants.some((x) => x.label === "Stubbornness")).toBe(true);
  });
  it("Hope loses its unused extra permission when it leaves play", () => {
    let g = table();
    add(g, "hope");
    g.grants.push({
      id: "hope",
      label: "Hope",
      source: "hand",
      sourceMood: find(g, "hope").uid,
    });
    g = play(g, "hate", "base");
    g = choose(g, [find(g, "hope").uid]);
    const target = add(g, "apathy", "hand");
    expect(g.grants.find((x) => x.id === "hope")).toBeUndefined();
  });
  it("Compulsion asks the affected player, without revealing their hand to the actor", () => {
    let g = table();
    const secret = add(g, "love", "hand", "b");
    g = play(g, "compulsion");
    g = choose(g, ["b"]);
    expect(g.prompt!.actor).toBe("b");
    expect(publicView(g, "a").prompt).toBeUndefined();
    expect(JSON.stringify(publicView(g, "a"))).not.toContain("Love");
    g = choose(g, [secret]);
    expect(find(g, "love").owner).toBe("a");
  });
  it("Confusion gathers all choices before passing cards", () => {
    let g = table();
    const a = add(g, "apathy", "hand", "a"),
      b = add(g, "love", "hand", "b");
    g = play(g, "confusion");
    g = choose(g, ["left"]);
    g = choose(g, [a]);
    expect(find(g, "apathy").owner).toBe("a");
    expect(hand(g, "b").map((c) => c.uid)).toEqual([b]);
    g = choose(g, [b]);
    expect(find(g, "apathy").owner).toBe("b");
    expect(find(g, "love").owner).toBe("a");
  });
  it("Fury fixes all choices before any mood leaves play", () => {
    let g = table();
    const a = add(g, "love"),
      b = add(g, "apathy", "play", "b");
    g = play(g, "fury");
    g = choose(g, [a]);
    expect(find(g, "love").zone).toBe("play");
    g = choose(g, [b]);
    expect(find(g, "love").zone).toBe("discard");
    expect(find(g, "apathy").zone).toBe("discard");
  });
  it("Pacifism suppression ends when its source changes players", () => {
    let g = table();
    const target = add(g, "apathy", "play", "b");
    g = play(g, "pacifism");
    g = choose(g, [target]);
    expect(value(g, find(g, "apathy"))).toBe(0);
    g.grants.push({ id: "extra", label: "Extra", source: "hand" });
    g = play(g, "betrayal", "extra");
    g = choose(g, [find(g, "pacifism").uid]);
    g = choose(g, ["b"]);
    expect(value(g, find(g, "apathy"))).toBe(4);
    g = settle(pass(pass(g)));
    expect(find(g, "pacifism").owner).toBe("a");
    expect(value(g, find(g, "apathy"))).toBe(4);
  });
  it("Creativity pays the copied cost and starts with fresh printed characteristics", () => {
    let g = table();
    add(g, "self-loathing", "play", "b");
    const sacrifice = add(g, "apathy");
    g = play(g, "creativity");
    g = choose(g, [find(g, "self-loathing").uid]);
    g = choose(g, [sacrifice]);
    expect(find(g, "apathy").zone).toBe("discard");
    expect(definition(find(g, "creativity")).id).toBe("self-loathing");
  });
  it("Doubt blocks Creativity by its original blue color", () => {
    const g = table();
    add(g, "love", "play", "b");
    add(g, "creativity", "hand");
    g.bans.push({ color: "blue", round: 1 });
    expect(canPlay(g, "a", find(g, "creativity"), g.grants[0])).toBe(false);
  });
  it("Rejection requires a matching pair, not a single mood", () => {
    let g = table();
    const a = add(g, "apathy"),
      b = add(g, "boredom");
    g = play(g, "rejection");
    expect(() => choose(g, [a])).toThrow();
    g = choose(g, [a, b]);
    expect(g.discard).toHaveLength(2);
  });
  it("after-scoring choices survive JSON save and load", () => {
    let g = table();
    add(g, "apathy", "play", "b");
    g = play(g, "sneakiness");
    const restored = JSON.parse(JSON.stringify(g));
    expect(choose(restored, ["b"])).toEqual(choose(g, ["b"]));
  });
});

describe("scoring interactions", () => {
  it("Sneakiness changes the final winner before losers draw", () => {
    let g = table();
    add(g, "love", "play", "b", { chosenValue: 12 });
    for (let i = 0; i < 2; i++) add(g, "apathy", "play", "b");
    g = play(g, "sneakiness");
    g = choose(g, ["b"]);
    g = settle(pass(pass(g)));
    expect(g.players[0].wins).toBe(1);
  });
  it("Corruption awards two wins and can finish a game at four", () => {
    let g = table();
    g.players[0].wins = 2;
    g = play(g, "corruption");
    g = choose(g, ["wins"]);
    g = pass(pass(g));
    expect(g.winner).toBe("a");
    expect(g.players[0].wins).toBe(4);
  });
  it("Awe skips scoring, consolation draws, and round-only after effects", () => {
    let g = table();
    add(g, "boredom", "deck", "");
    g = play(g, "awe");
    g = choose(g, ["b"]);
    g = pass(pass(g));
    expect(g.players.map((p) => p.wins)).toEqual([0, 0]);
    expect(g.deck).toHaveLength(1);
    expect(g.order[0]).toBe("b");
    expect(g.round).toBe(2);
  });
  it("Recklessness remains through Awe and cleans up at the next scoring", () => {
    let g = table();
    add(g, "recklessness");
    g = play(g, "awe");
    g = choose(g, ["a"]);
    g = pass(pass(g));
    expect(find(g, "recklessness").zone).toBe("play");
    g = settle(pass(pass(g)));
    expect(find(g, "recklessness").zone).not.toBe("play");
  });
  it("Gluttony discards only the card played with its permission", () => {
    let g = play(table(), "gluttony");
    g = play(g, "charity");
    g = play(g, "apathy");
    g = settle(pass(pass(g)));
    expect(find(g, "charity").zone).toBe("discard");
    expect(find(g, "apathy").zone).toBe("play");
  });
  it("Insecurity returns its extra card even when its source is gone", () => {
    let g = play(table(), "insecurity");
    g = play(g, "wrath");
    g = choose(g, ["yes"]);
    g = settle(pass(pass(g)));
    expect(find(g, "insecurity").zone).toBe("discard");
    expect(find(g, "wrath").zone).toBe("hand");
  });
  it("Enthusiasm allows choosing a lower-value mood or declining", () => {
    let g = table();
    const low = add(g, "charity");
    add(g, "apathy");
    add(g, "enthusiasm");
    g = pass(pass(g));
    g = choose(g, [low]);
    expect(g.lastRound!.scores.a).toBe(6);
  });
});

describe("complete catalog traversal", () => {
  it.each(catalog.map((c) => [c.id] as const))(
    "%s has a resolvable handler with legal mandatory decisions",
    (id) => {
      let g = table();
      for (const d of [
        "apathy",
        "boredom",
        "indifference",
        "laziness",
        "complacency",
      ]) {
        add(g, d, "play", "a");
        add(g, d, "play", "b");
        add(g, d, "hand", "a");
        add(g, d, "hand", "b");
        add(g, d, "discard", "");
        add(g, d, "deck", "");
      }
      g = play(g, id);
      g = settle(g);
      expect(g.prompt).toBeUndefined();
      expect(new Set(g.cards.map((c) => c.uid)).size).toBe(g.cards.length);
      expect(inPlay(g).every((c) => Number.isFinite(value(g, c)))).toBe(true);
    },
  );
});
