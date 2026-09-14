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
import { add, find, play, table } from "./helpers";
describe("fair, selectable bot policies", () => {
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
