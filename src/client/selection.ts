import type { PromptView } from "../game/plan";

// Explain the server's constraints using the values attached to this exact
// decision. The board behind a pre-play preview can have different values.
export function selectionFeedback(q: PromptView, selected: string[]) {
  const options = selected.map((id) => q.options.find((o) => o.id === id));
  const known = options.every((o) => o !== undefined);
  const total = options.every((o) => typeof o?.value === "number")
    ? options.reduce((n, o) => n + o!.value!, 0)
    : undefined;
  const c = q.constraints;
  let problem = "";
  if (!known || new Set(selected).size !== selected.length)
    problem = "Choose each available option once.";
  else if (c?.allowedCounts && !c.allowedCounts.includes(selected.length))
    problem = `Choose ${c.allowedCounts.filter((n) => n > 0).join(" or ")} together${c.allowedCounts.includes(0) ? ", or skip this effect" : ""}.`;
  else if (selected.length < q.min)
    problem = `Choose ${q.min - selected.length} more to continue.`;
  else if (selected.length > q.max) problem = `Choose no more than ${q.max}.`;
  else if (
    c?.maxValue !== undefined &&
    total !== undefined &&
    total > c.maxValue
  )
    problem = `${total - c.maxValue} over the limit. Remove a mood or choose a lower value.`;
  else if (
    c?.differentPlayers &&
    new Set(options.map((o) => o!.player)).size !== selected.length
  )
    problem = "Choose at most one mood from each player.";
  else if (c?.samePlayer && new Set(options.map((o) => o!.player)).size > 1)
    problem = "Choose both moods from the same player.";
  else if (
    c?.matchingPair &&
    options.length === 2 &&
    options.every((o) => o?.color !== undefined && o.value !== undefined) &&
    options[0]!.color !== options[1]!.color &&
    options[0]!.value !== options[1]!.value
  )
    problem = "These moods need the same color or the same value.";
  return {
    valid: !problem,
    problem,
    total,
    limit: c?.maxValue,
    count: selected.length,
  };
}

export function choiceHint(q: PromptView) {
  const counts = q.constraints?.allowedCounts?.filter((n) => n > 0);
  const count = counts?.length
    ? `Choose ${counts.join(" or ")} together${q.min === 0 ? ", or skip" : ""}`
    : q.min === q.max
      ? `Choose ${q.min}`
      : `Choose ${q.min ? `${q.min}–${q.max}` : `up to ${q.max}`}`;
  return [
    count,
    q.constraints?.maxValue !== undefined &&
      `Combined value: ${q.constraints.maxValue} or less`,
    q.constraints?.differentPlayers && "One mood per player",
    q.constraints?.samePlayer && "From the same player",
    q.constraints?.matchingPair && "Matching color or value",
  ]
    .filter(Boolean)
    .join(" · ");
}
