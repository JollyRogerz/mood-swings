import assert from "node:assert/strict";
import { expect, it } from "vitest";
import {
  act,
  addPlayer,
  createGame,
  inPlay,
  publicView,
  startGame,
  value,
  RuleError,
} from "../src/game/engine";
import type { Game } from "../src/game/types";
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function invariant(g: Game) {
  assert.equal(new Set(g.deck).size, g.deck.length);
  assert.equal(new Set(g.discard).size, g.discard.length);
  for (const c of g.cards) {
    assert.equal(g.deck.includes(c.uid), c.zone === "deck");
    assert.equal(g.discard.includes(c.uid), c.zone === "discard");
    if (c.zone === "play" || c.zone === "hand")
      assert.ok(g.players.some((p) => p.id === c.owner));
    if (c.zone === "play")
      assert.ok(Number.isFinite(value(g, c)) && value(g, c) >= 0);
    if (c.zone === "discard" || c.zone === "deck")
      assert.equal(c.copy, undefined);
  }
}
it.each(Array.from({ length: 60 }, (_, i) => [i + 1]))(
  "seed %i: completes a full multiplayer game using only legal public decisions",
  (seed) => {
    const rand = rng(seed * 100);
    let g = createGame("a", "Alice", seed);
    for (const p of ["b", "c", "d"].slice(0, 1 + (seed % 3)))
      addPlayer(g, p, p);
    startGame(g, "a", seed % 2 ? "retail" : "all");
    let n = 0;
    while (g.status !== "finished" && n++ < 700) {
      invariant(g);
      if (g.prompt) {
        const q = g.prompt;
        let next: Game | undefined;
        for (let trial = 0; trial < 60 && !next; trial++) {
          const size =
            trial === 59
              ? q.min
              : Math.min(
                  q.max,
                  Math.max(q.min, Math.floor(rand() * (q.max + 1))),
                );
          const ids = q.options
            .map((o) => o.id)
            .sort(() => rand() - 0.5)
            .slice(0, size);
          try {
            next = act(g, q.actor, {
              type: "choose",
              prompt: q.id,
              selected: ids,
            });
          } catch (e) {
            if (!(e instanceof RuleError)) throw e;
          }
        }
        if (!next) throw new Error(`No legal decision for ${q.title}`);
        g = next;
      } else {
        const p = g.order[g.turnIndex],
          view = publicView(g, p),
          entries = Object.entries(view.playable);
        if (entries.length && rand() < 0.94) {
          const [card, grants] = entries[Math.floor(rand() * entries.length)];
          g = act(g, p, {
            type: "play",
            card,
            grant: grants[Math.floor(rand() * grants.length)],
          });
        } else g = act(g, p, { type: "pass" });
      }
    }
    invariant(g);
    expect(
      g.status,
      `seed ${seed}, round ${g.round}, pending ${g.prompt?.title}`,
    ).toBe("finished");
    expect(
      g.players.find((p) => p.id === g.winner)!.wins,
    ).toBeGreaterThanOrEqual(3);
  },
  20000,
);
