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
// Simulate the play without touching the live game. Randomness is re-seeded so
// a preview never reveals what a random effect will actually do.
export function previewPlay(
  g: Game,
  actor: string,
  card: string,
  grant: string,
  choices: PlannedChoice[],
): Preview {
  const simulated = act({ ...g, rng: (g.rng ^ 0x9e3779b9) >>> 0 }, actor, {
    type: "play",
    card,
    grant,
  });
  const { game, applied } = applyChoices(simulated, actor, choices);
  const mine = game.prompt?.actor === actor ? game.prompt : undefined;
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
