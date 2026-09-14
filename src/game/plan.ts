import { act, RuleError } from "./engine";
import type { Action, Game, PlannedChoice, Prompt } from "./types";
// Decide a card's effects while it is still in your hand. The client previews
// the play, answers each decision the engine would ask, then sends the play with
// those answers attached. The engine itself is unchanged: the answers are simply
// replayed into the prompts it raises, and any prompt that does not match what
// was previewed is left for the player to answer at the table.
export type PromptView = Omit<Prompt, "task">;
export interface Preview {
  card: string;
  grant: string;
  applied: number;
  prompt?: PromptView;
  done: boolean;
}
// The transport already bounds message size. Do not silently shorten a legal
// "any number" selection or a sequence of repeated card effects.
export function parsePlannedChoices(raw: unknown): PlannedChoice[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new RuleError("Invalid planned choices.");
  return raw.map((choice) => {
    if (
      !choice ||
      typeof choice.title !== "string" ||
      !Array.isArray(choice.selected) ||
      !choice.selected.every((id: unknown) => typeof id === "string")
    )
      throw new RuleError("Invalid planned choices.");
    return { title: choice.title, selected: [...choice.selected] };
  });
}
const strip = (p: Prompt): PromptView => {
  const { task, ...q } = p;
  void task;
  return q;
};
// Feed planned answers into the prompts a play raised, stopping at the first
// prompt that belongs to someone else or does not match the plan.
export function applyChoices(
  g: Game,
  actor: string,
  choices: PlannedChoice[],
): { game: Game; applied: number } {
  let applied = 0;
  for (const c of choices) {
    if (!g.prompt || g.prompt.actor !== actor || g.prompt.title !== c.title)
      break;
    try {
      g = act(g, actor, {
        type: "choose",
        prompt: g.prompt.id,
        selected: c.selected,
      });
    } catch (error) {
      if (error instanceof RuleError) break;
      throw error;
    }
    applied++;
  }
  return { game: g, applied };
}
// Stop planning when an outcome requires randomness or hidden cards. Merely
// changing the RNG seed is insufficient: drawing from the deck can otherwise
// expose a real hidden card in a subsequent prompt (for example, repeated Zeal).
export function previewPlay(
  g: Game,
  actor: string,
  card: string,
  grant: string,
  choices: PlannedChoice[],
): Preview {
  const seed = (g.rng ^ 0x9e3779b9) >>> 0;
  const hidden = g.cards.filter(
    (c) => c.zone === "deck" || (c.zone === "hand" && c.owner !== actor),
  );
  const crossedBoundary = (game: Game) =>
    game.rng !== seed ||
    hidden.some((before) => {
      const after = game.cards.find((c) => c.uid === before.uid)!;
      return after.zone !== before.zone || after.owner !== before.owner;
    });
  let game = act({ ...g, rng: seed }, actor, {
    type: "play",
    card,
    grant,
  });
  let applied = 0;
  for (const choice of choices) {
    if (crossedBoundary(game)) break;
    const result = applyChoices(game, actor, [choice]);
    if (!result.applied) break;
    game = result.game;
    applied++;
  }
  const mine =
    !crossedBoundary(game) && game.prompt?.actor === actor
      ? game.prompt
      : undefined;
  return {
    card,
    grant,
    applied,
    prompt: mine && strip(mine),
    done: !mine,
  };
}
// The authoritative version of a planned play.
export function playPlanned(g: Game, actor: string, action: Action): Game {
  const next = act(g, actor, action);
  return action.type === "play" && action.choices?.length
    ? applyChoices(next, actor, action.choices).game
    : next;
}
