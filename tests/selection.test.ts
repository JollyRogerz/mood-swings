import { describe, expect, it } from "vitest";
import { choiceHint, selectionFeedback } from "../src/client/selection";
import { act, publicView, value } from "../src/game/engine";
import { previewPlay, type PromptView } from "../src/game/plan";
import { add, table } from "./helpers";

const prompt = (overrides: Partial<PromptView> = {}): PromptView => ({
  id: "test",
  actor: "a",
  title: "Choose moods",
  min: 0,
  max: 3,
  options: [
    { id: "one", label: "First", value: 3, color: "red", player: "a" },
    { id: "two", label: "Second", value: 2, color: "blue", player: "a" },
    { id: "three", label: "Third", value: 3, color: "green", player: "b" },
  ],
  ...overrides,
});

describe("guidance while choosing an effect", () => {
  it("lets an optional effect be skipped but explains mandatory selections", () => {
    expect(selectionFeedback(prompt(), []).valid).toBe(true);
    expect(selectionFeedback(prompt({ min: 2 }), ["one"]).problem).toBe(
      "Choose 1 more to continue.",
    );
  });
  it("accepts the exact point budget and explains an excess before confirmation", () => {
    const q = prompt({ constraints: { maxValue: 5 } });
    expect(selectionFeedback(q, ["one", "two"])).toMatchObject({
      valid: true,
      total: 5,
      limit: 5,
    });
    expect(selectionFeedback(q, ["one", "three"])).toMatchObject({
      valid: false,
      total: 6,
    });
    expect(selectionFeedback(q, ["one", "three"]).problem).toContain(
      "1 over the limit",
    );
  });
  it.each([[["missing"]], [["one", "one"]]])(
    "rejects stale or duplicate option IDs: %j",
    (selected) => {
      expect(selectionFeedback(prompt(), selected).valid).toBe(false);
    },
  );
  it("enforces all-or-nothing pairs", () => {
    const q = prompt({ max: 2, constraints: { allowedCounts: [0, 2] } });
    expect(selectionFeedback(q, []).valid).toBe(true);
    expect(selectionFeedback(q, ["one"]).problem).toContain(
      "Choose 2 together",
    );
    expect(selectionFeedback(q, ["one", "two"]).valid).toBe(true);
  });
  it("explains choices from different players", () => {
    const q = prompt({ constraints: { differentPlayers: true } });
    expect(selectionFeedback(q, ["one", "two"]).valid).toBe(false);
    expect(selectionFeedback(q, ["one", "three"]).valid).toBe(true);
  });
  it("explains choices from the same player", () => {
    const q = prompt({ constraints: { samePlayer: true } });
    expect(selectionFeedback(q, ["one", "two"]).valid).toBe(true);
    expect(selectionFeedback(q, ["one", "three"]).valid).toBe(false);
  });
  it("recognizes both matching colors and matching values", () => {
    const q = prompt({ constraints: { matchingPair: true } });
    expect(selectionFeedback(q, ["one", "two"]).valid).toBe(false);
    expect(selectionFeedback(q, ["one", "three"]).valid).toBe(true);
    q.options[1].color = "red";
    expect(selectionFeedback(q, ["one", "two"]).valid).toBe(true);
  });
  it("does not invent a total for a choice without numeric metadata", () => {
    const q = prompt({ options: [{ id: "yes", label: "Use the effect" }] });
    expect(selectionFeedback(q, ["yes"])).toMatchObject({
      valid: true,
      total: undefined,
    });
  });
  it("explains the applicable constraints in the instruction", () => {
    expect(
      choiceHint(
        prompt({
          max: 2,
          constraints: {
            allowedCounts: [0, 2],
            matchingPair: true,
            samePlayer: true,
          },
        }),
      ),
    ).toBe(
      "Choose 2 together, or skip · From the same player · Matching color or value",
    );
    expect(
      choiceHint(
        prompt({ constraints: { maxValue: 5, differentPlayers: true } }),
      ),
    ).toContain("Combined value: 5 or less · One mood per player");
  });
});

describe("selection metadata from the authoritative decision", () => {
  it("uses post-entry values in a preview when a played color flips a mood", () => {
    const g = table();
    const target = add(g, "discipline", "play", "b");
    add(g, "apathy", "play", "b"); // Black; Anger supplies the second red/black mood.
    const anger = add(g, "anger", "hand");
    const before = value(
      g,
      g.cards.find((c) => c.uid === target)!,
    );
    const preview = previewPlay(g, "a", anger, "base", []);
    const played = act(g, "a", { type: "play", card: anger, grant: "base" });
    const after = value(
      played,
      played.cards.find((c) => c.uid === target)!,
    );
    expect(before).not.toBe(after);
    expect(preview.prompt!.options.find((o) => o.card === target)?.value).toBe(
      after,
    );
    expect(selectionFeedback(preview.prompt!, [target]).total).toBe(after);
    expect(preview.revision).toBe(g.revision);
    expect(preview.choicesKey).toBe("[]");
    expect(
      value(
        g,
        g.cards.find((c) => c.uid === target)!,
      ),
    ).toBe(before);
  });
  it("refreshes old saved prompts and keeps their options private to the chooser", () => {
    const g = table();
    const target = add(g, "apathy", "play", "b");
    const anger = add(g, "anger", "hand");
    const played = act(g, "a", { type: "play", card: anger, grant: "base" });
    for (const option of played.prompt!.options) {
      delete option.value;
      delete option.color;
    }
    const option = publicView(played, "a").prompt!.options.find(
      (o) => o.card === target,
    )!;
    expect(option.value).toBe(
      value(
        played,
        played.cards.find((c) => c.uid === target)!,
      ),
    );
    expect(option.color).toBe("black");
    expect(publicView(played, "b").prompt).toBeUndefined();
    expect(
      played.prompt!.options.find((o) => o.card === target)?.value,
    ).toBeUndefined();
  });
  it("identifies which answers a returned preview actually evaluated", () => {
    const g = table();
    const target = add(g, "apathy", "play", "b");
    const anger = add(g, "anger", "hand");
    const first = previewPlay(g, "a", anger, "base", []);
    const choices = [{ title: first.prompt!.title, selected: [target] }];
    const second = previewPlay(g, "a", anger, "base", choices);
    expect(second.choicesKey).toBe(JSON.stringify(choices));
    expect(second.choicesKey).not.toBe(first.choicesKey);
    expect(second.done).toBe(true);
  });
});
