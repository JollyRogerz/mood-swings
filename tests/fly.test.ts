import { describe, expect, it } from "vitest";
import {
  act,
  addPlayer,
  createGame,
  publicView,
  RuleError,
  startGame,
} from "../src/game/engine";
import { botAction } from "../src/game/bot";
import {
  candidates,
  circuit,
  defaultBrain,
  encode,
  FEATURES,
  flyAction,
  FlyBrain,
  playsThisTurn,
  SPARSITY,
  TURN_PLAY_LIMIT,
} from "../src/game/fly";
import type { Difficulty } from "../src/game/types";
import { add, play, table } from "./helpers";
describe("fruit fly mushroom body", () => {
  it("the extracted circuit is internally consistent", () => {
    const { counts, inputs, kc, mbon, pnToKc, kcToMbon } = circuit;
    expect(inputs.length).toBe(counts.inputs);
    expect(kc.length).toBe(counts.kc);
    expect(mbon.length).toBe(counts.mbon);
    expect(pnToKc.length).toBe(counts.pn_to_kc * 3);
    expect(kcToMbon.length).toBe(counts.kc_to_mbon * 3);
    for (let e = 0; e < pnToKc.length; e += 3) {
      expect(pnToKc[e]).toBeLessThan(inputs.length);
      expect(pnToKc[e + 1]).toBeLessThan(kc.length);
      expect(pnToKc[e + 2]).toBeGreaterThan(0);
    }
    for (let e = 0; e < kcToMbon.length; e += 3) {
      expect(kcToMbon[e]).toBeLessThan(kc.length);
      expect(kcToMbon[e + 1]).toBeLessThan(mbon.length);
      if (e) expect(kcToMbon[e]).toBeGreaterThanOrEqual(kcToMbon[e - 3]);
    }
    expect(new Set(kc.map((n) => n.type.slice(0, 2)))).toEqual(new Set(["KC"]));
    expect(mbon.every((n) => n.sign === 1 || n.sign === -1)).toBe(true);
    expect(mbon.some((n) => n.sign === -1)).toBe(true);
  });
  it("every game feature has its own excitatory projection neuron", () => {
    expect(FEATURES).toBeLessThanOrEqual(
      circuit.inputs.filter((n) => n.sign > 0).length,
    );
    const brain = defaultBrain();
    expect(new Set(brain.featureNeuron).size).toBe(FEATURES);
  });
  it("Kenyon cell codes are sparse, normalized, and deterministic", () => {
    const g = table();
    add(g, "apathy", "hand");
    add(g, "wrath", "hand");
    const v = publicView(g, "a"),
      brain = defaultBrain(),
      options = candidates(v, 1);
    expect(options[0]).toEqual({ type: "pass" });
    expect(options.length).toBe(3);
    for (const a of options) {
      const code = brain.code(encode(v, a));
      expect(code.index.length).toBeLessThanOrEqual(
        Math.round(SPARSITY * circuit.kc.length),
      );
      expect(code.index.length).toBeGreaterThan(10);
      const total = Array.from(code.activity).reduce((x, y) => x + y, 0);
      expect(total).toBeCloseTo(1, 6);
      expect(brain.code(encode(v, a))).toEqual(code);
    }
    const [p1, p2] = options
      .slice(1)
      .map((a) => new Set(brain.code(encode(v, a)).index));
    expect([...p1].some((j) => !p2.has(j))).toBe(true);
  });
  it("the trained synapses match the circuit and are not all silent", () => {
    const brain = defaultBrain();
    expect(brain.weights.length).toBe(circuit.counts.kc_to_mbon);
    expect(
      Array.from(brain.weights).filter((w) => w > 0).length,
    ).toBeGreaterThan(1000);
    expect(() => new FlyBrain({ version: 1, edges: 3, weights: [] })).toThrow();
  });
  it("chooses legal plays and legal decisions", () => {
    let g = table();
    add(g, "apathy", "hand");
    add(g, "boredom", "hand");
    const a = flyAction(publicView(g, "a"), 5);
    expect(a.type === "play" || a.type === "pass").toBe(true);
    expect(flyAction(publicView(g, "a"), 5)).toEqual(a);
    g = play(g, "anger");
    expect(g.prompt).toBeDefined();
    const choice = flyAction(publicView(g, g.prompt!.actor), 5);
    expect(choice.type).toBe("choose");
    expect(() => act(g, g.prompt!.actor, choice)).not.toThrow();
  });
  it("passes instead of repeating a rules-legal play loop forever", () => {
    const g = table();
    add(g, "apathy", "hand");
    const v = publicView(g, "a");
    expect(playsThisTurn(v)).toBe(0);
    const loop = ["Grief", "Anger", "Disregard", "Duplicity"];
    const log = [
      { id: 1, text: "B played Love." },
      ...Array.from({ length: TURN_PLAY_LIMIT }, (_, i) => ({
        id: i + 2,
        text: `Alice played ${loop[i % loop.length]}.`,
      })),
    ];
    expect(playsThisTurn({ ...v, log })).toBe(TURN_PLAY_LIMIT);
    expect(flyAction({ ...v, log }, 3)).toEqual({ type: "pass" });
    expect(
      playsThisTurn({
        ...v,
        log: [...log, { id: 99, text: "Alice won round 1 with 9 points." }],
      }),
    ).toBe(0);
  });
  it("beats the Easy bot most of the time in two-player games", () => {
    let wins = 0;
    const games = 40;
    for (let i = 0; i < games; i++) {
      let g = createGame("p0", "P0", 4000 + i);
      addPlayer(g, "p1", "P1");
      startGame(g, "p0");
      const seats: Difficulty[] = i % 2 ? ["fly", "easy"] : ["easy", "fly"];
      let n = 0;
      while (g.status !== "finished" && n++ < 800) {
        const actor = g.prompt?.actor ?? g.order[g.turnIndex],
          view = publicView(g, actor);
        try {
          g = act(g, actor, botAction(view, seats[Number(actor.slice(1))], n));
        } catch (error) {
          if (!(error instanceof RuleError)) throw error;
          g = act(g, actor, botAction(view, "easy", n * 31));
        }
      }
      expect(g.status).toBe("finished");
      if (seats[Number(g.winner!.slice(1))] === "fly") wins++;
    }
    expect(wins / games).toBeGreaterThan(0.65);
  }, 60000);
});
