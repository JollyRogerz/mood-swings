import {
  act,
  addPlayer,
  createGame,
  publicView,
  RuleError,
  startGame,
} from "../../src/game/engine";
import { botAction } from "../../src/game/bot";
import { defaultBrain, encode, candidates } from "../../src/game/fly";
import type { Difficulty } from "../../src/game/types";
const brain = defaultBrain();
// 1. How much do Kenyon-cell codes differ between candidates of the same decision?
const overlaps: number[] = [];
for (let seed = 1; seed <= 20; seed++) {
  let g = createGame("a", "A", seed);
  addPlayer(g, "b", "B");
  startGame(g, "a");
  let n = 0;
  while (g.status !== "finished" && n++ < 200) {
    const actor = g.prompt?.actor ?? g.order[g.turnIndex],
      v = publicView(g, actor);
    const cs = candidates(v, n);
    if (cs.length > 1) {
      const codes = cs.map((c) => new Set(brain.code(encode(v, c)).index));
      const a = codes[0],
        b = codes[1];
      overlaps.push([...a].filter((x) => b.has(x)).length / a.size);
    }
    g = act(g, actor, botAction(v, "normal", n));
  }
}
console.log(
  "mean code overlap between first two candidates",
  (overlaps.reduce((x, y) => x + y, 0) / overlaps.length).toFixed(3),
  "decisions",
  overlaps.length,
);
// 2. Baselines: 2-player win rates against Hard.
for (const level of ["easy", "normal", "hard"] as Difficulty[]) {
  let wins = 0,
    games = 200;
  for (let i = 0; i < games; i++) {
    let g = createGame("p0", "P0", 5000 + i);
    addPlayer(g, "p1", "P1");
    startGame(g, "p0");
    const seats: Difficulty[] = i % 2 ? [level, "hard"] : ["hard", level];
    let n = 0;
    while (g.status !== "finished" && n++ < 800) {
      const actor = g.prompt?.actor ?? g.order[g.turnIndex];
      const v = publicView(g, actor);
      try {
        g = act(g, actor, botAction(v, seats[Number(actor.slice(1))], n));
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
        g = act(g, actor, botAction(v, "easy", n * 31));
      }
    }
    if ((i % 2 ? "p0" : "p1") === g.winner) wins++;
  }
  console.log(`${level} vs hard: ${((100 * wins) / games).toFixed(1)}%`);
}
