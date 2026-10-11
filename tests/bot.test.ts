import { describe, it, expect } from "vitest";
import { botAction } from "../src/game/bot";
import {
  act,
  addPlayer,
  createGame,
  publicView,
  startGame,
  value,
} from "../src/game/engine";
import type { Difficulty } from "../src/game/types";
import { catalog } from "../src/game/catalog";
import { TURN_PLAY_LIMIT } from "../src/game/fly";
import { add, find, play, table } from "./helpers";
describe("fair, selectable bot policies", () => {
  it("ends an actual two-Thrill replay cycle while humans may keep playing", () => {
    let g = table();
    add(g, "thrill", "play", "a");
    add(g, "thrill", "hand", "a");
    // Easy's fixed seed repeatedly picks the other Thrill at each prompt.
    // Every log line, grant, and card movement is produced by the real engine.
    for (let i = 0; i < 2 * TURN_PLAY_LIMIT; i++) {
      const action = botAction(publicView(g, "a"), "easy", 682);
      expect(action.type).toBe(i % 2 ? "choose" : "play");
      g = act(g, "a", action);
    }
    const v = publicView(g, "a");
    expect(v.prompt).toBeUndefined();
    expect(Object.keys(v.playable)).toHaveLength(1);
    for (const level of ["easy", "normal", "hard", "fly"] as Difficulty[])
      expect(botAction(v, level, 42)).toEqual({ type: "pass" });
    const [card, grants] = Object.entries(v.playable)[0];
    expect(() =>
      act(g, "a", { type: "play", card, grant: grants[0] }),
    ).not.toThrow();
    g = act(g, "a", botAction(v, "easy", 42));
    expect(g.order[g.turnIndex]).toBe("b");
  });
  it("Normal and Hard replay valuable entry effects with Thrill", () => {
    let g = table();
    const replayable = [
      "compulsion",
      "suspicion",
      "intimidation",
      "paranoia",
      "joy",
      "charity",
    ].map((id) => add(g, id));
    add(g, "apathy");
    add(g, "validation");
    add(g, "boredom", "hand", "a");
    add(g, "boredom", "hand", "b");
    add(g, "boredom", "deck", "");
    g = play(g, "thrill");
    for (const level of ["normal", "hard"] as Difficulty[]) {
      const action = botAction(publicView(g, "a"), level, 42);
      expect(action.type).toBe("choose");
      if (action.type === "choose")
        expect(new Set(action.selected)).toEqual(new Set(replayable));
    }
  });
  it("prioritizes an opponent's Validation unless another target wins now", () => {
    for (const ownPoints of [4, 8]) {
      let g = table();
      add(g, "apathy", "play", "a");
      if (ownPoints === 8) add(g, "boredom", "play", "a");
      const validation = add(g, "validation", "play", "b");
      const high = add(g, "apathy", "play", "b");
      g = play(g, "hate");
      const action = botAction(publicView(g, "a"), "normal", 42);
      expect(action).toMatchObject({
        type: "choose",
        selected: [ownPoints === 8 ? validation : high],
      });
    }
  });
  it("does not overvalue Shock when every opposing mood is ineligible", () => {
    const g = table();
    add(g, "apathy", "play", "b");
    add(g, "shock", "hand", "a");
    const joy = add(g, "joy", "hand", "a");
    expect(botAction(publicView(g, "a"), "normal", 42)).toMatchObject({
      type: "play",
      card: joy,
    });
  });
  it("chooses Wonder's color using both the table and discard pile", () => {
    let g = table();
    add(g, "anger", "play", "b");
    add(g, "shock", "play", "b");
    for (let i = 0; i < 3; i++) add(g, "anxiety", "discard", "");
    g = play(g, "wonder");
    for (const level of ["normal", "hard"] as Difficulty[])
      expect(botAction(publicView(g, "a"), level, 42)).toMatchObject({
        type: "choose",
        selected: ["blue"],
      });
  });
  it("Normal prefers a useful scoring card to an empty zero-value card", () => {
    const g = table();
    add(g, "creativity", "hand");
    const useful = add(g, "apathy", "hand");
    expect(botAction(publicView(g, "a"), "normal", 8)).toMatchObject({
      type: "play",
      card: useful,
    });
  });
  it("Hard compares removal against simply adding points", () => {
    const g = table();
    add(g, "boredom", "hand");
    const removal = add(g, "wrath", "hand");
    add(g, "apathy", "play", "b");
    add(g, "boredom", "play", "b");
    add(g, "laziness", "play", "b");
    expect(botAction(publicView(g, "a"), "hard", 8)).toMatchObject({
      type: "play",
      card: removal,
    });
  });
  it("different hidden hands do not change a bot decision", () => {
    const a = table();
    add(a, "anger", "hand");
    add(a, "love", "hand", "b");
    const b = structuredClone(a);
    find(b, "love").def = "wrath";
    const av = publicView(a, "a"),
      bv = publicView(b, "a");
    expect(av).toEqual(bv);
    for (const level of ["easy", "normal", "hard", "fly"] as Difficulty[])
      expect(botAction(av, level, 99)).toEqual(botAction(bv, level, 99));
  });
  it("Easy varies its legal moves across seeds", () => {
    const g = table();
    add(g, "apathy", "hand");
    add(g, "boredom", "hand");
    add(g, "laziness", "hand");
    const choices = new Set(
      Array.from({ length: 50 }, (_, n) =>
        JSON.stringify(botAction(publicView(g, "a"), "easy", n * 2000)),
      ),
    );
    expect(choices.size).toBeGreaterThan(1);
  });
  it("Curiosity’s image-verified secondary die is available to Idealism", () => {
    const g = table();
    add(g, "curiosity");
    add(g, "idealism");
    expect(value(g, find(g, "curiosity"))).toBe(6);
  });
  it.each(catalog.map((c) => [c.id] as const))(
    "%s: the bot resolves legal decisions, including optional effects",
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
      let n = 0;
      while (g.prompt && n++ < 50) {
        const actor = g.prompt.actor;
        g = act(g, actor, botAction(publicView(g, actor), "normal", n));
      }
      expect(g.prompt).toBeUndefined();
    },
  );
  it.each(["easy", "normal", "hard", "fly"] as Difficulty[])(
    "%s completes matches at all player counts",
    (level) => {
      for (let n = 2; n <= 4; n++) {
        let g = createGame("a", "Alice", 100 + n);
        for (const p of ["b", "c", "d"].slice(0, n - 1)) addPlayer(g, p, p);
        startGame(g, "a");
        let actions = 0;
        while (g.status !== "finished" && actions++ < 500) {
          const actor = g.prompt?.actor ?? g.order[g.turnIndex];
          g = act(
            g,
            actor,
            botAction(publicView(g, actor), level, actions * 179),
          );
        }
        expect(g.status, `${level}: ${n} players, ${g.prompt?.title}`).toBe(
          "finished",
        );
      }
    },
    60000,
  );
});
