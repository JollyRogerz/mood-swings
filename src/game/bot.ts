import { act, baseScores, createGame, publicView } from "./engine";
import { catalog } from "./catalog";
import { flyAction } from "./fly";
import {
  choiceScore,
  generator,
  heuristic,
  selections,
  visibleCards,
} from "./heuristics";
import type { Action, Difficulty, Game, View } from "./types";
// The policy receives the same projection as a human. It never receives the real
// game, hidden hands, shuffle seed, or deck order.
// Reconstruct a sampled possible game strictly from public information. Unknown
// cards are sampled from the catalog, never copied from the actual server state.
function belief(v: View, seed: number): Game {
  const rand = generator(seed),
    g = createGame(v.players[0].id, v.players[0].name, seed);
  g.status = "playing";
  g.players = structuredClone(v.players);
  g.host = v.host;
  g.order = [...(v.order.length ? v.order : v.players.map((p) => p.id))];
  g.turnIndex = g.order.indexOf(v.you);
  g.round = v.round;
  g.turn = 1000;
  g.grants = structuredClone(v.grants);
  g.suppressions = structuredClone(v.suppressions);
  g.cards = visibleCards(v).map((c) => ({ ...c }));
  g.discard = v.discard.map((c) => c.uid);
  g.serial = Math.max(0, ...g.cards.map((c) => c.serial)) + 100;
  const known = new Set(g.cards.map((c) => c.def)),
    pool = catalog.filter((c) => !known.has(c.id)).map((c) => c.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let n = 0;
  const addUnknown = (zone: "hand" | "deck", owner: string) => {
    const uid = `belief-${n++}`,
      def = pool.pop() ?? catalog[Math.floor(rand() * catalog.length)].id;
    g.cards.push({ uid, def, zone, owner, entered: 0, serial: 0 });
    if (zone === "deck") g.deck.push(uid);
  };
  for (const p of v.players)
    if (p.id !== v.you)
      for (let i = 0; i < p.handCount; i++) addUnknown("hand", p.id);
  for (let i = 0; i < v.deckCount; i++) addUnknown("deck", "");
  return g;
}
function utility(g: Game, you: string) {
  const scores = baseScores(g),
    mine = scores[you],
    threat = Math.max(
      0,
      ...g.players.filter((p) => p.id !== you).map((p) => scores[p.id]),
    );
  return (
    2 * (mine - threat) +
    g.cards.filter((c) => c.zone === "hand" && c.owner === you).length * 0.8 +
    (g.order[g.turnIndex] === you ? g.grants.length * 2.5 : 0) +
    20 *
      ((g.players.find((p) => p.id === you)?.wins ?? 0) -
        Math.max(
          0,
          ...g.players.filter((p) => p.id !== you).map((p) => p.wins),
        ))
  );
}
export function botAction(v: View, difficulty: Difficulty, seed = 1): Action {
  if (difficulty === "fly") return flyAction(v, seed);
  const rand = generator(seed);
  if (v.prompt) {
    const candidates = selections(v, rand);
    if (!candidates.length)
      throw new Error(`No legal bot choice for ${v.prompt.title}`);
    const picked =
      difficulty === "easy"
        ? candidates[Math.floor(rand() * candidates.length)]
        : candidates
            .map((ids) => ({ ids, score: choiceScore(v, ids) + rand() * 0.05 }))
            .sort((a, b) => b.score - a.score)[0].ids;
    return { type: "choose", prompt: v.prompt.id, selected: picked };
  }
  const options = Object.entries(v.playable).flatMap(([card, grants]) =>
    grants.map((grant) => ({ type: "play", card, grant }) as const),
  );
  if (!options.length) return { type: "pass" };
  if (difficulty === "easy") {
    if (rand() < 0.08) return { type: "pass" };
    return options[Math.floor(rand() * options.length)];
  }
  if (difficulty === "normal")
    return options
      .map((a) => ({ a, score: heuristic(v, a.card) + rand() * 0.1 }))
      .sort((a, b) => b.score - a.score)[0].a;
  let best: Action = { type: "pass" },
    bestScore = -Infinity;
  const shortlist = [...options]
    .sort((a, b) => heuristic(v, b.card) - heuristic(v, a.card))
    .slice(0, 12);
  for (const action of [{ type: "pass" } as const, ...shortlist]) {
    let score = 0;
    for (let sample = 0; sample < 2; sample++) {
      try {
        let g = act(belief(v, seed + sample * 100003), v.you, action),
          steps = 0;
        while (g.prompt && steps++ < 30) {
          const pv = publicView(g, g.prompt.actor);
          g = act(g, g.prompt.actor, botAction(pv, "normal", seed + steps));
        }
        score += utility(g, v.you);
        if (action.type === "play") score += heuristic(v, action.card) * 0.2;
      } catch {
        score -= 1000;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}
