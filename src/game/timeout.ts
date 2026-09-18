import { botAction } from "./bot";
import type { Action, View } from "./types";
// What the table does for a player whose time ran out: skip what can be
// skipped, answer what cannot the way the Normal bot would, otherwise end the
// turn. It never plays a card from their hand. Kept apart from clock.ts so the
// browser can import the clock settings without bundling the bots.
export function timeoutAction(view: View, seed: number): Action {
  const q = view.prompt;
  if (!q) return { type: "pass" };
  if (
    q.min === 0 &&
    (!q.constraints?.allowedCounts || q.constraints.allowedCounts.includes(0))
  )
    return { type: "choose", prompt: q.id, selected: [] };
  return botAction(view, "normal", seed);
}
