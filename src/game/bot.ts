import { act, baseScores, createGame, publicView } from "./engine";
import { catalog, definitions } from "./catalog";
import type {
  Action,
  Difficulty,
  Game,
  Prompt,
  PublicCard,
  View,
} from "./types";
// The policy receives the same projection as a human. It never receives the real
// game, hidden hands, shuffle seed, or deck order.
function generator(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const visibleCards = (v: View) => [...v.hand, ...v.moods, ...v.discard];
function selections(v: View, rand: () => number): string[][] {
  const q = v.prompt!,
    options = q.options.map((o) => o.id),
    cs = visibleCards(v),
    sets: string[][] = [[]];
  for (const id of options) sets.push([id]);
  if (q.max >= 2)
    for (let a = 0; a < options.length; a++)
      for (let b = a + 1; b < options.length; b++)
        sets.push([options[a], options[b]]);
  if (q.max > 2) {
    sets.push(options.slice(0, q.max));
    for (let trial = 0; trial < 40; trial++) {
      const shuffled = [...options];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      sets.push(
        shuffled.slice(
          0,
          Math.min(q.max, q.min + Math.floor(rand() * (q.max - q.min + 1))),
        ),
      );
    }
  }
  return sets.filter((ids) => {
    if (
      ids.length < q.min ||
      ids.length > q.max ||
      (q.constraints?.allowedCounts &&
        !q.constraints.allowedCounts.includes(ids.length))
    )
      return false;
    const chosen = ids
        .map((id) => cs.find((c) => c.uid === id))
        .filter((c): c is PublicCard => !!c),
      constraints = q.constraints;
    if (
      constraints?.maxValue !== undefined &&
      chosen.reduce((n, c) => n + c.value, 0) > constraints.maxValue
    )
      return false;
    if (
      constraints?.differentPlayers &&
      new Set(chosen.map((c) => c.owner)).size !== chosen.length
    )
      return false;
    if (constraints?.samePlayer && new Set(chosen.map((c) => c.owner)).size > 1)
      return false;
    if (
      constraints?.matchingPair &&
      chosen.length === 2 &&
      chosen[0].color !== chosen[1].color &&
      chosen[0].value !== chosen[1].value
    )
      return false;
    return true;
  });
}
function choiceScore(v: View, ids: string[]): number {
  const q = v.prompt!,
    title = q.title.toLowerCase(),
    cs = visibleCards(v),
    chosen = ids
      .map((id) => cs.find((c) => c.uid === id))
      .filter((c): c is PublicCard => !!c),
    own = (c: PublicCard) => c.owner === v.you;
  const myScore = v.players.find((p) => p.id === v.you)?.score ?? 0,
    maxOpponent = Math.max(
      0,
      ...v.players.filter((p) => p.id !== v.you).map((p) => p.score),
    );
  if (title.includes("after scoring"))
    return ids.reduce((n, id) => {
      const label = q.options.find((o) => o.id === id)?.label ?? "";
      return (
        n +
        (label.includes("swap")
          ? myScore < maxOpponent
            ? 20
            : -10
          : label.includes("bashfulness")
            ? myScore >= maxOpponent
              ? 12
              : -2
            : 0)
      );
    }, 0);
  if (title.includes("score a mood one extra time"))
    return chosen.reduce((n, c) => n + c.value, 0);
  if (title.includes("choose a direction")) return ids[0] === "left" ? 1 : 0;
  if (ids.includes("yes"))
    return title.includes("duplicity")
      ? 7
      : v.moods.reduce((n, c) => n + (own(c) ? -c.value : c.value), 0);
  if (ids.includes("one") || ids.includes("all")) {
    const colors = title.includes("contempt")
      ? ["green", "white"]
      : title.includes("hesitation")
        ? ["red", "green"]
        : ["black", "red"];
    const scores = v.moods
      .filter((c) => colors.includes(c.color))
      .map((c) => (own(c) ? -1 : 1) * c.value);
    return ids[0] === "all"
      ? scores.reduce((a, b) => a + b, 0)
      : Math.max(0, ...scores);
  }
  if (title.includes("corruption"))
    return ids.includes("wins")
      ? myScore >= maxOpponent
        ? 10
        : -15
      : ids.length
        ? 3
        : 0;
  if (title.includes("choose a color")) {
    const col = ids[0];
    if (!col) return 0;
    return (
      v.moods.filter((c) => c.color === col).length +
      v.discard.filter((c) => c.color === col).length +
      (title.includes("imagination")
        ? v.hand.filter((c) => c.color === col).length * 0.5
        : 0)
    );
  }
  if (title.includes("choose a value")) {
    const n = Number(ids[0]);
    return v.moods
      .filter((c) => c.value === n)
      .reduce((sum, c) => sum + (own(c) ? -c.value : c.value), 0);
  }
  if (title.includes("creativity"))
    return chosen.reduce(
      (sum, c) =>
        sum +
        Math.max(...definitions[c.copy ?? c.def].printed_values) +
        (definitions[c.copy ?? c.def].ability_types.includes("While in play")
          ? 1
          : 0),
      0,
    );
  if (title.includes("encouragement"))
    return chosen.reduce(
      (sum, c) =>
        sum +
        (own(c) ? 1 : -1) *
          (Math.max(...definitions[c.copy ?? c.def].printed_values) - c.value),
      0,
    );
  if (title.includes("sneakiness"))
    return ids.reduce(
      (n, id) => n + (v.players.find((p) => p.id === id)?.score ?? 0) - myScore,
      0,
    );
  if (title.includes("who starts") || title.includes("who will start"))
    return ids.includes(v.you) ? 5 : 0;
  if (title.includes("generosity"))
    return ids.reduce(
      (n, id) => n - (v.players.find((p) => p.id === id)?.score ?? 0),
      0,
    );
  if (title.includes("reveal a random") || title.includes("curiosity"))
    return ids.reduce(
      (n, id) =>
        n +
        (v.players.find((p) => p.id === id)?.handCount ?? 0) +
        (id !== v.you ? 1 : 0),
      0,
    );
  if (title.includes("choose opponents") || title.includes("suspicion"))
    return ids.reduce((n, id) => n + (id === v.you ? -5 : 2), 0);
  if (title.includes("pride"))
    return ids.reduce(
      (n, id) => n + v.moods.filter((c) => c.owner === id).length,
      0,
    );
  if (
    title.includes("choose an opponent") ||
    title.includes("choose another player") ||
    title.includes("who receives") ||
    title.includes("choose a player with")
  )
    return ids.reduce(
      (n, id) => n + (v.players.find((p) => p.id === id)?.handCount ?? 0),
      0,
    );
  let score = 0;
  for (const c of chosen) {
    const printed = definitions[c.def].printed_values[0];
    if (c.zone === "hand") {
      score -= printed + 1;
      if (
        [
          "ambition",
          "dignity",
          "embarrassment",
          "cheer",
          "delight",
          "faith",
          "shame",
          "fascination",
          "condescension",
        ].some((id) => title.startsWith(id))
      )
        score += 5;
      if (title.startsWith("doubt") || title.startsWith("zeal")) score += 3;
    } else if (c.zone === "discard") {
      score += title.startsWith("cynicism") ? -printed : printed + 1;
    } else if (
      title.includes("borrow an opponent") ||
      title.includes("opponent’s mood") ||
      title.includes("choose a mood to give back")
    ) {
      score += own(c) ? -c.value : c.value + 2;
    } else score += (own(c) ? -1 : 1) * (c.value + 1);
  }
  if (
    ids.length &&
    [
      "bravado",
      "angst",
      "hostility",
      "worry",
      "thrill",
      "infatuation",
      "fear",
    ].some((id) => title.startsWith(id))
  )
    score += 5;
  if (ids.length && title.startsWith("nostalgia")) score += 1;
  return score;
}
function heuristic(v: View, uid: string): number {
  const c = visibleCards(v).find((c) => c.uid === uid)!,
    d = definitions[c.def],
    my = v.players.find((p) => p.id === v.you)!.score,
    opponents = v.players.filter((p) => p.id !== v.you),
    max = Math.max(0, ...opponents.map((p) => p.score));
  let score = d.printed_values[0];
  if (d.printed_values.length > 1)
    score = (d.printed_values[0] + Math.max(...d.printed_values)) / 2;
  if (
    [
      "charity",
      "hope",
      "grace",
      "duplicity",
      "idealism",
      "validation",
      "grief",
      "harmony",
      "benevolence",
      "eagerness",
      "friendliness",
      "kindness",
      "gluttony",
      "insecurity",
    ].includes(d.id)
  )
    score += Math.min(v.hand.length - 1, 2) * 2.5;
  if (
    [
      "anger",
      "shock",
      "spite",
      "courage",
      "pacifism",
      "hate",
      "conviction",
      "panic",
      "rejection",
      "denial",
      "scorn",
      "meekness",
    ].includes(d.id)
  )
    score +=
      Math.max(
        0,
        ...v.moods.filter((m) => m.owner !== v.you).map((m) => m.value),
      ) * 0.8;
  if (["wrath", "bitterness", "fickleness", "rage"].includes(d.id))
    score += max - my;
  if (d.id === "sadness") score = v.discard.length * 2;
  if (d.id === "euphoria") score = v.moods.length + 1;
  if (d.id === "sloth") score = 3 + v.hand.length - 1;
  if (d.id === "envy")
    score =
      2 *
        Math.max(
          0,
          ...opponents.map(
            (p) => v.moods.filter((m) => m.owner === p.id).length,
          ),
        ) -
      2;
  if (d.id === "vanity")
    score =
      (v.moods.filter((m) => m.owner === v.you).length + 1) *
      (v.hand.length === 1 ? 3 : 1);
  if (d.id === "sneakiness") score = max - my - 5;
  if (d.id === "exhilaration")
    score =
      my -
      Math.min(
        0,
        ...v.moods.filter((m) => m.owner === v.you).map((m) => m.value),
      );
  if (d.id === "awe") score = my < max ? 3 : -5;
  if (d.id === "love")
    score =
      new Set([...v.moods.map((m) => m.color), "green"]).size === 5 ? 12 : 4;
  return score;
}
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
