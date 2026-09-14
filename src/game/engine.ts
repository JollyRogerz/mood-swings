import { catalog, COLORS, definitions } from "./catalog";
import type {
  Action,
  Color,
  Game,
  Grant,
  Mood,
  Option,
  Prompt,
  PublicCard,
  Task,
  View,
} from "./types";
export class RuleError extends Error {}
const insist: (condition: unknown, message: string) => asserts condition = (
  c,
  m,
) => {
  if (!c) throw new RuleError(m);
};
export const definition = (m: Mood) => definitions[m.copy ?? m.def];
export const inPlay = (g: Game, p?: string) =>
  g.cards.filter((c) => c.zone === "play" && (!p || c.owner === p));
export const hand = (g: Game, p: string) =>
  g.cards.filter((c) => c.zone === "hand" && c.owner === p);
const card = (g: Game, id: string) => {
  const c = g.cards.find((c) => c.uid === id);
  insist(c, "Card not found.");
  return c;
};
const playerName = (g: Game, id: string) =>
  g.players.find((p) => p.id === id)?.name ?? "A player";
const active = (g: Game) => g.order[g.turnIndex];
const log = (g: Game, text: string) => {
  g.log.push({ id: ++g.serial, text });
  if (g.log.length > 120) g.log.shift();
};
function random(g: Game) {
  let t = (g.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(g: Game, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function createGame(host: string, name: string, seed: number): Game {
  return {
    version: 1,
    revision: 0,
    status: "lobby",
    players: [{ id: host, name, wins: 0, connected: true }],
    host,
    cards: [],
    deck: [],
    discard: [],
    round: 0,
    turn: 0,
    order: [],
    turnIndex: 0,
    rng: seed >>> 0,
    seed: seed >>> 0,
    serial: 0,
    grants: [],
    queue: [],
    suppressions: [],
    delayed: [],
    transfers: [],
    nextPlays: [],
    bans: [],
    noScoring: false,
    roundAward: 1,
    discardedRound: -1,
    scores: {},
    scoring: false,
    afterDone: [],
    log: [],
  };
}
export function addPlayer(g: Game, id: string, name: string) {
  insist(g.status === "lobby", "This game has already started.");
  insist(g.players.length < 4, "This table is full.");
  insist(!g.players.some((p) => p.id === id), "Already at this table.");
  g.players.push({ id, name, wins: 0, connected: true });
  g.revision++;
}
export function startGame(
  g: Game,
  actor: string,
  mode: "retail" | "all" = "retail",
  fixedDeck?: string[],
) {
  insist(actor === g.host, "Only the host can start.");
  insist(g.status === "lobby", "Already started.");
  insist(g.players.length >= 2, "Invite at least one friend.");
  let pool: string[] = [];
  if (fixedDeck) pool = [...fixedDeck];
  else if (mode === "all") pool = catalog.map((c) => c.id);
  else
    for (const [rarity, n] of Object.entries({
      common: 23,
      uncommon: 14,
      rare: 6,
      "mythic rare": 2,
    }))
      pool.push(
        ...shuffle(
          g,
          catalog.filter((c) => c.rarity === rarity),
        )
          .slice(0, n)
          .map((c) => c.id),
      );
  insist(pool.length >= g.players.length * 5, "Not enough cards.");
  insist(
    pool.every((id) => definitions[id]),
    "Unknown card in deck.",
  );
  g.cards = pool.map((def, i) => ({
    uid: `c${i + 1}`,
    def,
    zone: "deck",
    owner: "",
    entered: 0,
    serial: 0,
  }));
  g.deck = shuffle(
    g,
    g.cards.map((c) => c.uid),
  );
  for (const p of g.players) draw(g, p.id, 5);
  const seats = g.players.map((p) => p.id),
    first = Math.floor(random(g) * seats.length);
  g.order = [...seats.slice(first), ...seats.slice(0, first)];
  g.status = "playing";
  g.round = 1;
  g.turnIndex = 0;
  beginTurn(g);
  g.revision++;
  log(g, "The table is set. First to three round wins.");
}
export function color(g: Game, m: Mood): Color {
  if (m.zone !== "play") return definitions[m.def].color;
  const imag = inPlay(g)
    .filter((c) => definition(c).id === "imagination" && c.chosenColor)
    .sort((a, b) => b.serial - a.serial)[0];
  return imag?.chosenColor ?? definition(m).color;
}
export function suppressed(g: Game, m: Mood) {
  return g.suppressions.some(
    (s) =>
      s.target === m.uid &&
      (s.round === g.round ||
        (s.source && inPlay(g, s.controller).some((c) => c.uid === s.source))),
  );
}
export function value(g: Game, m: Mood): number {
  const d = definition(m);
  if (m.zone !== "play") return definitions[m.def].printed_values[0];
  if (suppressed(g, m)) return 0;
  const all = inPlay(g),
    own = inPlay(g, m.owner),
    others = g.players.filter((p) => p.id !== m.owner),
    count = (cs: Mood[], cols: Color[]) =>
      cs.filter((c) => cols.includes(color(g, c))).length;
  const countOthers = Math.max(0, ...others.map((p) => inPlay(g, p.id).length));
  const colorCount = (cs: Mood[]) => new Set(cs.map((c) => color(g, c))).size;
  let v = m.chosenValue ?? d.printed_values[0];
  const binary: Record<string, () => boolean> = {
    ambivalence: () => count(all, ["red", "green"]) >= 2,
    discipline: () => count(all, ["black", "red"]) >= 2,
    disgust: () => count(all, ["green", "white"]) >= 2,
    disregard: () => count(all, ["blue", "black"]) >= 2,
    frustration: () => count(all, ["white", "blue"]) >= 2,
    enjoyment: () => count(all, ["red", "white"]) >= 2,
    excitement: () => count(all, ["black", "green"]) >= 2,
    loyalty: () => count(all, ["green", "blue"]) >= 2,
    obsession: () => count(all, ["white", "black"]) >= 2,
    pity: () => count(all, ["blue", "red"]) >= 2,
    animosity: () => others.some((p) => hand(g, p.id).length >= 3),
    celebration: () =>
      others.every((p) => colorCount(own) > colorCount(inPlay(g, p.id))),
    chivalry: () => g.order[0] !== m.owner,
    triumph: () => g.order[0] === m.owner,
    determination: () => COLORS.some((c) => count(all, [c]) >= 3),
    fondness: () => g.players.every((p) => inPlay(g, p.id).length >= 3),
    glee: () => m.entered === g.round,
    patience: () => m.entered === g.round,
    happiness: () =>
      g.players.some(
        (p) =>
          count(inPlay(g, p.id), ["red"]) > 0 &&
          count(inPlay(g, p.id), ["white"]) > 0,
      ),
    love: () => colorCount(all) === 5,
    misery: () =>
      COLORS.some(
        (c) =>
          g.discard.filter((id) => definitions[card(g, id).def].color === c)
            .length >= 2,
      ),
    serenity: () => own.length % 2 === 0,
    tranquility: () => own.length % 2 === 1,
    superiority: () => own.length > countOthers,
    vulnerability: () => g.discardedRound === g.round,
  };
  if (binary[d.id])
    v = binary[d.id]() ? d.printed_values[1] : d.printed_values[0];
  switch (d.id) {
    case "envy":
      v = 2 * countOthers;
      break;
    case "euphoria":
      v = all.length;
      break;
    case "sadness":
      v = g.discard.length * 2;
      break;
    case "sloth":
      v = 3 + hand(g, m.owner).length;
      break;
    case "vanity":
      v = own.length * (hand(g, m.owner).length === 0 ? 3 : 1);
      break;
    case "wonder":
      v =
        2 *
        (count(all, m.chosenColor ? [m.chosenColor] : []) +
          g.discard.filter(
            (id) => definitions[card(g, id).def].color === m.chosenColor,
          ).length);
      break;
  }
  if (
    d.printed_values.length > 1 &&
    (own.some((c) => definition(c).id === "idealism") ||
      all.some(
        (c) => definition(c).id === "encouragement" && c.target === m.uid,
      ))
  )
    v = Math.max(...d.printed_values);
  return v;
}
export function baseScores(g: Game) {
  const scores: Record<string, number> = {};
  for (const p of g.players) {
    const own = inPlay(g, p.id);
    let n = own.reduce((sum, c) => sum + value(g, c), 0);
    for (const c of own) {
      const id = definition(c).id;
      if (id === "exhilaration")
        n += own.reduce((sum, c) => sum + value(g, c), 0);
      if (id === "bliss")
        n += own
          .filter((m) => color(g, m) === c.chosenColor)
          .reduce((sum, c) => sum + 2 * value(g, c), 0);
    }
    scores[p.id] = n;
  }
  return scores;
}
function draw(g: Game, p: string, n = 1) {
  for (let i = 0; i < n; i++) {
    const id = g.deck[0];
    if (!id) break;
    move(g, card(g, id), "hand", p);
  }
}
function removeFromLists(g: Game, id: string) {
  g.deck = g.deck.filter((x) => x !== id);
  g.discard = g.discard.filter((x) => x !== id);
}
function move(g: Game, m: Mood, zone: Mood["zone"], owner = m.owner) {
  const wasPlay = m.zone === "play",
    oldOwner = m.owner;
  removeFromLists(g, m.uid);
  m.zone = zone;
  m.owner = zone === "discard" || zone === "deck" ? "" : owner;
  if (zone === "deck") g.deck.push(m.uid);
  if (zone === "discard") {
    g.discard.push(m.uid);
    g.discardedRound = g.round;
  }
  if (wasPlay && (zone !== "play" || owner !== oldOwner)) {
    g.suppressions = g.suppressions.filter((s) => s.source !== m.uid);
    if (zone !== "play")
      g.grants = g.grants.filter((gr) => gr.sourceMood !== m.uid);
    if (zone !== "play") {
      g.suppressions = g.suppressions.filter((s) => s.target !== m.uid);
      const returns = g.transfers.filter((t) => t.source === m.uid);
      g.transfers = g.transfers.filter(
        (t) => t.source !== m.uid && t.target !== m.uid,
      );
      for (const t of returns) {
        const target = card(g, t.target);
        if (target.zone === "play" && target.owner === t.taker)
          move(g, target, "play", t.from);
      }
      delete m.copy;
      delete m.chosenValue;
      delete m.chosenColor;
      delete m.chosenPlayer;
      delete m.target;
      delete m.turnUsed;
      m.entered = 0;
      m.serial = 0;
    }
  }
  if (zone === "play" && !wasPlay) {
    m.life = (m.life ?? 0) + 1;
    m.entered = g.round;
    m.serial = ++g.serial;
  }
  if (zone === "play" && wasPlay && m.owner === active(g) && !g.scoring)
    turnAbility(g, m);
}
function batchMove(g: Game, ms: Mood[], zone: Mood["zone"], owner?: string) {
  const ids = ms.map((m) => ({ id: m.uid, owner: owner ?? m.owner }));
  for (const x of ids) move(g, card(g, x.id), zone, x.owner);
}
function grant(g: Game, label: string, opts: Partial<Grant> = {}) {
  g.grants.push({ id: `g${++g.serial}`, label, source: "hand", ...opts });
}
function beginTurn(g: Game) {
  g.turn++;
  g.grants = [];
  g.pride = undefined;
  grant(g, "Your turn");
  const p = active(g);
  for (const e of g.nextPlays.filter(
    (e) => e.player === p && e.afterTurn < g.turn,
  ))
    grant(g, e.label);
  g.nextPlays = g.nextPlays.filter(
    (e) => !(e.player === p && e.afterTurn < g.turn),
  );
  for (const c of inPlay(g, p)) turnAbility(g, c, true);
}
function turnAbility(g: Game, m: Mood, atStart = false) {
  const id = definition(m).id;
  if (m.turnUsed === g.turn) return;
  m.turnUsed = g.turn;
  if (id === "hope") grant(g, "Hope", { sourceMood: m.uid });
  if (id === "grace")
    grant(g, "Grace", { source: "discard", filter: "same", sourceMood: m.uid });
  if (
    id === "stubbornness" &&
    atStart &&
    g.players.some(
      (p) =>
        p.id !== m.owner && inPlay(g, p.id).length > inPlay(g, m.owner).length,
    )
  )
    grant(g, "Stubbornness");
}
function putFirst(g: Game, ...tasks: Task[]) {
  g.queue.unshift(...tasks);
}
function moodOptions(g: Game, ms: Mood[]): Option[] {
  return ms.map((m) => ({
    id: m.uid,
    label: `${definition(m).name} · ${playerName(g, m.owner)} · ${value(g, m)}`,
    card: m.uid,
    player: m.owner,
  }));
}
function playerOptions(g: Game, ids = g.players.map((p) => p.id)): Option[] {
  return ids.map((id) => ({ id, label: playerName(g, id), player: id }));
}
function ask(
  g: Game,
  t: Task,
  title: string,
  options: Option[],
  min = 0,
  max = 1,
  constraints?: Prompt["constraints"],
) {
  if (options.length < min) {
    putFirst(g, { ...t, data: { ...t.data, selected: [] } });
    return;
  }
  if (options.length === 0) {
    putFirst(g, { ...t, data: { ...t.data, selected: [] } });
    return;
  }
  g.prompt = {
    id: `q${++g.serial}`,
    actor: t.actor,
    title,
    options,
    min,
    max: Math.min(max, options.length),
    constraints,
    task: t,
  };
}
const selected = (t: Task): string[] => t.data?.selected ?? [];
const yesOptions = [{ id: "yes", label: "Yes, use this effect" }];
function effectTask(
  actor: string,
  c: string,
  stage = 0,
  data: Record<string, any> = {},
): Task {
  return { kind: "effect", actor, card: c, stage, data };
}
function suppress(g: Game, targets: Mood[], source: Mood, temporary = false) {
  for (const m of targets)
    g.suppressions.push(
      temporary
        ? { target: m.uid, round: g.round }
        : { target: m.uid, source: source.uid, controller: source.owner },
    );
}
function winner(g: Game, scores = g.scores) {
  return [...g.order].sort(
    (a, b) => scores[b] - scores[a] || g.order.indexOf(a) - g.order.indexOf(b),
  )[0];
}
const costKind: Record<
  string,
  { zone: "hand" | "play"; min: number; max: number; dest: "discard" | "hand" }
> = {
  regret: { zone: "play", min: 2, max: 2, dest: "hand" },
  bliss: { zone: "hand", min: 1, max: 1, dest: "discard" },
  guile: { zone: "hand", min: 2, max: 2, dest: "discard" },
  envy: { zone: "play", min: 1, max: 1, dest: "discard" },
  exhilaration: { zone: "play", min: 1, max: 1, dest: "discard" },
  "self-loathing": { zone: "play", min: 1, max: 999, dest: "discard" },
  neurosis: { zone: "play", min: 1, max: 999, dest: "hand" },
};
function costAvailable(g: Game, p: string, m: Mood, defId = definition(m).id) {
  const cost = costKind[defId];
  return (
    !cost ||
    (cost.zone === "hand"
      ? hand(g, p).filter((c) => c.uid !== m.uid)
      : inPlay(g, p)
    ).length >= cost.min
  );
}
function grantAllows(g: Game, p: string, m: Mood, gr: Grant) {
  if (gr.sourceMood && !inPlay(g, p).some((c) => c.uid === gr.sourceMood))
    return false;
  if (
    gr.label === "Pride" &&
    (!g.pride || inPlay(g, p).length >= inPlay(g, g.pride).length)
  )
    return false;
  if (m.zone === "hand" && m.owner !== p) return false;
  const fromDiscard = m.zone === "discard";
  if (m.zone !== "hand" && !fromDiscard) return false;
  if (gr.source === "discard" && !fromDiscard) return false;
  if (
    gr.source === "hand" &&
    fromDiscard &&
    !inPlay(g, p).some((c) => definition(c).id === "melancholy")
  )
    return false;
  const d = definitions[m.def],
    own = inPlay(g, p);
  if (gr.filter === "same" && !own.some((c) => color(g, c) === d.color))
    return false;
  if (gr.filter === "different" && own.some((c) => color(g, c) === d.color))
    return false;
  if (gr.filter === "even" && ![0, 2, 4, 6].includes(d.printed_values[0]))
    return false;
  if (gr.filter === "odd" && ![1, 3, 5].includes(d.printed_values[0]))
    return false;
  if (gr.filter === "specific" && gr.specific !== m.uid) return false;
  return true;
}
export function canPlay(g: Game, p: string, m: Mood, gr: Grant) {
  return (
    g.status === "playing" &&
    !g.scoring &&
    !g.prompt &&
    active(g) === p &&
    grantAllows(g, p, m, gr) &&
    !g.bans.some(
      (b) => b.round === g.round && b.color === definitions[m.def].color,
    ) &&
    costAvailable(g, p, m)
  );
}
export function act(original: Game, actor: string, action: Action): Game {
  const g = structuredClone(original);
  insist(g.status === "playing", "The game is not in progress.");
  if (action.type === "choose") {
    const q = g.prompt;
    insist(q && q.actor === actor, "Wait for your choice.");
    insist(q.id === action.prompt, "This choice has already changed.");
    const ids = action.selected;
    insist(
      Array.isArray(ids) && ids.every((id) => typeof id === "string"),
      "Invalid selection.",
    );
    insist(new Set(ids).size === ids.length, "Choose each option once.");
    insist(
      ids.length >= q.min && ids.length <= q.max,
      "Choose the requested number of options.",
    );
    insist(
      ids.every((id) => q.options.some((o) => o.id === id)),
      "That option is not available.",
    );
    const cs = ids
      .map((id) => g.cards.find((c) => c.uid === id))
      .filter((x): x is Mood => !!x);
    if (q.constraints?.allowedCounts)
      insist(
        q.constraints.allowedCounts.includes(ids.length),
        "Choose the full requested group or skip.",
      );
    if (q.constraints?.maxValue !== undefined)
      insist(
        cs.reduce((s, c) => s + value(g, c), 0) <= q.constraints.maxValue,
        "The total value is too high.",
      );
    if (q.constraints?.differentPlayers)
      insist(
        new Set(cs.map((c) => c.owner)).size === cs.length,
        "Choose at most one mood per player.",
      );
    if (q.constraints?.samePlayer)
      insist(
        new Set(cs.map((c) => c.owner)).size <= 1,
        "Choose moods from one player.",
      );
    if (q.constraints?.matchingPair && cs.length === 2)
      insist(
        color(g, cs[0]) === color(g, cs[1]) ||
          value(g, cs[0]) === value(g, cs[1]),
        "The moods must share a color or value.",
      );
    delete g.prompt;
    putFirst(g, { ...q.task, data: { ...q.task.data, selected: ids } });
  } else {
    insist(!g.prompt && !g.scoring, "Resolve the current choice first.");
    insist(active(g) === actor, "It is not your turn.");
    if (action.type === "play") {
      const m = card(g, action.card),
        gr = g.grants.find((gr) => gr.id === action.grant);
      insist(
        gr && canPlay(g, actor, m, gr),
        "That card cannot be played using this extra play.",
      );
      putFirst(g, {
        kind: "play",
        actor,
        card: m.uid,
        stage: 0,
        data: { grant: gr.id },
      });
    } else if (action.type === "pass") {
      g.grants = [];
      g.pride = undefined;
      g.turnIndex++;
      if (g.turnIndex >= g.order.length) {
        g.scoring = true;
        putFirst(g, { kind: "score", actor: g.order[0] });
      } else beginTurn(g);
    } else throw new RuleError("Unknown action.");
  }
  drain(g);
  g.revision++;
  return g;
}
function drain(g: Game) {
  let n = 0;
  while (g.queue.length && !g.prompt) {
    insist(++n < 1000, "Effect processing limit reached.");
    const t = g.queue.shift()!;
    switch (t.kind) {
      case "play":
        playTask(g, t);
        break;
      case "effect":
        resolveEffect(g, t);
        break;
      case "score":
        scoreTask(g, t);
        break;
      case "score-choice":
        scoreChoice(g, t);
        break;
      case "after":
        afterTask(g, t);
        break;
      case "after-effect":
        afterEffect(g, t);
        break;
      case "finish-round":
        finishRound(g);
        break;
      case "duplicate":
        duplicateTask(g, t);
        break;
      case "scorn":
        scornTask(g, t);
        break;
      default:
        throw new Error(`Unknown task: ${t.kind}`);
    }
  }
  if (
    g.status === "playing" &&
    !g.scoring &&
    !g.prompt &&
    g.pride &&
    inPlay(g, active(g)).length < inPlay(g, g.pride).length &&
    !g.grants.some((gr) => gr.label === "Pride")
  )
    grant(g, "Pride");
}
function playTask(g: Game, t: Task) {
  const m = card(g, t.card!),
    s = t.stage ?? 0,
    d = t.data ?? {};
  if (s === 0 && m.def === "creativity") {
    ask(
      g,
      { ...t, stage: 1 },
      "Creativity · Copy a mood, or skip to play it as itself",
      moodOptions(
        g,
        inPlay(g).filter((c) => costAvailable(g, t.actor, m, definition(c).id)),
      ),
      0,
      1,
    );
    return;
  }
  if (s <= 1) {
    if (s === 1 && selected(t).length)
      m.copy = definition(card(g, selected(t)[0])).id;
    const cost = costKind[definition(m).id];
    if (cost) {
      const choices =
        cost.zone === "hand"
          ? hand(g, t.actor).filter((c) => c.uid !== m.uid)
          : inPlay(g, t.actor);
      insist(choices.length >= cost.min, "You cannot pay this card’s cost.");
      // The permission is spent now: paying the cost may discard the very mood
      // that granted this extra play, and the play must still complete.
      const using = g.grants.find((gr) => gr.id === d.grant);
      insist(using, "That extra play is no longer available.");
      g.grants = g.grants.filter((x) => x.id !== using.id);
      ask(
        g,
        { ...t, stage: 2, data: { ...d, usedGrant: using } },
        `${definition(m).name} · Choose ${cost.zone === "hand" ? "cards from your hand" : "your moods"} to ${cost.dest === "hand" ? "return to hand" : "discard"}`,
        moodOptions(g, choices),
        cost.min,
        cost.max,
      );
      return;
    }
  }
  if (s === 2) {
    const cost = costKind[definition(m).id];
    const chosen = selected(t).map((id) => card(g, id));
    if (definition(m).id === "bliss")
      m.chosenColor = definitions[chosen[0].def].color;
    batchMove(g, chosen, cost.dest, t.actor);
  }
  const gr: Grant | undefined =
    d.usedGrant ?? g.grants.find((gr) => gr.id === d.grant);
  insist(gr, "That extra play is no longer available.");
  g.grants = g.grants.filter((x) => x.id !== gr.id);
  move(g, m, "play", t.actor);
  log(g, `${playerName(g, t.actor)} played ${definition(m).name}.`);
  g.lastPlayed = {
    id: ++g.serial,
    actor: t.actor,
    def: definition(m).id,
    originalDef: m.def,
  };
  if (gr.cleanup)
    g.delayed.push({
      id: `d${++g.serial}`,
      kind: gr.cleanup,
      actor: t.actor,
      card: m.uid,
      life: m.life ?? 0,
      round: g.round,
    });
  turnAbility(g, m);
  const triggers: Task[] = [];
  for (const c of inPlay(g, t.actor).filter((c) => c.uid !== m.uid)) {
    if (
      definition(c).id === "validation" &&
      [0, 1].includes(definition(m).printed_values[0])
    )
      grant(g, "Validation");
    if (definition(c).id === "scorn")
      triggers.push({
        kind: "scorn",
        actor: t.actor,
        card: c.uid,
        data: { played: m.uid },
      });
  }
  // Resolve the entry effect, then optional repetitions; each repetition makes fresh choices.
  triggers.push(effectTask(t.actor, m.uid, 0, { effectId: definition(m).id }));
  for (const c of inPlay(g, t.actor).filter(
    (c) => c.uid !== m.uid && definition(c).id === "duplicity",
  ))
    triggers.push({
      kind: "duplicate",
      actor: t.actor,
      card: m.uid,
      data: { source: c.uid, effectId: definition(m).id },
    });
  putFirst(g, ...triggers);
}
function duplicateTask(g: Game, t: Task) {
  if (
    !definitions[t.data!.effectId].ability_types.includes(
      "After playing this mood",
    )
  )
    return;
  if (t.stage === 1) {
    if (selected(t).length)
      putFirst(
        g,
        effectTask(t.actor, t.card!, 0, { effectId: t.data!.effectId }),
      );
    return;
  }
  ask(
    g,
    { ...t, stage: 1 },
    `Duplicity · Repeat ${definition(card(g, t.card!)).name}’s entry effect?`,
    yesOptions,
  );
}
function scornTask(g: Game, t: Task) {
  const source = card(g, t.card!);
  if (source.zone !== "play") return;
  if (t.stage === 1) {
    suppress(
      g,
      selected(t).map((id) => card(g, id)),
      source,
      true,
    );
    return;
  }
  const played = card(g, t.data!.played);
  ask(
    g,
    { ...t, stage: 1 },
    "Scorn · You may suppress a mood of the played color",
    moodOptions(
      g,
      inPlay(g).filter((m) => color(g, m) === color(g, played)),
    ),
  );
}
function resolveEffect(g: Game, t: Task) {
  const m = card(g, t.card!),
    d = t.data ?? {},
    id = d.effectId ?? definition(m).id,
    s = t.stage ?? 0,
    p = d.originalActor ?? t.actor,
    sel = selected(t);
  const all = () => inPlay(g),
    own = () => inPlay(g, p),
    other = () => all().filter((c) => c.uid !== m.uid),
    opp = () => all().filter((c) => c.owner !== p);
  const next = (
    stage: number,
    extra: Record<string, any> = {},
    actor = p,
  ): Task => ({
    ...t,
    actor,
    stage,
    data: {
      ...d,
      ...extra,
      effectId: id,
      originalActor: p,
      selected: undefined,
    },
  });
  const choose = (
    title: string,
    ms: Mood[],
    min = 0,
    max = 1,
    stage = 1,
    constraints?: Prompt["constraints"],
  ) =>
    ask(
      g,
      next(stage),
      `${definitions[id].name} · ${title}`,
      moodOptions(g, ms),
      min,
      max,
      constraints,
    );
  const choosePlayer = (
    title: string,
    ids: string[],
    min = 0,
    max = 1,
    stage = 1,
  ) =>
    ask(
      g,
      next(stage),
      `${definitions[id].name} · ${title}`,
      playerOptions(g, ids),
      min,
      max,
    );
  const chosen = () => sel.map((uid) => card(g, uid));
  const opponents = g.players.filter((x) => x.id !== p).map((x) => x.id);
  const extraPlays: Record<string, Partial<Grant>> = {
    charity: {},
    benevolence: { filter: "different" },
    eagerness: { filter: "same" },
    friendliness: { filter: "even" },
    kindness: { filter: "odd" },
    harmony: { source: "discard" },
    grief: { source: "discard" },
    gluttony: { cleanup: "discard" },
    insecurity: { cleanup: "hand" },
    duplicity: {},
    idealism: {},
    validation: {},
  };
  if (id in extraPlays) {
    grant(g, definitions[id].name, extraPlays[id]);
    if (id === "grief") grant(g, "Grief", { source: "discard" });
    return;
  }
  const discBoost: Record<string, number[]> = {
    cheer: [0, 2, 4, 6],
    delight: [1, 3, 5],
    dignity: [0, 1, 2, 3],
    embarrassment: [4, 5, 6],
  };
  if (id in discBoost) {
    if (s === 0) {
      choose(
        "You may discard a qualifying card for value 5",
        hand(g, p).filter((c) =>
          discBoost[id].includes(definitions[c.def].printed_values[0]),
        ),
      );
      return;
    }
    if (sel.length) {
      batchMove(g, chosen(), "discard");
      if (m.zone === "play") m.chosenValue = 5;
    }
    return;
  }
  const simpleRemoval: Record<
    string,
    { dest: "hand" | "discard" | "suppress"; valid: (c: Mood) => boolean }
  > = {
    anxiety: { dest: "hand", valid: (c) => value(g, c) % 2 === 1 },
    courage: { dest: "discard", valid: (c) => value(g, c) >= 5 },
    shock: { dest: "discard", valid: (c) => value(g, c) <= 3 },
    spite: { dest: "discard", valid: (c) => value(g, c) % 2 === 0 },
    panic: { dest: "hand", valid: (c) => c.uid !== m.uid },
    pacifism: { dest: "suppress", valid: () => true },
  };
  if (id in simpleRemoval) {
    const rule = simpleRemoval[id];
    if (s === 0) {
      choose(
        "Choose up to two moods, from different players",
        all().filter(rule.valid),
        0,
        2,
        1,
        { differentPlayers: true },
      );
      return;
    }
    if (rule.dest === "suppress") suppress(g, chosen(), m);
    else batchMove(g, chosen(), rule.dest);
    return;
  }
  if (["contempt", "hesitation", "guilt"].includes(id)) {
    const colors: Color[] =
      id === "contempt"
        ? ["green", "white"]
        : id === "hesitation"
          ? ["red", "green"]
          : ["black", "red"];
    if (s === 0) {
      ask(g, next(1), `${definitions[id].name} · Choose an effect, or skip`, [
        { id: "one", label: "Choose one matching mood" },
        { id: "all", label: "Affect all matching moods" },
      ]);
      return;
    }
    const targets = () => all().filter((c) => colors.includes(color(g, c)));
    if (s === 1) {
      if (!sel.length) return;
      if (sel[0] === "one") {
        choose("Choose one matching mood", targets(), 1, 1, 2);
        return;
      }
      sel.splice(0, sel.length, ...targets().map((c) => c.uid));
    }
    if (id === "guilt") suppress(g, chosen(), m);
    else batchMove(g, chosen(), id === "contempt" ? "discard" : "hand");
    return;
  }
  switch (id) {
    case "ambition":
    case "bravado":
    case "angst":
    case "hostility":
    case "worry":
    case "fear":
    case "thrill":
    case "infatuation": {
      if (s === 0) {
        let choices = id === "ambition" ? hand(g, p) : own();
        if (["bravado", "fear", "thrill", "infatuation"].includes(id))
          choices = choices.filter((c) => c.uid !== m.uid);
        if (id === "angst")
          choices = choices.filter((c) =>
            ["blue", "red"].includes(color(g, c)),
          );
        if (id === "hostility")
          choices = choices.filter((c) =>
            ["black", "green"].includes(color(g, c)),
          );
        if (id === "worry")
          choices = choices.filter((c) =>
            ["white", "black"].includes(color(g, c)),
          );
        choose(
          id === "infatuation"
            ? "You may discard two of your other moods"
            : "Choose cards for this optional effect",
          choices,
          0,
          id === "infatuation" ? 2 : id === "thrill" ? 999 : 1,
          1,
          id === "infatuation" ? { allowedCounts: [0, 2] } : undefined,
        );
        return;
      }
      if (s === 1) {
        if (id === "infatuation" && sel.length !== 0)
          insist(sel.length === 2, "Choose exactly two moods or skip.");
        if (sel.length)
          batchMove(
            g,
            chosen(),
            ["worry", "fear", "thrill"].includes(id) ? "hand" : "discard",
            p,
          );
        if (id === "fear") {
          grant(g, "Fear");
          return;
        }
        if (!sel.length) return;
        if (id === "hostility" || id === "worry") {
          choose(
            "Choose up to two moods with value 3 or less",
            all().filter(
              (c) =>
                value(g, c) <= 3 && (id === "hostility" || c.uid !== m.uid),
            ),
            0,
            2,
            2,
          );
          return;
        }
        if (id === "infatuation") {
          if (m.zone === "play") m.chosenValue = 9;
          return;
        }
        for (let i = 0; i < (id === "thrill" ? sel.length : 1); i++)
          grant(
            g,
            definitions[id].name,
            id === "angst" ? { source: "discard" } : {},
          );
        return;
      }
      batchMove(g, chosen(), id === "worry" ? "hand" : "discard");
      return;
    }
    case "altruism": {
      if (!g.discard.length) return;
      if (m.zone === "play") m.chosenValue = 7;
      const pile = shuffle(g, g.discard),
        i = g.order.indexOf(p),
        order = [...g.order.slice(i + 1), ...g.order.slice(0, i + 1)];
      for (const target of order) {
        const uid = pile.shift();
        if (uid) move(g, card(g, uid), "hand", target);
      }
      batchMove(
        g,
        shuffle(g, pile).map((uid) => card(g, uid)),
        "deck",
      );
      return;
    }
    case "anger":
      if (s === 0) {
        choose(
          "Choose moods with a combined value of at most 5",
          all(),
          0,
          999,
          1,
          { maxValue: 5 },
        );
        return;
      }
      batchMove(g, chosen(), "discard");
      return;
    case "arrogance": {
      if (s === 0) {
        choosePlayer("You may choose an opponent", opponents);
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        const target = sel[0];
        ask(
          g,
          next(2, { victim: target }, target),
          "Arrogance · Choose a white or blue mood to give away",
          moodOptions(
            g,
            inPlay(g, target).filter((c) =>
              ["white", "blue"].includes(color(g, c)),
            ),
          ),
          1,
        );
        return;
      }
      if (sel.length) {
        const target = card(g, sel[0]);
        g.transfers.push({
          source: m.uid,
          target: target.uid,
          from: target.owner,
          taker: p,
        });
        move(g, target, "play", p);
      }
      return;
    }
    case "avoidance":
    case "confusion": {
      if (s === 0) {
        ask(
          g,
          next(1),
          `${definitions[id].name} · Choose a direction`,
          [
            { id: "left", label: "Left (clockwise)" },
            { id: "right", label: "Right (counterclockwise)" },
          ],
          1,
        );
        return;
      }
      if (s === 1) {
        putFirst(g, next(2, { direction: sel[0], index: 0, picks: [] }));
        return;
      }
      if (s === 2 || s === 3) {
        let index = d.index as number,
          picks = d.picks as { player: string; card: string }[];
        if (s === 3) {
          if (sel.length)
            picks = [...picks, { player: g.order[index], card: sel[0] }];
          index++;
        }
        if (index < g.order.length) {
          const who = g.order[index],
            choices = id === "confusion" ? hand(g, who) : inPlay(g, who);
          ask(
            g,
            next(3, { index, picks }, who),
            `${definitions[id].name} · Choose a ${id === "confusion" ? "card" : "mood"} to pass`,
            moodOptions(g, choices),
            1,
          );
          return;
        }
        const moves = picks.map((x) => ({
          m: card(g, x.card),
          to: g.order[
            (g.order.indexOf(x.player) +
              (d.direction === "left" ? 1 : g.order.length - 1)) %
              g.order.length
          ],
        }));
        for (const x of moves)
          move(g, x.m, id === "confusion" ? "hand" : "play", x.to);
        return;
      }
      return;
    }
    case "awe":
      if (s === 0) {
        choosePlayer(
          "Who starts the next round?",
          g.players.map((x) => x.id),
          1,
        );
        return;
      }
      g.noScoring = true;
      g.nextFirst = sel[0];
      log(g, "Awe: no scoring this round.");
      return;
    case "bashfulness":
      g.delayed.push({
        id: `d${++g.serial}`,
        kind: "bashfulness",
        actor: p,
        card: m.uid,
        life: m.life ?? 0,
        round: g.round,
      });
      return;
    case "betrayal":
      if (s === 0) {
        choose("Choose one of your moods to lend", own(), 1);
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        ask(
          g,
          next(2, { target: sel[0] }),
          "Betrayal · Choose who receives it",
          playerOptions(g, opponents),
          1,
        );
        return;
      }
      if (sel.length) {
        const target = card(g, d.target);
        move(g, target, "play", sel[0]);
        g.delayed.push({
          id: `d${++g.serial}`,
          kind: "return",
          sourceDef: id,
          actor: p,
          card: m.uid,
          target: target.uid,
          targetLife: target.life ?? 0,
          player: sel[0],
          round: g.round,
        });
      }
      return;
    case "bitterness":
    case "fickleness": {
      const counts = COLORS.map((c) => ({
        c,
        n: all().filter((m) => color(g, m) === c).length,
      }));
      const max = Math.max(...counts.map((x) => x.n));
      const cols = counts.filter((x) => x.n === max).map((x) => x.c);
      batchMove(
        g,
        other().filter((c) => cols.includes(color(g, c))),
        id === "bitterness" ? "discard" : "hand",
      );
      return;
    }
    case "chaos": {
      const pile = shuffle(g, all()),
        i = g.order.indexOf(p);
      const transfers = pile.map((m, n) => ({
        m,
        to: g.order[(i + n) % g.order.length],
      }));
      for (const x of transfers) move(g, x.m, "play", x.to);
      return;
    }
    case "compulsion":
    case "intimidation": {
      if (s === 0) {
        choosePlayer(
          "Choose another player",
          opponents,
          id === "compulsion" ? 1 : 0,
        );
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        ask(
          g,
          next(2, { victim: sel[0] }, sel[0]),
          `${definitions[id].name} · Choose a card to give`,
          moodOptions(g, hand(g, sel[0])),
          1,
        );
        return;
      }
      if (sel.length) {
        const c = card(g, sel[0]);
        if (id === "intimidation")
          log(
            g,
            `${playerName(g, t.actor)} revealed ${definitions[c.def].name}.`,
          );
        move(g, c, "hand", p);
        if (id === "intimidation")
          grant(g, "Intimidation", { filter: "specific", specific: c.uid });
      }
      return;
    }
    case "condescension":
    case "fascination": {
      if (s === 0) {
        choose(
          "You may give a card from your hand",
          hand(g, p).filter(
            (c) =>
              id !== "fascination" ||
              ["blue", "black"].includes(definitions[c.def].color),
          ),
        );
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        ask(
          g,
          next(2, { target: sel[0] }),
          "Choose who receives your card",
          playerOptions(g, opponents),
          1,
        );
        return;
      }
      if (sel.length) {
        const c = card(g, d.target);
        if (id === "fascination")
          log(g, `${playerName(g, p)} revealed ${definitions[c.def].name}.`);
        move(g, c, "hand", sel[0]);
        if (m.zone === "play") m.chosenValue = id === "fascination" ? 7 : 6;
      }
      return;
    }
    case "conviction":
    case "hate":
      if (s === 0) {
        choose(
          "Choose a mood to put beneath the deck",
          all(),
          id === "conviction" ? 1 : 0,
        );
        return;
      }
      if (sel.length) {
        const c = card(g, sel[0]),
          who = id === "conviction" ? c.owner : p;
        move(g, c, "deck");
        draw(g, who);
      }
      return;
    case "corruption":
      if (s === 0) {
        ask(g, next(1), "Corruption · Choose an effect, or skip", [
          { id: "draw", label: "Recycle up to two discarded cards and draw" },
          { id: "wins", label: "This round awards two wins" },
        ]);
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        if (sel[0] === "wins") {
          g.roundAward = 2;
          return;
        }
        choose(
          "Choose up to two discarded cards",
          g.discard.map((x) => card(g, x)),
          0,
          2,
          2,
        );
        return;
      }
      batchMove(g, chosen(), "deck");
      draw(g, p, sel.length);
      return;
    case "cruelty":
    case "indecisiveness":
      if (s === 0) {
        choosePlayer(
          "Choose opponents to affect",
          opponents.filter((x) => inPlay(g, x).length >= 2),
          0,
          999,
        );
        return;
      }
      for (const who of sel) {
        const ms = inPlay(g, who);
        if (ms.length >= 2)
          move(
            g,
            ms[Math.floor(random(g) * ms.length)],
            id === "cruelty" ? "discard" : "hand",
          );
      }
      return;
    case "curiosity":
      if (s === 0) {
        choosePlayer(
          "You may choose a player",
          g.players.map((x) => x.id),
        );
        return;
      }
      if (sel.length) {
        const h = hand(g, sel[0]);
        if (h.length) {
          const c = h[Math.floor(random(g) * h.length)];
          log(
            g,
            `${playerName(g, sel[0])} revealed ${definitions[c.def].name}.`,
          );
          if (
            m.zone === "play" &&
            all().some((x) => color(g, x) === definitions[c.def].color)
          )
            m.chosenValue = 6;
        }
      }
      return;
    case "cynicism":
      if (s === 0) {
        choose(
          "You may give a discarded card to an opponent",
          g.discard.map((x) => card(g, x)),
        );
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        ask(
          g,
          next(2, { target: sel[0] }),
          "Cynicism · Choose an opponent",
          playerOptions(g, opponents),
          1,
        );
        return;
      }
      if (sel.length) {
        move(g, card(g, d.target), "hand", sel[0]);
        if (m.zone === "play") m.chosenValue = 6;
      }
      return;
    case "denial":
    case "rejection":
      if (s === 0) {
        choose(
          "Choose two moods sharing a color or value, or skip",
          other(),
          0,
          2,
          1,
          { matchingPair: true, allowedCounts: [0, 2] },
        );
        return;
      }
      insist(
        sel.length === 0 || sel.length === 2,
        "Choose exactly two moods or skip.",
      );
      batchMove(g, chosen(), id === "denial" ? "hand" : "discard");
      return;
    case "disillusionment": {
      if (s === 0) {
        const i = g.order.indexOf(p);
        putFirst(
          g,
          next(1, {
            index: 0,
            colors: [],
            players: [...g.order.slice(i + 1), ...g.order.slice(0, i + 1)],
          }),
        );
        return;
      }
      let index = d.index as number,
        colors = d.colors as Color[];
      if (s === 2) {
        colors = [...colors, ...(sel as Color[])];
        index++;
      }
      if (index < d.players.length) {
        ask(
          g,
          next(2, { index, colors }, d.players[index]),
          "Disillusionment · You may choose a color",
          COLORS.map((c) => ({ id: c, label: c })),
        );
        return;
      }
      batchMove(
        g,
        other().filter((c) => colors.includes(color(g, c))),
        "discard",
      );
      return;
    }
    case "disorientation":
    case "repentance":
    case "rebellion": {
      if (s === 0) {
        const numbers =
          id === "rebellion"
            ? [0, 1, 2, 3]
            : [...new Set(other().map((c) => value(g, c)))].sort(
                (a, b) => a - b,
              );
        ask(
          g,
          next(1),
          `${definitions[id].name} · Choose a value${id === "rebellion" ? "" : " or skip"}`,
          numbers.map((n) => ({ id: String(n), label: `Value ${n}` })),
          id === "rebellion" ? 1 : 0,
        );
        return;
      }
      if (sel.length) {
        const targets = other().filter((c) => value(g, c) === Number(sel[0]));
        if (id === "repentance") suppress(g, targets, m, true);
        else
          batchMove(g, targets, id === "disorientation" ? "hand" : "discard");
      }
      return;
    }
    case "doubt":
      if (s === 0) {
        choose("Choose cards to reveal and exchange", hand(g, p), 0, 999);
        return;
      }
      for (const c of chosen()) {
        g.bans.push({ round: g.round + 1, color: definitions[c.def].color });
        log(
          g,
          `Doubt revealed ${definitions[c.def].name}; ${definitions[c.def].color} cards are blocked next round.`,
        );
      }
      batchMove(g, chosen(), "deck");
      draw(g, p, sel.length);
      return;
    case "encouragement":
      if (s === 0) {
        choose(
          "You may choose a mood with two printed values",
          all().filter((c) => definition(c).printed_values.length > 1),
        );
        return;
      }
      if (sel.length && m.zone === "play") m.target = sel[0];
      return;
    case "faith":
    case "shame": {
      if (s === 0) {
        choose(
          "You may discard a card to suppress moods",
          hand(g, p).filter(
            (c) =>
              id === "shame" ||
              ["green", "blue"].includes(definitions[c.def].color),
          ),
        );
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        const c = card(g, sel[0]),
          col = definitions[c.def].color;
        move(g, c, "discard");
        if (id === "shame") {
          suppress(
            g,
            other().filter((c) => color(g, c) === col),
            m,
          );
          return;
        }
        choose("Choose a mood to suppress", all(), 1, 1, 2);
        return;
      }
      suppress(g, chosen(), m);
      return;
    }
    case "fury": {
      let index = d.index ?? 0,
        picks: string[] = d.picks ?? [];
      if (s === 1) {
        picks = [...picks, ...sel];
        index++;
      }
      if (index < g.order.length) {
        const who = g.order[index],
          ms = inPlay(g, who),
          max = Math.max(...ms.map((c) => value(g, c)));
        ask(
          g,
          next(1, { index, picks }, who),
          "Fury · Choose one of your highest-value moods",
          moodOptions(
            g,
            ms.filter((c) => value(g, c) === max),
          ),
          1,
        );
        return;
      }
      batchMove(
        g,
        picks.map((uid) => card(g, uid)),
        "discard",
      );
      return;
    }
    case "generosity":
    case "joy":
      if (id === "joy") {
        g.nextPlays.push({ player: p, afterTurn: g.turn, label: "Joy" });
        return;
      }
      if (s === 0) {
        choosePlayer(
          "Choose an opponent for an extra play next turn",
          opponents,
          1,
        );
        return;
      }
      if (sel.length)
        g.nextPlays.push({
          player: sel[0],
          afterTurn: g.turn,
          label: "Generosity",
        });
      return;
    case "guile":
    case "regret":
      if (s === 0) {
        choose("Choose an opponent’s mood", opp(), 1);
        return;
      }
      if (sel.length)
        move(g, card(g, sel[0]), id === "regret" ? "hand" : "play", p);
      return;
    case "honor":
      if (s === 0) {
        choosePlayer(
          "Who will start each round?",
          g.players.map((x) => x.id),
          1,
        );
        return;
      }
      if (m.zone === "play") m.chosenPlayer = sel[0];
      return;
    case "imagination":
    case "wonder":
      if (s === 0) {
        ask(
          g,
          next(1),
          `${definitions[id].name} · Choose a color`,
          COLORS.map((c) => ({ id: c, label: c })),
          1,
        );
        return;
      }
      if (m.zone === "play") {
        m.chosenColor = sel[0] as Color;
        m.serial = ++g.serial;
      }
      return;
    case "instability": {
      if (s === 0) {
        choose("Choose two moods from one opponent, or skip", opp(), 0, 2, 1, {
          samePlayer: true,
          allowedCounts: [0, 2],
        });
        return;
      }
      if (s === 1) {
        insist(
          sel.length === 0 || sel.length === 2,
          "Choose exactly two moods or skip.",
        );
        if (!sel.length) return;
        const victim = card(g, sel[0]).owner;
        ask(
          g,
          next(2, { victim }, victim),
          "Instability · Choose which mood to give",
          moodOptions(g, chosen()),
          1,
        );
        return;
      }
      if (s === 2) {
        if (!sel.length) return;
        move(g, card(g, sel[0]), "play", p);
        choose("Choose a mood to give back", own(), 1, 1, 3);
        return;
      }
      if (sel.length) move(g, card(g, sel[0]), "play", d.victim);
      return;
    }
    case "malice": {
      if (s === 0) {
        choosePlayer(
          "Choose a player with at least two moods",
          g.players.filter((x) => inPlay(g, x.id).length >= 2).map((x) => x.id),
          1,
        );
        return;
      }
      if (s === 1) {
        if (!sel.length) return;
        ask(
          g,
          next(2, {}, sel[0]),
          "Malice · Choose two of your moods",
          moodOptions(g, inPlay(g, sel[0])),
          2,
          2,
        );
        return;
      }
      const colors = chosen().map((c) => color(g, c));
      batchMove(
        g,
        all().filter((c) => colors.includes(color(g, c))),
        "discard",
      );
      return;
    }
    case "meekness":
      suppress(
        g,
        all().filter((c) => value(g, c) >= 5),
        m,
      );
      return;
    case "nostalgia":
      if (s === 0) {
        choose(
          "You may take a card from the discard pile",
          g.discard.map((x) => card(g, x)),
        );
        return;
      }
      if (sel.length) move(g, card(g, sel[0]), "hand", p);
      grant(g, "Nostalgia");
      return;
    case "paranoia":
      if (s === 0) {
        choosePlayer(
          "Choose a player to reveal a random card",
          g.players.filter((x) => hand(g, x.id).length).map((x) => x.id),
        );
        return;
      }
      if (sel.length) {
        const h = hand(g, sel[0]),
          c = h[Math.floor(random(g) * h.length)];
        if (c) {
          log(
            g,
            `${playerName(g, sel[0])} revealed ${definitions[c.def].name}.`,
          );
          move(g, c, "deck");
          draw(g, p);
        }
      }
      return;
    case "pride":
      if (s === 0) {
        choosePlayer(
          "You may choose a player with more moods",
          g.players
            .filter((x) => inPlay(g, x.id).length > own().length)
            .map((x) => x.id),
        );
        return;
      }
      if (sel.length) g.pride = sel[0];
      return;
    case "rage":
    case "wrath":
      if (s === 0) {
        ask(
          g,
          next(1),
          `${definitions[id].name} · Remove ${id === "wrath" ? "all other moods" : "all other moods with value 3 or less"}?`,
          yesOptions,
        );
        return;
      }
      if (sel.length)
        batchMove(
          g,
          other().filter((c) => id === "wrath" || value(g, c) <= 3),
          "discard",
        );
      return;
    case "rationalization": {
      if (s === 0) {
        ask(g, next(1), "Rationalization · Choose an effect, or skip", [
          { id: "draw", label: "Exchange your hand for new cards" },
          { id: "left", label: "Pass every hand clockwise" },
          { id: "right", label: "Pass every hand counterclockwise" },
        ]);
        return;
      }
      if (!sel.length) return;
      if (sel[0] === "draw") {
        const ms = hand(g, p);
        batchMove(g, ms, "deck");
        draw(g, p, ms.length);
      } else {
        const moves = g.order.flatMap((who, i) =>
          hand(g, who).map((c) => ({
            c,
            to: g.order[
              (i + (sel[0] === "left" ? 1 : g.order.length - 1)) %
                g.order.length
            ],
          })),
        );
        for (const x of moves) move(g, x.c, "hand", x.to);
      }
      return;
    }
    case "recklessness":
      if (s === 0) {
        choose("You may borrow an opponent’s mood for this round", opp());
        return;
      }
      if (sel.length) {
        const target = card(g, sel[0]),
          from = target.owner;
        move(g, target, "play", p);
        g.delayed.push({
          id: `d${++g.serial}`,
          kind: "return",
          sourceDef: id,
          actor: p,
          card: m.uid,
          target: target.uid,
          targetLife: target.life ?? 0,
          player: from,
          round: g.round,
        });
      }
      return;
    case "scorn":
      if (s === 0) {
        choose("Choose any mood to suppress this round", all(), 1);
        return;
      }
      suppress(g, chosen(), m, true);
      return;
    case "sneakiness":
      if (s === 0) {
        choosePlayer(
          "Choose an opponent to swap scores with after scoring",
          opponents,
          1,
        );
        return;
      }
      if (sel.length)
        g.delayed.push({
          id: `d${++g.serial}`,
          kind: "swap",
          actor: p,
          card: m.uid,
          player: sel[0],
          round: g.round,
        });
      return;
    case "suspicion": {
      if (s === 0) {
        choosePlayer(
          "Choose players who must discard",
          g.players.map((x) => x.id),
          0,
          999,
        );
        return;
      }
      if (s === 1) {
        putFirst(g, next(2, { players: sel, index: 0 }));
        return;
      }
      let index = d.index as number;
      if (s === 3) {
        batchMove(g, chosen(), "discard");
        index++;
      }
      if (index < d.players.length) {
        const who = d.players[index];
        ask(
          g,
          next(3, { index }, who),
          "Suspicion · Choose a card to discard",
          moodOptions(g, hand(g, who)),
          1,
        );
        return;
      }
      return;
    }
    case "zeal":
      if (s === 0) {
        choose("You may exchange a card from your hand", hand(g, p));
        return;
      }
      if (sel.length) {
        move(g, card(g, sel[0]), "deck");
        draw(g, p);
      }
      return;
    default: // All remaining cards have only costs, continuous abilities, or no text.
      insist(
        !definitions[id].ability_types.includes("After playing this mood"),
        `Missing entry handler for ${id}`,
      );
      return;
  }
}
function scoreTask(g: Game, t: Task) {
  if (g.noScoring) {
    putFirst(g, { kind: "finish-round", actor: t.actor });
    return;
  }
  g.scores = baseScores(g);
  g.afterDone = [];
  g.afterCursor = 0;
  const choices = g.order.flatMap((p) =>
    inPlay(g, p)
      .filter((c) => ["enthusiasm", "passion"].includes(definition(c).id))
      .map((c) => ({ kind: "score-choice", actor: p, card: c.uid }) as Task),
  );
  putFirst(g, ...choices, { kind: "after", actor: g.order[0] });
}
function scoreChoice(g: Game, t: Task) {
  const m = card(g, t.card!);
  if (t.stage === 1) {
    if (selected(t).length)
      g.scores[t.actor] += value(g, card(g, selected(t)[0]));
    return;
  }
  const ms = inPlay(g).filter((c) =>
    definition(m).id === "enthusiasm"
      ? c.owner === t.actor
      : c.owner !== t.actor,
  );
  ask(
    g,
    { ...t, stage: 1 },
    `${definition(m).name} · You may score a mood one extra time`,
    moodOptions(g, ms),
  );
}
function afterTask(g: Game, t: Task) {
  const available = g.delayed
    .filter((e) => e.round === g.round && !g.afterDone.includes(e.id))
    .map((e) => {
      let who = e.actor;
      if (e.kind === "bashfulness") {
        const c = card(g, e.card);
        if (c.zone === "play") who = c.owner;
      }
      return {
        id: e.id,
        actor: who,
        label: `${definition(card(g, e.card)).name} · ${e.kind}`,
      };
    });
  for (const c of inPlay(g).filter(
    (c) => definition(c).id === "recklessness",
  )) {
    const id = `recklessness:${c.uid}:${g.round}`;
    if (!g.afterDone.includes(id))
      available.push({
        id,
        actor: c.owner,
        label: "Recklessness · Return to deck and draw",
      });
  }
  if (!available.length) {
    putFirst(g, { kind: "finish-round", actor: t.actor });
    return;
  }
  const cursor = g.afterCursor ?? 0,
    cyclic = [...g.order.slice(cursor), ...g.order.slice(0, cursor)];
  const who = cyclic.find((p) => available.some((e) => e.actor === p))!,
    effects = available.filter((e) => e.actor === who);
  g.afterCursor = g.order.indexOf(who);
  if (t.stage === 1) {
    putFirst(
      g,
      { kind: "after-effect", actor: t.actor, data: { id: selected(t)[0] } },
      { kind: "after", actor: g.order[0] },
    );
    return;
  }
  if (effects.length === 1) {
    putFirst(
      g,
      { kind: "after-effect", actor: who, data: { id: effects[0].id } },
      { kind: "after", actor: g.order[0] },
    );
    return;
  }
  ask(
    g,
    { kind: "after", actor: who, stage: 1 },
    "After scoring · Choose which effect resolves next",
    effects.map((e) => ({ id: e.id, label: e.label })),
    1,
  );
}
function afterEffect(g: Game, t: Task) {
  const id = t.data!.id;
  g.afterDone.push(id);
  if (id.startsWith("recklessness:")) {
    const c = card(g, id.split(":")[1]);
    if (c.zone === "play") {
      const p = c.owner;
      move(g, c, "deck");
      draw(g, p);
    }
    return;
  }
  const e = g.delayed.find((e) => e.id === id)!;
  const c = card(g, e.card);
  switch (e.kind) {
    case "bashfulness":
      if (
        c.zone === "play" &&
        (c.life ?? 0) === e.life &&
        winner(g) === c.owner
      ) {
        const who = c.owner;
        move(g, c, "deck");
        draw(g, who);
      }
      break;
    case "swap": {
      const a = g.scores[e.actor];
      g.scores[e.actor] = g.scores[e.player!];
      g.scores[e.player!] = a;
      break;
    }
    case "discard":
      if (c.zone === "play" && (c.life ?? 0) === e.life) move(g, c, "discard");
      break;
    case "hand":
      if (c.zone === "play" && (c.life ?? 0) === e.life)
        move(g, c, "hand", e.actor);
      break;
    case "return": {
      const target = card(g, e.target!);
      if (target.zone === "play" && (target.life ?? 0) === e.targetLife) {
        const sourceId = e.sourceDef ?? definition(c).id;
        if (sourceId === "betrayal") move(g, target, "play", e.actor);
        else if (target.owner === e.actor) move(g, target, "play", e.player!);
      }
      break;
    }
  }
}
function finishRound(g: Game) {
  let first = g.nextFirst;
  if (!g.noScoring) {
    const who = winner(g);
    g.lastRound = {
      round: g.round,
      scores: { ...g.scores },
      winner: who,
      order: [...g.order],
    };
    const p = g.players.find((p) => p.id === who)!;
    p.wins += g.roundAward;
    log(g, `${p.name} won round ${g.round} with ${g.scores[who]} points.`);
    if (p.wins >= 3) {
      g.winner = who;
      g.status = "finished";
      g.scoring = false;
      g.grants = [];
      log(g, `${p.name} wins the game!`);
      return;
    }
    for (const p of g.players) if (p.id !== who) draw(g, p.id);
    if (g.players.length >= 3) {
      const last = [...g.order].sort(
        (a, b) =>
          g.scores[a] - g.scores[b] || g.order.indexOf(b) - g.order.indexOf(a),
      )[0];
      g.lastRound!.hurtFeelings = last;
      g.nextPlays.push({
        player: last,
        afterTurn: g.turn,
        label: "Hurt Feelings",
      });
      log(
        g,
        `${playerName(g, last)} has Hurt Feelings: one extra play next turn.`,
      );
    }
    first = who;
  } else {
    g.lastRound = { round: g.round, scores: {} };
    log(g, `Round ${g.round} ended without scoring.`);
  }
  const honor = inPlay(g)
    .filter((c) => definition(c).id === "honor" && c.chosenPlayer)
    .sort((a, b) => b.serial - a.serial)[0];
  if (honor) first = honor.chosenPlayer;
  first ??= g.order[0];
  g.lastRound!.nextFirst = first;
  const index = g.order.indexOf(first);
  g.order = [...g.order.slice(index), ...g.order.slice(0, index)];
  g.round++;
  g.turnIndex = 0;
  g.noScoring = false;
  delete g.nextFirst;
  g.roundAward = 1;
  g.scoring = false;
  g.scores = {};
  g.delayed = g.delayed.filter((e) => e.round >= g.round);
  g.suppressions = g.suppressions.filter((s) => !s.round || s.round >= g.round);
  g.bans = g.bans.filter((b) => b.round >= g.round);
  beginTurn(g);
}
export function publicView(g: Game, you: string): View {
  const visible = (m: Mood): PublicCard => ({
    ...m,
    name: definition(m).name,
    color: color(g, m),
    value: value(g, m),
    suppressed: suppressed(g, m),
    image: "/" + definition(m).images[0].path,
    rules: definition(m).rules_text,
  });
  const playable: Record<string, string[]> = {};
  if (!g.prompt && !g.scoring)
    for (const m of [...hand(g, you), ...g.discard.map((id) => card(g, id))]) {
      const grants = g.grants
        .filter((gr) => canPlay(g, you, m, gr))
        .map((gr) => gr.id);
      if (grants.length) playable[m.uid] = grants;
    }
  const scores = g.scoring ? g.scores : baseScores(g);
  let prompt: View["prompt"];
  if (g.prompt?.actor === you) {
    const { task, ...q } = g.prompt;
    prompt = q;
  }
  return {
    order: g.order,
    suppressions: g.suppressions,
    revision: g.revision,
    status: g.status,
    players: g.players.map((p) => ({
      ...p,
      handCount: hand(g, p.id).length,
      score: scores[p.id] ?? 0,
    })),
    host: g.host,
    you,
    hand: hand(g, you).map(visible),
    moods: inPlay(g).map(visible),
    discard: g.discard.map((id) => visible(card(g, id))),
    deckCount: g.deck.length,
    round: g.round,
    active: active(g),
    grants: active(g) === you ? g.grants : [],
    playable,
    prompt,
    waitingFor: g.prompt?.actor,
    winner: g.winner,
    lastRound: g.lastRound,
    lastPlayed: g.lastPlayed,
    log: g.log,
    scoring: g.scoring,
  };
}
