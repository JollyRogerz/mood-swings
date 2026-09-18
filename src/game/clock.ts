import type { Game } from "./types";
// A shot clock with a time bank, chosen by the host in the lobby.
//
// Every decision the table waits on (a play, ending the turn, answering a card
// effect) gets the same fresh allowance. It only runs while the table is
// actually waiting on that player: never during a card reveal or the round
// results. When the allowance runs out the player's personal time bank drains
// instead, so one hard decision is forgiven but chronic slowness is not. When
// the bank is empty too, the table moves on: an optional effect is skipped, a
// mandatory one is answered sensibly, and an unfinished turn simply ends.
// A player who times out twice in a row is treated as away and gets a short
// allowance until they act again, so an absent friend never stalls the night.
export const CLOCKS = {
  off: { label: "No timer", decision: 0, bank: 0, refill: 0 },
  relaxed: {
    label: "Relaxed",
    decision: 90_000,
    bank: 180_000,
    refill: 30_000,
  },
  standard: {
    label: "Standard",
    decision: 45_000,
    bank: 90_000,
    refill: 20_000,
  },
  brisk: { label: "Brisk", decision: 25_000, bank: 45_000, refill: 10_000 },
} as const;
export type ClockSetting = keyof typeof CLOCKS;
export const AWAY_AFTER = 2;
export const AWAY_DECISION = 10_000;
export interface ClockState {
  key: string;
  actor: string;
  startsAt: number;
  budget: number;
  deadline: number;
  overtime: boolean;
}
export interface ClockView {
  setting: ClockSetting;
  actor?: string;
  // The allowance has not started while a reveal or the results are showing.
  startsInMs?: number;
  remainingMs?: number;
  totalMs?: number;
  overtime?: boolean;
  bank: Record<string, number>;
  away: string[];
}
// Tests shrink every duration; production leaves this at one.
let scale = 1;
export function setClockScale(value: number) {
  scale = Number.isFinite(value) && value > 0 ? value : 1;
}
export function isClock(value: unknown): value is ClockSetting {
  return typeof value === "string" && Object.hasOwn(CLOCKS, value);
}
export function clockRules(setting?: ClockSetting) {
  const c = CLOCKS[setting ?? "off"];
  return {
    decision: c.decision * scale,
    bank: c.bank * scale,
    refill: c.refill * scale,
    away: AWAY_DECISION * scale,
  };
}
// The player the table is waiting on, if any.
export function waitingOn(game: Game): string | undefined {
  if (game.status !== "playing" || game.scoring) return undefined;
  return game.prompt?.actor ?? game.order[game.turnIndex];
}
const keyOf = (game: Game, actor: string) =>
  [
    actor,
    game.prompt?.id ?? "turn",
    game.round,
    game.turn,
    game.lastPlayed?.id ?? 0,
  ].join("|");
const isAway = (game: Game, id: string) =>
  (game.timeouts?.[id] ?? 0) >= AWAY_AFTER;
// Call after every state change. Starts a fresh allowance for a new decision,
// keeps the running one otherwise, and lets a shortened reveal start it sooner
// but never later.
export function armClock(
  game: Game,
  now: number,
  opts: { humanConnected: boolean; nothingToDecide: boolean },
) {
  const rules = clockRules(game.clock);
  const actor = waitingOn(game);
  const player = game.players.find((p) => p.id === actor);
  if (
    !rules.decision ||
    !actor ||
    !player ||
    player.bot ||
    !opts.humanConnected ||
    opts.nothingToDecide
  ) {
    delete game.clockState;
    return;
  }
  game.bank ??= {};
  for (const p of game.players)
    if (!p.bot && game.bank[p.id] === undefined) game.bank[p.id] = rules.bank;
  if (game.bankRound !== game.round) {
    if (game.bankRound !== undefined)
      for (const id of Object.keys(game.bank))
        game.bank[id] = Math.min(rules.bank, game.bank[id] + rules.refill);
    game.bankRound = game.round;
  }
  const pauseEnd = Math.max(
    now,
    game.playPauseUntil ?? 0,
    game.roundPauseUntil ?? 0,
  );
  const key = keyOf(game, actor);
  const state = game.clockState;
  if (state?.key === key) {
    if (!state.overtime && pauseEnd < state.startsAt) {
      state.startsAt = pauseEnd;
      state.deadline = state.startsAt + state.budget;
    }
    return;
  }
  const budget = isAway(game, actor) ? rules.away : rules.decision;
  game.clockState = {
    key,
    actor,
    startsAt: pauseEnd,
    budget,
    deadline: pauseEnd + budget,
    overtime: false,
  };
}
// Call when the deadline passes. "overtime" means the bank has started to
// drain; "timeout" means the table must now act for the player.
export function expireClock(
  game: Game,
  now: number,
): "none" | "overtime" | "timeout" {
  const state = game.clockState;
  if (!state || now < state.deadline || waitingOn(game) !== state.actor)
    return "none";
  const bank = game.bank?.[state.actor] ?? 0;
  if (!state.overtime && bank > 0 && !isAway(game, state.actor)) {
    state.overtime = true;
    state.startsAt = now;
    state.budget = bank;
    state.deadline = now + bank;
    return "overtime";
  }
  if (state.overtime) game.bank![state.actor] = 0;
  game.timeouts ??= {};
  game.timeouts[state.actor] = (game.timeouts[state.actor] ?? 0) + 1;
  delete game.clockState;
  return "timeout";
}
// Call when a player acts for themselves: charge any bank time they used and
// forgive earlier timeouts. `before` is the state the action was made against.
export function settleClock(
  next: Game,
  before: Game,
  actor: string,
  now: number,
) {
  const state = before.clockState;
  if (state?.actor === actor && state.overtime && next.bank)
    next.bank[actor] = Math.max(
      0,
      (before.bank?.[actor] ?? 0) - Math.max(0, now - state.startsAt),
    );
  if (next.timeouts?.[actor]) next.timeouts[actor] = 0;
}
export function clockView(game: Game, now: number): ClockView {
  const state = game.clockState;
  const away = game.players.filter((p) => isAway(game, p.id)).map((p) => p.id);
  const base = {
    setting: game.clock ?? "off",
    bank: { ...(game.bank ?? {}) },
    away,
  } satisfies ClockView;
  if (!state) return base;
  return {
    ...base,
    actor: state.actor,
    startsInMs: Math.max(0, state.startsAt - now),
    remainingMs: Math.max(0, state.deadline - Math.max(now, state.startsAt)),
    totalMs: state.budget,
    overtime: state.overtime,
    bank: state.overtime
      ? {
          ...base.bank,
          [state.actor]: Math.max(0, state.deadline - now),
        }
      : base.bank,
  };
}
