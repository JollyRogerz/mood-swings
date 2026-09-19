import { AWAY_AFTER } from "./clock";
import { RuleError } from "./engine";
import type { Game } from "./types";
// Seat management that is not part of the card rules: letting the host hand an
// absent friend's seat to a bot, giving it back when they return, and keeping
// a short history of finished rounds.
export function isAbsent(game: Game, id: string) {
  const p = game.players.find((p) => p.id === id);
  return (
    !!p && !p.bot && (!p.connected || (game.timeouts?.[id] ?? 0) >= AWAY_AFTER)
  );
}
// The host may seat a Normal bot for a human who has left or stopped acting.
// The seat, hand, moods and wins are untouched; only who decides changes.
export function substituteBot(game: Game, host: string, target: string) {
  if (host !== game.host)
    throw new RuleError("Only the host can seat a bot for an absent player.");
  if (game.status !== "playing")
    throw new RuleError("Bots can only stand in during a game.");
  const p = game.players.find((p) => p.id === target);
  if (!p || p.bot || target === host)
    throw new RuleError("Choose another player's seat.");
  if (!isAbsent(game, target))
    throw new RuleError(`${p.name} is still at the table.`);
  p.bot = "normal";
  p.substitute = true;
  p.connected = true;
  if (game.timeouts) game.timeouts[target] = 0;
  game.log.push({
    id: ++game.serial,
    text: `A bot is playing for ${p.name} until they return.`,
  });
  if (game.log.length > 120) game.log.shift();
  game.revision++;
}
// Returning players take their seat back from the stand-in automatically.
export function reclaimSeat(game: Game, id: string): boolean {
  const p = game.players.find((p) => p.id === id);
  if (!p?.substitute) return false;
  delete p.bot;
  delete p.substitute;
  game.log.push({
    id: ++game.serial,
    text: `${p.name} is back and playing their own hand.`,
  });
  if (game.log.length > 120) game.log.shift();
  return true;
}
export const HISTORY_LIMIT = 12;
// Remember each finished round so earlier score sheets can be reopened.
export function recordRound(next: Game, before: Game) {
  if (!next.lastRound || next.lastRound.round === before.lastRound?.round)
    return;
  next.history = [
    ...(next.history ?? []).filter((r) => r.round !== next.lastRound!.round),
    structuredClone(next.lastRound),
  ].slice(-HISTORY_LIMIT);
}
