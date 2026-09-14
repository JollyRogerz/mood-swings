import { describe, it, expect } from "vitest";
import {
  act,
  baseScores,
  canPlay,
  color,
  inPlay,
  value,
} from "../src/game/engine";
import { add, choose, find, pass, play, settle, table } from "./helpers";
import { FileStore } from "../src/server/store";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
describe("delayed effects and copied identities", () => {
  it("an old Insecurity effect does not return a card that was replayed", () => {
    let g = play(table(), "insecurity");
    g = play(g, "apathy");
    const uid = find(g, "apathy").uid;
    g.grants.push({ id: "fear", label: "Test", source: "hand" });
    g = play(g, "fear", "fear");
    g = choose(g, [uid]);
    g = act(g, "a", { type: "play", card: uid, grant: g.grants[0].id });
    g = settle(pass(pass(g)));
    expect(find(g, "apathy").zone).toBe("play");
  });
  it("an extra play survives paying its cost with the mood that granted it", () => {
    let g = table();
    add(g, "hope");
    g.grants.push({
      id: "hope",
      label: "Hope",
      source: "hand",
      sourceMood: find(g, "hope").uid,
    });
    g = play(g, "envy", "hope");
    g = choose(g, [find(g, "hope").uid]);
    expect(g.prompt).toBeUndefined();
    expect(find(g, "envy").zone).toBe("play");
    expect(find(g, "hope").zone).toBe("discard");
    expect(g.grants.some((x) => x.id === "hope")).toBe(false);
  });
  it("Betrayal returns a loan even when Betrayal has left play", () => {
    let g = table();
    const uid = add(g, "love");
    g = play(g, "betrayal");
    g = choose(g, [uid]);
    g = choose(g, ["b"]);
    g.grants.push({ id: "hate", label: "Test", source: "hand" });
    g = play(g, "hate", "hate");
    g = choose(g, [find(g, "betrayal").uid]);
    g = settle(pass(pass(g)));
    expect(find(g, "love").owner).toBe("a");
  });
  it("a copy keeps its queued entry effect when that copy leaves play", () => {
    let g = table();
    add(g, "bitterness", "play", "b");
    add(g, "apathy", "play", "b");
    add(g, "duplicity");
    g = play(g, "creativity");
    g = choose(g, [find(g, "bitterness").uid]);
    g = choose(g, ["yes"]);
    expect(g.prompt).toBeUndefined();
    expect(find(g, "creativity").copy).toBe("bitterness");
  });
  it("Creativity resets its printed identity upon leaving play", () => {
    let g = table();
    const target = add(g, "apathy", "play", "b");
    g = play(g, "creativity");
    g = choose(g, [target]);
    const uid = find(g, "creativity").uid;
    g.grants.push({ id: "panic", label: "Test", source: "hand" });
    g = play(g, "panic", "panic");
    g = choose(g, [uid]);
    expect(find(g, "creativity").copy).toBeUndefined();
    expect(color(g, find(g, "creativity"))).toBe("blue");
  });
  it("optional Duplicity effects are separate selections, not a larger total", () => {
    let g = table();
    const a = add(g, "apathy", "play", "b"),
      b = add(g, "boredom", "play", "b");
    add(g, "duplicity");
    g = play(g, "anger");
    g = choose(g, [a]);
    g = choose(g, ["yes"]);
    expect(g.prompt!.constraints!.maxValue).toBe(5);
    g = choose(g, [b]);
    expect(find(g, "apathy").zone).toBe("discard");
    expect(find(g, "boredom").zone).toBe("discard");
  });
  it("Pride stops granting plays after another permission equalizes the board", () => {
    let g = table();
    add(g, "apathy", "play", "b");
    add(g, "boredom", "play", "b");
    g = play(g, "pride");
    g = choose(g, ["b"]);
    g.grants.push({ id: "other", label: "Test", source: "hand" });
    g = play(g, "laziness", "other");
    const uid = add(g, "complacency", "hand");
    const gr = g.grants.find((x) => x.label === "Pride")!;
    expect(canPlay(g, "a", find(g, "complacency"), gr)).toBe(false);
  });
  it("Hostility refreshes Superiority after paying its optional sacrifice", () => {
    let g = table();
    const cost = add(g, "apathy");
    add(g, "boredom");
    add(g, "superiority", "play", "b");
    add(g, "laziness", "play", "b");
    add(g, "complacency", "play", "b");
    g = play(g, "hostility");
    expect(value(g, find(g, "superiority"))).toBe(3);
    g = choose(g, [cost]);
    expect(value(g, find(g, "superiority"))).toBe(7);
    expect(g.prompt!.options.map((o) => o.id)).not.toContain(
      find(g, "superiority").uid,
    );
  });
  it("source-controlled suppression does not transfer with its source", () => {
    let g = table();
    const red = add(g, "boredom", "play", "b");
    g = play(g, "guilt");
    g = choose(g, ["all"]);
    expect(value(g, find(g, "boredom"))).toBe(0);
    g.grants.push({ id: "x", label: "Test", source: "hand" });
    g = play(g, "betrayal", "x");
    g = choose(g, [find(g, "guilt").uid]);
    g = choose(g, ["b"]);
    expect(value(g, find(g, "boredom"))).toBe(4);
  });
  it("temporary suppression expires at the end of the round", () => {
    let g = table();
    const target = add(g, "apathy", "play", "b");
    g = play(g, "scorn");
    g = choose(g, [target]);
    expect(value(g, find(g, "apathy"))).toBe(0);
    g = settle(pass(pass(g)));
    expect(value(g, find(g, "apathy"))).toBe(4);
  });
  it("score swapping before Bashfulness changes its conditional result", () => {
    let g = table();
    add(g, "love", "play", "b");
    add(g, "apathy", "play", "b");
    add(g, "boredom", "play", "b");
    g = play(g, "bashfulness");
    g.grants.push({ id: "s", label: "Test", source: "hand" });
    g = play(g, "sneakiness", "s");
    g = choose(g, ["b"]);
    g = pass(pass(g));
    const swap = g.prompt!.options.find((o) => o.label.includes("swap"))!.id;
    g = choose(g, [swap]);
    g = settle(g);
    expect(find(g, "bashfulness").zone).not.toBe("play");
    expect(g.players[0].wins).toBe(1);
  });
});
describe("additional card outcomes", () => {
  it("gaining Hope during your turn makes its continuous extra play available", () => {
    let g = table();
    const cost1 = add(g, "apathy", "hand"),
      cost2 = add(g, "boredom", "hand"),
      hope = add(g, "hope", "play", "b");
    g = play(g, "guile");
    g = choose(g, [cost1, cost2]);
    g = choose(g, [hope]);
    expect(g.grants.some((gr) => gr.label === "Hope")).toBe(true);
  });
  it("Altruism distributes starting after the actor and empties the discard", () => {
    let g = table(3);
    for (const id of ["love", "apathy", "boredom", "charity"])
      add(g, id, "discard", "");
    g = play(g, "altruism");
    expect(g.discard).toHaveLength(0);
    expect(g.deck).toHaveLength(1);
    for (const id of ["a", "b", "c"])
      expect(
        g.cards.filter((c) => c.zone === "hand" && c.owner === id),
      ).toHaveLength(1);
    expect(value(g, find(g, "altruism"))).toBe(7);
  });
  it("Bitterness removes all tied majority colors, excluding itself", () => {
    let g = table();
    add(g, "apathy", "play", "b");
    add(g, "boredom", "play", "b");
    add(g, "triumph", "play", "b");
    g = play(g, "bitterness");
    expect(g.discard).toHaveLength(3);
    expect(inPlay(g).map((c) => c.def)).toEqual(["bitterness"]);
  });
  it("Conviction draws for the targeted mood’s player", () => {
    let g = table();
    const target = add(g, "apathy", "play", "b");
    const top = add(g, "love", "deck", "");
    g = play(g, "conviction");
    g = choose(g, [target]);
    expect(find(g, "love").owner).toBe("b");
    expect(g.deck).toEqual([target]);
  });
  it("Hate draws for the actor, not the target’s player", () => {
    let g = table();
    const target = add(g, "apathy", "play", "b");
    add(g, "love", "deck", "");
    g = play(g, "hate");
    g = choose(g, [target]);
    expect(find(g, "love").owner).toBe("a");
  });
  it("Cynicism sets value six and gives the selected discard to an opponent", () => {
    let g = table();
    const target = add(g, "love", "discard", "");
    g = play(g, "cynicism");
    g = choose(g, [target]);
    g = choose(g, ["b"]);
    expect(find(g, "love").owner).toBe("b");
    expect(value(g, find(g, "cynicism"))).toBe(6);
  });
  it("Malice lets the affected player choose the pair", () => {
    let g = table();
    const x = add(g, "apathy", "play", "b"),
      y = add(g, "boredom", "play", "b");
    add(g, "sloth", "play", "a");
    g = play(g, "malice");
    g = choose(g, ["b"]);
    expect(g.prompt!.actor).toBe("b");
    g = choose(g, [x, y]);
    expect(find(g, "apathy").zone).toBe("discard");
    expect(find(g, "boredom").zone).toBe("discard");
    expect(find(g, "malice").zone).toBe("discard");
    expect(find(g, "sloth").zone).toBe("play");
  });
  it("Instability permits giving back the mood just taken", () => {
    let g = table();
    const x = add(g, "apathy", "play", "b"),
      y = add(g, "boredom", "play", "b");
    g = play(g, "instability");
    g = choose(g, [x, y]);
    expect(g.prompt!.actor).toBe("b");
    g = choose(g, [x]);
    expect(find(g, "apathy").owner).toBe("a");
    g = choose(g, [x]);
    expect(find(g, "apathy").owner).toBe("b");
  });
  it("Wonder counts both board and discarded cards in its chosen color", () => {
    let g = table();
    add(g, "apathy", "play", "b");
    add(g, "sadness", "discard", "");
    g = play(g, "wonder");
    g = choose(g, ["black"]);
    expect(value(g, find(g, "wonder"))).toBe(4);
  });
  it("Honor persists across rounds regardless of the winner", () => {
    let g = table();
    g = play(g, "honor");
    g = choose(g, ["b"]);
    g = pass(pass(g));
    expect(g.players[0].wins).toBe(1);
    expect(g.order).toEqual(["b", "a"]);
  });
  it("Doubt applies only to the following round", () => {
    let g = table();
    const cost = add(g, "boredom", "hand");
    g = play(g, "doubt");
    g = choose(g, [cost]);
    expect(g.bans).toEqual([{ round: 2, color: "red" }]);
    g = pass(pass(g));
    const red = add(g, "triumph", "hand");
    expect(canPlay(g, "a", find(g, "triumph"), g.grants[0])).toBe(false);
  });
  it("Rationalization passes whole hands simultaneously", () => {
    let g = table(3);
    const a = add(g, "apathy", "hand"),
      b = add(g, "boredom", "hand", "b"),
      c = add(g, "love", "hand", "c");
    g = play(g, "rationalization");
    g = choose(g, ["left"]);
    expect(find(g, "apathy").owner).toBe("b");
    expect(find(g, "boredom").owner).toBe("c");
    expect(find(g, "love").owner).toBe("a");
  });
  it("Intimidation’s extra play is restricted to the received card", () => {
    let g = table();
    const target = add(g, "apathy", "hand", "b");
    g = play(g, "intimidation");
    g = choose(g, ["b"]);
    g = choose(g, [target]);
    add(g, "boredom", "hand");
    expect(canPlay(g, "a", find(g, "apathy"), g.grants[0])).toBe(true);
    expect(canPlay(g, "a", find(g, "boredom"), g.grants[0])).toBe(false);
  });
  it("Guile pays two cards then gains control without replaying the target", () => {
    let g = table();
    const a = add(g, "apathy", "hand"),
      b = add(g, "boredom", "hand"),
      target = add(g, "charity", "play", "b");
    g = play(g, "guile");
    g = choose(g, [a, b]);
    g = choose(g, [target]);
    expect(find(g, "charity").owner).toBe("a");
    expect(g.grants).toHaveLength(0);
    expect(g.discard).toHaveLength(2);
  });
});
it("persists and restores a pending private decision atomically", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mood-store-"));
  const store = new FileStore(root);
  try {
    await store.init();
    let g = table();
    add(g, "love", "hand", "b");
    g = play(g, "compulsion");
    g = choose(g, ["b"]);
    await store.save("ABCDEFGH", g);
    const restored = await new FileStore(root).load("ABCDEFGH");
    expect(restored).toEqual(g);
    expect(restored!.prompt!.actor).toBe("b");
    expect(await store.load("BCDEFGHJ")).toBeNull();
    await expect(store.load("../secrets")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

describe("round result announcements", () => {
  it("records the tie winner, Hurt Feelings recipient, and next starting player", () => {
    const g = settle(pass(pass(pass(table(3)))));
    expect(g.lastRound).toEqual({
      round: 1,
      scores: { a: 0, b: 0, c: 0 },
      winner: "a",
      hurtFeelings: "c",
      nextFirst: "a",
      order: ["a", "b", "c"],
    });
  });
  it("announces the starting player chosen by Honor, even when another player wins", () => {
    let g = table(3);
    add(g, "honor", "play", "a", { chosenPlayer: "b" });
    g = settle(pass(pass(pass(g))));
    expect(g.lastRound!.winner).toBe("a");
    expect(g.lastRound!.nextFirst).toBe("b");
    expect(g.order[0]).toBe("b");
  });
  it("does not announce a next turn or Hurt Feelings after the match ends", () => {
    let g = table(3);
    g.players[0].wins = 2;
    g = settle(pass(pass(pass(g))));
    expect(g.status).toBe("finished");
    expect(g.lastRound!.winner).toBe("a");
    expect(g.lastRound!.nextFirst).toBeUndefined();
    expect(g.lastRound!.hurtFeelings).toBeUndefined();
  });
});

describe("played-card reveals", () => {
  it("records a completed play, without announcing an unpaid card", () => {
    let g = table();
    const payment = add(g, "apathy", "hand");
    g = play(g, "bliss");
    expect(g.lastPlayed).toBeUndefined();
    g = choose(g, [payment]);
    expect(g.lastPlayed).toMatchObject({
      actor: "a",
      def: "bliss",
      originalDef: "bliss",
    });
  });
  it("keeps the copied identity for the reveal", () => {
    let g = table();
    const target = add(g, "apathy", "play", "b");
    g = play(g, "creativity");
    g = choose(g, [target]);
    expect(g.lastPlayed).toMatchObject({
      def: "apathy",
      originalDef: "creativity",
    });
  });
  it("does not reannounce a mood merely transferred between players", () => {
    let g = table();
    const target = add(g, "love");
    g = play(g, "betrayal");
    const announcement = structuredClone(g.lastPlayed);
    g = choose(g, [target]);
    g = choose(g, ["b"]);
    expect(g.lastPlayed).toEqual(announcement);
    expect(g.lastPlayed!.def).toBe("betrayal");
  });
});
