// Teach the fruit-fly mushroom body to play Mood Swings.
//
// Only Kenyon cell -> MBON synapses change, the site of dopamine-driven learning
// in the real fly. Two phases:
//   1. Imitation: watch the Hard bot play and nudge synapses toward its choices.
//   2. Reinforcement: the fly plays whole games against the existing bots; a win
//      or loss acts as the dopamine signal that strengthens or weakens the
//      synapses active behind each decision (REINFORCE with a running baseline).
// Everything the fly sees is the ordinary player view, never hidden cards.
//
//   npx tsx scripts/fly/train.ts --imitate 300 --reinforce 1500 --eval 300
import { writeFileSync } from "node:fs";
import { botAction } from "../../src/game/bot";
import {
  act,
  addPlayer,
  createGame,
  publicView,
  RuleError,
  startGame,
} from "../../src/game/engine";
import {
  candidates,
  circuit,
  encode,
  FlyBrain,
  playsThisTurn,
  TURN_PLAY_LIMIT,
  type Code,
} from "../../src/game/fly";
import type { Action, Difficulty, Game } from "../../src/game/types";
type Seat = Difficulty;
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith("--") ? [a.slice(2), all[i + 1] ?? "true"] : [],
    )
    .filter((x) => x.length),
);
const num = (k: string, d: number) =>
  args[k] === undefined ? d : Number(args[k]);
const IMITATE = num("imitate", 300),
  EPOCHS = num("epochs", 3),
  REINFORCE = num("reinforce", 1500),
  EVAL = num("eval", 300),
  LR = num("lr", 0.02),
  DECAY = num("decay", 1e-4),
  SEED = num("seed", 2026),
  OUT = args.out ?? "data/fly/weights.json";
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
interface Example {
  codes: Code[];
  chosen: number;
  player: string;
  round: number;
}
interface Result {
  winner: string;
  roundWinners: Record<number, string>;
  examples: Example[];
}
const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
// Play one game. Seats marked "fly" are decided by the brain (sampled or argmax);
// with `teacher`, every seat is played by that bot and its decisions are recorded.
function playGame(
  brain: FlyBrain,
  seed: number,
  seats: Seat[],
  mode: "teacher" | "sample" | "argmax",
  tau = 1,
): Result {
  const rand = rng(seed * 7919);
  let g: Game = createGame("p0", "P0", seed);
  for (let i = 1; i < seats.length; i++) addPlayer(g, `p${i}`, `P${i}`);
  startGame(g, "p0");
  const examples: Example[] = [],
    roundWinners: Record<number, string> = {};
  let n = 0;
  while (g.status !== "finished" && n++ < 800) {
    const actor = g.prompt?.actor ?? g.order[g.turnIndex],
      seat = seats[Number(actor.slice(1))],
      view = publicView(g, actor);
    let action: Action;
    if (mode === "teacher") {
      action = botAction(view, seat === "fly" ? "hard" : seat, n);
      if (seat === "fly") {
        const options = candidates(view, n),
          chosen = options.findIndex((o) => same(o, action));
        if (chosen >= 0 && options.length > 1)
          examples.push({
            codes: options.map((o) => brain.code(encode(view, o))),
            chosen,
            player: actor,
            round: g.round,
          });
      }
    } else if (seat !== "fly") action = botAction(view, seat, n);
    else if (!view.prompt && playsThisTurn(view) >= TURN_PLAY_LIMIT)
      action = { type: "pass" };
    else {
      const options = candidates(view, n),
        codes = options.map((o) => brain.code(encode(view, o))),
        scores = codes.map((c) => brain.score(c));
      let chosen = 0;
      if (mode === "argmax") {
        for (let i = 1; i < scores.length; i++)
          if (scores[i] > scores[chosen]) chosen = i;
      } else {
        const p = softmax(scores, tau);
        let r = rand();
        for (chosen = 0; chosen < p.length - 1 && r >= p[chosen]; chosen++)
          r -= p[chosen];
      }
      action = options[chosen];
      if (options.length > 1)
        examples.push({ codes, chosen, player: actor, round: g.round });
    }
    let next: Game | undefined;
    try {
      next = act(g, actor, action);
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      // The same fallback the server uses: a rejected move is retried as Easy.
      if (examples.length && examples[examples.length - 1].player === actor)
        examples.pop();
      for (let attempt = 0; attempt < 8 && !next; attempt++)
        try {
          next = act(g, actor, botAction(view, "easy", n * 31 + attempt));
        } catch {}
      if (!next) throw error;
    }
    if (
      next.lastRound &&
      next.lastRound.round !== g.lastRound?.round &&
      next.lastRound.winner
    )
      roundWinners[next.lastRound.round] = next.lastRound.winner;
    g = next;
  }
  if (g.status !== "finished") {
    // Count a stalled game as a loss for everyone and leave a trace to debug.
    console.warn(
      `game ${seed} (${seats.join(",")}) did not finish: round ${g.round}, ` +
        `prompt ${g.prompt?.title ?? "none"}, grants ${JSON.stringify(g.grants)}, ` +
        `log: ${g.log
          .slice(-12)
          .map((l) => l.text)
          .join(" | ")}`,
    );
    return { winner: "", roundWinners, examples: [] };
  }
  return { winner: g.winner!, roundWinners, examples };
}
function softmax(scores: number[], tau: number) {
  const max = Math.max(...scores),
    e = scores.map((s) => Math.exp((s - max) / tau)),
    z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
}
// Adam over the plastic synapses, projected to non-negative weights: a synapse can
// be depressed to silence but never flip sign.
class Dopamine {
  m: Float64Array;
  v: Float64Array;
  grad: Float64Array;
  t = 0;
  constructor(readonly brain: FlyBrain) {
    this.m = new Float64Array(brain.weights.length);
    this.v = new Float64Array(brain.weights.length);
    this.grad = new Float64Array(brain.weights.length);
  }
  // Accumulate the policy gradient of one decision, scaled by `advantage`.
  accumulate(ex: Example, advantage: number, tau = 1) {
    const b = this.brain,
      p = softmax(
        ex.codes.map((c) => b.score(c)),
        tau,
      );
    for (let k = 0; k < ex.codes.length; k++) {
      const coef = ((k === ex.chosen ? 1 : 0) - p[k]) * advantage;
      if (!coef) continue;
      const code = ex.codes[k];
      for (let r = 0; r < code.index.length; r++) {
        const j = code.index[r],
          a = code.activity[r] * coef;
        for (let e = b.kcPtr[j]; e < b.kcPtr[j + 1]; e++)
          this.grad[e] += a * b.valence[b.kcMbon[e]];
      }
    }
  }
  step(lr: number) {
    const b = this.brain,
      beta1 = 0.9,
      beta2 = 0.999;
    this.t++;
    for (let e = 0; e < b.weights.length; e++) {
      const g = this.grad[e] - DECAY * b.weights[e];
      this.m[e] = beta1 * this.m[e] + (1 - beta1) * g;
      this.v[e] = beta2 * this.v[e] + (1 - beta2) * g * g;
      const mhat = this.m[e] / (1 - beta1 ** this.t),
        vhat = this.v[e] / (1 - beta2 ** this.t);
      b.weights[e] = Math.max(
        0,
        b.weights[e] + (lr * mhat) / (Math.sqrt(vhat) + 1e-8),
      );
    }
    this.grad.fill(0);
    b.refresh();
  }
}
function lineup(rand: () => number, learner: boolean): Seat[] {
  const n = 2 + Math.floor(rand() * 3),
    pool: Seat[] = ["hard", "hard", "normal", "hard", "normal", "easy"],
    seats: Seat[] = [];
  for (let i = 0; i < n; i++)
    seats.push(pool[Math.floor(rand() * pool.length)]);
  if (learner) seats[Math.floor(rand() * n)] = "fly";
  return seats;
}
function evaluate(
  brain: FlyBrain,
  opponents: Seat[],
  games: number,
  seed: number,
) {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const seats = [...opponents];
    seats.splice(i % (opponents.length + 1), 0, "fly");
    const r = playGame(brain, seed + i, seats, "argmax");
    if (r.winner && seats[Number(r.winner.slice(1))] === "fly") wins++;
  }
  return wins / games;
}
const brain = new FlyBrain(),
  dopamine = new Dopamine(brain),
  rand = rng(SEED),
  started = Date.now();
// Model selection: keep the synapses that did best on a fixed checkpoint set
// (seeds 800000+), evaluated afterwards on a separate set (seeds 700000+).
let best = {
  score: -1,
  weights: new Float64Array(brain.weights),
  stage: "untrained",
};
function checkpoint(stage: string) {
  const score = evaluate(brain, ["hard"], 100, 800000);
  console.log(
    `  ${stage}: argmax vs Hard (2p, 100 games) ${(100 * score).toFixed(1)}%`,
  );
  if (score > best.score)
    best = { score, weights: new Float64Array(brain.weights), stage };
  return score;
}
console.log(`circuit: ${JSON.stringify(circuit.counts)}`);
if (IMITATE) {
  const examples: Example[] = [];
  for (let i = 0; i < IMITATE; i++) {
    const seats = lineup(rand, false).map((): Seat => "fly");
    examples.push(...playGame(brain, SEED + i, seats, "teacher").examples);
  }
  console.log(
    `imitation: ${examples.length} Hard decisions from ${IMITATE} games`,
  );
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    let agree = 0,
      n = 0;
    for (let i = examples.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [examples[i], examples[j]] = [examples[j], examples[i]];
    }
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i],
        scores = ex.codes.map((c) => brain.score(c));
      if (scores.indexOf(Math.max(...scores)) === ex.chosen) agree++;
      n++;
      dopamine.accumulate(ex, 1);
      if (i % 32 === 31) dopamine.step(LR);
    }
    dopamine.step(LR);
    console.log(
      `  epoch ${epoch + 1}: agreement with Hard ${((100 * agree) / n).toFixed(1)}%`,
    );
  }
  checkpoint("after imitation");
}
if (REINFORCE) {
  let baseline = 0,
    wins = 0;
  for (let i = 0; i < REINFORCE; i++) {
    const seats = lineup(rand, true),
      r = playGame(brain, SEED + 100000 + i, seats, "sample", 1),
      won = !!r.winner && seats[Number(r.winner.slice(1))] === "fly";
    if (won) wins++;
    for (const ex of r.examples) {
      const reward =
        (r.winner === ex.player ? 1 : -1) +
        (r.roundWinners[ex.round]
          ? r.roundWinners[ex.round] === ex.player
            ? 0.5
            : -0.5
          : 0);
      baseline += 0.01 * (reward - baseline);
      dopamine.accumulate(
        ex,
        (reward - baseline) / Math.max(1, r.examples.length / 8),
      );
    }
    dopamine.step(LR * 0.5);
    if (i % 250 === 249) {
      console.log(
        `reinforcement: game ${i + 1}, sampled win rate ${((100 * wins) / 250).toFixed(1)}%`,
      );
      checkpoint(`after ${i + 1} reinforcement games`);
      wins = 0;
    }
  }
}
brain.weights.set(best.weights);
brain.refresh();
console.log(
  `keeping synapses from ${best.stage} (${(100 * best.score).toFixed(1)}% on the checkpoint set)`,
);
const evaluation: Record<string, number> = {};
if (EVAL) {
  for (const [label, opponents] of Object.entries({
    "2p vs Hard": ["hard"],
    "2p vs Normal": ["normal"],
    "3p vs Hard and Normal": ["hard", "normal"],
    "4p vs Hard, Normal, Easy": ["hard", "normal", "easy"],
  } as Record<string, Seat[]>)) {
    evaluation[label] = evaluate(brain, opponents, EVAL, 700000);
    console.log(
      `eval ${label}: fly wins ${(100 * evaluation[label]).toFixed(1)}% of ${EVAL}`,
    );
  }
}
const nonzero = brain.weights.filter((w) => w > 0).length;
writeFileSync(
  OUT,
  JSON.stringify(
    brain.params({
      trained: new Date().toISOString().slice(0, 10),
      seed: SEED,
      imitationGames: IMITATE,
      reinforcementGames: REINFORCE,
      evaluationGames: EVAL,
      selected: best.stage,
      evaluation,
      activeSynapses: nonzero,
      circuit: circuit.counts,
    }),
  ),
);
console.log(
  `saved ${OUT}: ${nonzero}/${brain.weights.length} active synapses, ${((Date.now() - started) / 1000).toFixed(0)}s`,
);
