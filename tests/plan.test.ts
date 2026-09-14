import { describe, expect, it } from "vitest";
import { act, publicView } from "../src/game/engine";
import { applyChoices, playPlanned, previewPlay } from "../src/game/plan";
import { add, find, table } from "./helpers";
describe("deciding a card's effects from the hand", () => {
  it("previews the decision a play would ask without changing the game", () => {
    const g = table();
    const target = add(g, "apathy", "play", "b");
    const anger = add(g, "anger", "hand");
    const before = JSON.stringify(g);
    const preview = previewPlay(g, "a", anger, "base", []);
    expect(JSON.stringify(g)).toBe(before);
    expect(preview.done).toBe(false);
    expect(preview.applied).toBe(0);
    expect(preview.prompt?.title).toMatch(/^Anger/);
    expect(preview.prompt?.options.map((o) => o.card)).toContain(target);
    expect(preview.prompt).not.toHaveProperty("task");
  });
  it("walks through several decisions and reports when the plan is complete", () => {
    const g = table();
    add(g, "apathy", "hand");
    const bliss = add(g, "bliss", "hand");
    const cost = previewPlay(g, "a", bliss, "base", []);
    expect(cost.prompt?.title).toMatch(/^Bliss · Choose cards from your hand/);
    const payWith = cost.prompt!.options[0].id;
    const next = previewPlay(g, "a", bliss, "base", [
      { title: cost.prompt!.title, selected: [payWith] },
    ]);
    expect(next.applied).toBe(1);
    expect(next.done).toBe(true);
    expect(next.prompt).toBeUndefined();
  });
  it("replays planned answers into the real play", () => {
    const g = table();
    const target = add(g, "apathy", "play", "b");
    const anger = add(g, "anger", "hand");
    const preview = previewPlay(g, "a", anger, "base", []);
    const played = playPlanned(g, "a", {
      type: "play",
      card: anger,
      grant: "base",
      choices: [{ title: preview.prompt!.title, selected: [target] }],
    });
    expect(played.prompt).toBeUndefined();
    expect(find(played, "apathy").zone).toBe("discard");
    expect(find(played, "anger").zone).toBe("play");
  });
  it("leaves a decision at the table when the plan does not match it", () => {
    const g = table();
    const target = add(g, "apathy", "play", "b");
    const anger = add(g, "anger", "hand");
    const played = playPlanned(g, "a", {
      type: "play",
      card: anger,
      grant: "base",
      choices: [{ title: "Something else", selected: [target] }],
    });
    expect(played.prompt?.title).toMatch(/^Anger/);
    expect(find(played, "apathy").zone).toBe("play");
    const stale = applyChoices(played, "a", [
      { title: played.prompt!.title, selected: ["not-a-card"] },
    ]);
    expect(stale.applied).toBe(0);
    expect(stale.game.prompt?.title).toMatch(/^Anger/);
  });
  it("a preview never reveals a random outcome the real play will have", () => {
    const g = table();
    for (const d of [
      "apathy",
      "boredom",
      "laziness",
      "complacency",
      "indifference",
      "anger",
      "cheer",
      "hope",
      "love",
      "wrath",
    ])
      add(g, d, "discard", "");
    const altruism = add(g, "altruism", "hand");
    const preview = previewPlay(g, "a", altruism, "base", []);
    expect(preview.done).toBe(true);
    const real = act(g, "a", { type: "play", card: altruism, grant: "base" });
    const previewed = act({ ...g, rng: (g.rng ^ 0x9e3779b9) >>> 0 }, "a", {
      type: "play",
      card: altruism,
      grant: "base",
    });
    const outcome = (x: typeof real) => [
      ...publicView(x, "a").hand.map((c) => c.def),
      ...x.deck,
    ];
    expect(outcome(real)).not.toEqual(outcome(previewed));
  });
});
