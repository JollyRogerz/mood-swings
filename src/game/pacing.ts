import type { Game } from "./types";

export const PACING = {
  relaxed: { label: "Relaxed", reveal: 9000, results: 12000 },
  standard: { label: "Standard", reveal: 6000, results: 9000 },
  quick: { label: "Quick", reveal: 3000, results: 6500 },
} as const;
export type Pace = keyof typeof PACING;
export function isPace(value: unknown): value is Pace {
  return typeof value === "string" && Object.hasOwn(PACING, value);
}
export function pacing(pace?: Pace) {
  return PACING[pace ?? "standard"];
}
// Only the current reveal can be acknowledged. A client can never advance a
// turn here; normal server deadlines and action validation still apply.
export function acknowledgeReveal(
  game: Game,
  actor: string,
  playId: number,
  now: number,
): boolean {
  if (
    !game.lastPlayed ||
    game.lastPlayed.id !== playId ||
    (game.playPauseUntil ?? 0) <= now ||
    !game.players.some((p) => p.id === actor && p.connected && !p.bot)
  )
    return false;
  const ready = new Set(game.revealReady ?? []);
  if (ready.has(actor)) return false;
  ready.add(actor);
  game.revealReady = [...ready];
  const humans = game.players.filter((p) => !p.bot && p.connected);
  if (humans.every((p) => ready.has(p.id))) {
    const deadline = game.playPauseUntil!;
    const started = deadline - pacing(game.pace).reveal;
    game.playPauseUntil = Math.min(
      game.playPauseUntil!,
      Math.max(now + 120, started + 1200),
    );
    if ((game.roundPauseUntil ?? 0) > deadline)
      game.roundPauseUntil! -= deadline - game.playPauseUntil;
  }
  return true;
}
// The round results can be closed early the same way, once every connected
// human has finished reading. A short minimum keeps the winner visible.
export const RESULTS_MINIMUM = 2500;
export function acknowledgeResults(
  game: Game,
  actor: string,
  round: number,
  now: number,
): boolean {
  if (
    game.lastRound?.round !== round ||
    (game.roundPauseUntil ?? 0) <= now ||
    (game.playPauseUntil ?? 0) > now ||
    !game.players.some((p) => p.id === actor && p.connected && !p.bot)
  )
    return false;
  const ready = new Set(game.resultsReady ?? []);
  if (ready.has(actor)) return false;
  ready.add(actor);
  game.resultsReady = [...ready];
  const humans = game.players.filter((p) => !p.bot && p.connected);
  if (humans.every((p) => ready.has(p.id))) {
    const started = game.roundPauseUntil! - pacing(game.pace).results;
    game.roundPauseUntil = Math.min(
      game.roundPauseUntil!,
      Math.max(now + 150, started + RESULTS_MINIMUM),
    );
  }
  return true;
}
