import circuitData from "../../data/fly/circuit.json";
import trainedData from "../../data/fly/weights.json";
import { catalog, COLORS, definitions } from "./catalog";
import {
  choiceScore,
  generator,
  heuristic,
  selections,
  visibleCards,
} from "./heuristics";
import type { Action, PublicCard, View } from "./types";
// A Mood Swings player built from the mushroom body of the MaleCNS v1.0 fruit fly
// connectome (HHMI Janelia / Google Research, CC-BY 4.0). The wiring is real:
// projection neurons -> Kenyon cells -> mushroom body output neurons (MBONs),
// with synapse counts from the electron-microscopy reconstruction and signs from
// the released neurotransmitter predictions. The connectome has no synaptic
// strengths, so what the game state "smells like" to the projection neurons and
// how strongly each Kenyon cell -> MBON synapse counts are our additions. Only the
// Kenyon cell -> MBON synapses are trained, mirroring where the real fly stores
// dopamine-taught associations. See docs/fly-brain.md.
export interface Circuit {
  counts: Record<string, number>;
  inputs: {
    id: number;
    type: string | null;
    nt: string | null;
    sign: number;
  }[];
  kc: { id: number; type: string }[];
  mbon: { id: number; type: string | null; nt: string | null; sign: number }[];
  pnToKc: number[];
  kcToMbon: number[];
}
export interface FlyParams {
  version: 1;
  edges: number;
  weights: number[];
  meta?: Record<string, unknown>;
}
export const circuit = circuitData as Circuit;
// Fraction of Kenyon cells allowed to stay active after APL feedback inhibition.
export const SPARSITY = 0.05;
// Candidate-specific inputs are presented louder than the shared game state so
// that the winner-take-all layer keeps neurons that distinguish the options.
export const GAIN = 1;
const S = 40, // game state
  A = 30, // candidate play
  C = 30, // candidate decision
  T = 28, // thermometer-coded intensities, like odor concentration across glomeruli
  H = 16, // hashed words of the decision title
  N = catalog.length; // identity of the played or deciding card
export const FEATURES = S + A + C + T + H + N;
const OFFSET = {
  state: 0,
  action: S,
  choice: S + A,
  thermo: S + A + C,
  hash: S + A + C + T,
  card: S + A + C + T + H,
};
const cardIndex = Object.fromEntries(catalog.map((c, i) => [c.id, i]));
const cardByName = Object.fromEntries(catalog.map((c, i) => [c.name, i]));
const clamp = (n: number) => (n > 1 ? 1 : n < 0 ? 0 : n);
function hashWord(word: string) {
  let h = 2166136261;
  for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % H;
}
// Present the state and one candidate action to the projection neurons.
export function encode(v: View, a: Action): Float64Array {
  const x = new Float64Array(FEATURES),
    me = v.players.find((p) => p.id === v.you)!,
    opponents = v.players.filter((p) => p.id !== v.you),
    mine = v.moods.filter((c) => c.owner === v.you),
    theirs = v.moods.filter((c) => c.owner !== v.you),
    maxOpp = Math.max(0, ...opponents.map((p) => p.score)),
    maxWins = Math.max(0, ...opponents.map((p) => p.wins)),
    hands = opponents.map((p) => p.handCount),
    sum = (cs: PublicCard[]) => cs.reduce((n, c) => n + c.value, 0);
  let i = OFFSET.state;
  const put = (n: number) => (x[i++] = clamp(n)),
    thermometer = (n: number, bins: number) => {
      for (let b = 0; b < bins; b++) x[i++] = clamp(n * bins - b);
    };
  put(me.score / 30);
  put(maxOpp / 30);
  put((me.score - maxOpp + 30) / 60);
  put(me.wins / 3);
  put(maxWins / 3);
  put(v.round / 10);
  put(v.hand.length / 8);
  put(hands.reduce((a, b) => a + b, 0) / Math.max(1, hands.length) / 8);
  put(Math.max(0, ...hands) / 8);
  put(v.deckCount / 60);
  put(v.discard.length / 60);
  put(mine.length / 8);
  put(theirs.length / 12);
  for (const col of COLORS) put(mine.filter((c) => c.color === col).length / 4);
  for (const col of COLORS)
    put(theirs.filter((c) => c.color === col).length / 4);
  put(sum(mine) / 30);
  put(sum(theirs) / 30);
  put(v.players.length === 2 ? 1 : 0);
  put(v.players.length === 3 ? 1 : 0);
  put(v.players.length === 4 ? 1 : 0);
  put(v.order.indexOf(v.you) / 3);
  put(v.grants.length / 3);
  put(v.prompt ? 1 : 0);
  put(Math.max(0, ...mine.map((c) => c.value)) / 10);
  put(Math.max(0, ...theirs.map((c) => c.value)) / 10);
  put(Math.min(10, ...mine.map((c) => c.value)) / 10);
  put(Object.keys(v.playable).length / 8);
  put(me.score >= maxOpp ? 1 : 0);
  put(v.grants.some((g) => g.label === "Hurt Feelings") ? 1 : 0);
  put(me.wins === 2 ? 1 : 0);
  put(maxWins === 2 ? 1 : 0);
  put(v.suppressions.length / 4);
  if (a.type === "play" || a.type === "pass") {
    i = OFFSET.action;
    if (a.type === "pass") put(1);
    else {
      put(0);
      const c = visibleCards(v).find((c) => c.uid === a.card)!,
        d = definitions[c.def],
        grant = v.grants.find((g) => g.id === a.grant);
      put(c.zone === "hand" ? 1 : 0);
      put(c.zone === "discard" ? 1 : 0);
      put(grant?.label === "Your turn" ? 1 : 0);
      put(grant?.source === "discard" ? 1 : 0);
      for (const col of COLORS) put(d.color === col ? 1 : 0);
      put(d.printed_values[0] / 12);
      put(Math.max(...d.printed_values) / 12);
      put(d.printed_values.length > 1 ? 1 : 0);
      for (const r of ["common", "uncommon", "rare", "mythic rare"])
        put(d.rarity === r ? 1 : 0);
      for (const t of [
        "While in play",
        "After playing this mood",
        "To play this card",
      ])
        put(d.ability_types.includes(t) ? 1 : 0);
      put((heuristic(v, c.uid) + 10) / 40);
      put(c.value / 12);
      put(v.hand.filter((h) => h.color === d.color).length / 4);
      x[OFFSET.card + cardIndex[c.def]] = 1;
      i = OFFSET.thermo;
      thermometer((heuristic(v, c.uid) + 10) / 40, 8);
      thermometer(c.value / 12, 6);
      thermometer((me.score - maxOpp + 30) / 60, 6);
      thermometer((me.score - maxOpp + c.value + 30) / 60, 8);
    }
  } else {
    const q = v.prompt!,
      ids = a.selected,
      cs = visibleCards(v),
      chosen = ids
        .map((id) => cs.find((c) => c.uid === id))
        .filter((c): c is PublicCard => !!c),
      players = ids
        .map((id) => v.players.find((p) => p.id === id))
        .filter((p): p is View["players"][number] => !!p),
      title = q.title.toLowerCase();
    i = OFFSET.choice;
    put(ids.length / 3);
    put(ids.length === 0 ? 1 : 0);
    put(sum(chosen) / 20);
    put(chosen.filter((c) => c.owner === v.you).length / 3);
    put(
      chosen.filter((c) => c.owner !== v.you && c.zone === "play").length / 3,
    );
    for (const zone of ["hand", "discard", "play"])
      put(chosen.filter((c) => c.zone === zone).length / 3);
    put(
      chosen.reduce(
        (n, c) => n + Math.max(...definitions[c.copy ?? c.def].printed_values),
        0,
      ) / 24,
    );
    for (const flag of ["yes", "one", "all", "left", "wins"])
      put(ids.includes(flag) ? 1 : 0);
    put(ids.length && /^\d+$/.test(ids[0]) ? Number(ids[0]) / 12 : 0);
    put(ids.includes(v.you) ? 1 : 0);
    put(players.filter((p) => p.id !== v.you).length / 3);
    put(players.reduce((n, p) => n + p.handCount, 0) / 8);
    put(players.reduce((n, p) => n + p.score, 0) / 30);
    for (const col of COLORS) put(ids[0] === col ? 1 : 0);
    put((choiceScore(v, ids) + 20) / 60);
    put(q.options.length / 10);
    put(q.min / 3);
    put(q.max / 3);
    put(chosen.some((c) => c.suppressed) ? 1 : 0);
    i = OFFSET.thermo;
    thermometer((choiceScore(v, ids) + 20) / 60, 8);
    thermometer(sum(chosen) / 20, 6);
    thermometer((me.score - maxOpp + 30) / 60, 6);
    thermometer(ids.length / 3, 8);
    const [source, ...rest] = q.title.split(" · ");
    const card = cardByName[source];
    if (card !== undefined) x[OFFSET.card + card] = 1;
    for (const word of (rest.join(" ") || title).toLowerCase().split(/[^a-z]+/))
      if (word.length > 2) x[OFFSET.hash + hashWord(word)] = 1;
  }
  for (let f = OFFSET.action; f < FEATURES; f++) x[f] *= GAIN;
  return x;
}
export function candidates(v: View, seed: number): Action[] {
  if (v.prompt)
    return selections(v, generator(seed)).map((selected) => ({
      type: "choose",
      prompt: v.prompt!.id,
      selected,
    }));
  const plays = Object.entries(v.playable).flatMap(([card, grants]) =>
    grants.map((grant) => ({ type: "play", card, grant }) as const),
  );
  return [{ type: "pass" }, ...plays];
}
export interface Code {
  index: Int32Array;
  activity: Float64Array;
}
export class FlyBrain {
  readonly nInputs = circuit.inputs.length;
  readonly nKc = circuit.kc.length;
  readonly nMbon = circuit.mbon.length;
  readonly k = Math.max(1, Math.round(SPARSITY * circuit.kc.length));
  // Feature -> input neuron. Strongest Kenyon-cell drivers receive the first
  // features; inhibitory projection neurons receive no game input.
  readonly featureNeuron: Int32Array;
  // Projection neuron -> Kenyon cell synapses, normalized per Kenyon cell.
  private readonly pnPre: Int32Array;
  private readonly pnPost: Int32Array;
  private readonly pnW: Float64Array;
  // Kenyon cell -> MBON synapses in CSR form by Kenyon cell.
  readonly kcPtr: Int32Array;
  readonly kcMbon: Int32Array;
  readonly synapses: Float64Array;
  readonly valence: Float64Array;
  weights: Float64Array;
  private readout: Float64Array;
  constructor(params?: FlyParams) {
    const excitatory = circuit.inputs
        .map((n, i) => (n.sign > 0 ? i : -1))
        .filter((i) => i >= 0),
      inhibitory = circuit.inputs
        .map((n, i) => (n.sign < 0 ? i : -1))
        .filter((i) => i >= 0),
      order = [...excitatory, ...inhibitory];
    this.featureNeuron = new Int32Array(FEATURES).map(
      (_, i) => order[i % order.length],
    );
    const pn = circuit.pnToKc,
      m = pn.length / 3;
    this.pnPre = new Int32Array(m);
    this.pnPost = new Int32Array(m);
    this.pnW = new Float64Array(m);
    const totalIn = new Float64Array(this.nKc);
    for (let e = 0; e < m; e++) totalIn[pn[e * 3 + 1]] += pn[e * 3 + 2];
    for (let e = 0; e < m; e++) {
      this.pnPre[e] = pn[e * 3];
      this.pnPost[e] = pn[e * 3 + 1];
      this.pnW[e] =
        (circuit.inputs[pn[e * 3]].sign * pn[e * 3 + 2]) /
        totalIn[pn[e * 3 + 1]];
    }
    const km = circuit.kcToMbon,
      n = km.length / 3;
    this.kcPtr = new Int32Array(this.nKc + 1);
    this.kcMbon = new Int32Array(n);
    this.synapses = new Float64Array(n);
    const totalMb = new Float64Array(this.nMbon);
    for (let e = 0; e < n; e++) totalMb[km[e * 3 + 1]] += km[e * 3 + 2];
    for (let e = 0; e < n; e++) {
      if (e && km[e * 3] < km[(e - 1) * 3])
        throw new Error("Kenyon cell edges must be sorted.");
      this.kcMbon[e] = km[e * 3 + 1];
      this.synapses[e] = km[e * 3 + 2] / totalMb[km[e * 3 + 1]];
      this.kcPtr[km[e * 3] + 1]++;
    }
    for (let j = 0; j < this.nKc; j++) this.kcPtr[j + 1] += this.kcPtr[j];
    this.valence = new Float64Array(circuit.mbon.map((x) => x.sign));
    if (params && params.edges !== n)
      throw new Error("Trained weights do not match the circuit.");
    this.weights = params
      ? new Float64Array(params.weights)
      : new Float64Array(n);
    this.readout = new Float64Array(this.nKc);
    this.refresh();
  }
  // Effective drive from each Kenyon cell to the fly's approach-versus-avoid
  // balance: its plastic synapses weighted by each MBON's sign.
  refresh() {
    for (let j = 0; j < this.nKc; j++) {
      let u = 0;
      for (let e = this.kcPtr[j]; e < this.kcPtr[j + 1]; e++)
        u += this.weights[e] * this.valence[this.kcMbon[e]];
      this.readout[j] = u;
    }
  }
  // Sparse Kenyon-cell code for one feature vector: feed-forward drive from the
  // projection neurons, then APL-style winner-take-all inhibition.
  code(x: Float64Array): Code {
    const drive = new Float64Array(this.nInputs);
    for (let f = 0; f < FEATURES; f++) drive[this.featureNeuron[f]] += x[f];
    const input = new Float64Array(this.nKc);
    for (let e = 0; e < this.pnPre.length; e++)
      input[this.pnPost[e]] += this.pnW[e] * drive[this.pnPre[e]];
    const ranked = Array.from(input.keys()).sort((a, b) => input[b] - input[a]);
    const threshold = Math.max(0, input[ranked[this.k]] ?? 0),
      index: number[] = [],
      activity: number[] = [];
    let total = 0;
    for (let r = 0; r < this.k; r++) {
      const j = ranked[r],
        a = input[j] - threshold;
      if (a <= 0) break;
      index.push(j);
      activity.push(a);
      total += a;
    }
    return {
      index: Int32Array.from(index),
      activity: Float64Array.from(activity, (a) => a / total),
    };
  }
  score(code: Code): number {
    let s = 0;
    for (let r = 0; r < code.index.length; r++)
      s += code.activity[r] * this.readout[code.index[r]];
    return s;
  }
  params(meta?: Record<string, unknown>): FlyParams {
    return {
      version: 1,
      edges: this.weights.length,
      weights: Array.from(this.weights, (w) => Number(w.toFixed(5))),
      meta,
    };
  }
}
let shared: FlyBrain | undefined;
export function defaultBrain() {
  return (shared ??= new FlyBrain(trainedData as FlyParams));
}
// Plays by this player since the table last moved on. Some rules-legal cycles
// (Anger discarding Grief and Duplicity, Grief replaying them from the discard
// pile) can be repeated forever, and a deterministic player would never stop.
export const TURN_PLAY_LIMIT = 12;
export function playsThisTurn(v: View): number {
  const me = v.players.find((p) => p.id === v.you)!.name,
    boundary =
      /( won round | wins the game!$|^Round \d+ ended|^The table is set)/;
  let plays = 0;
  for (let i = v.log.length - 1; i >= 0; i--) {
    const text = v.log[i].text;
    if (boundary.test(text)) break;
    if (text.endsWith(".") && / played /.test(text)) {
      if (text.startsWith(`${me} played `)) plays++;
      else break;
    }
  }
  return plays;
}
export function flyAction(v: View, seed = 1, brain = defaultBrain()): Action {
  const rand = generator(seed),
    options = candidates(v, seed);
  if (!v.prompt && playsThisTurn(v) >= TURN_PLAY_LIMIT) return { type: "pass" };
  let best = options[0],
    bestScore = -Infinity;
  for (const action of options) {
    const s = brain.score(brain.code(encode(v, action))) + rand() * 1e-4;
    if (s > bestScore) {
      bestScore = s;
      best = action;
    }
  }
  return best;
}
