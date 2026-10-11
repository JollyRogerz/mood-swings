import { describe, expect, it } from "vitest";
import { publicView } from "../src/game/engine";
import { add, choose, pass, play, table } from "./helpers";

describe("structured current-turn play count", () => {
  it("counts completed plays, including extra plays, and resets on the next turn", () => {
    let g = table();
    expect(publicView(g, "a").turnPlayCount).toBe(0);
    g = play(g, "charity");
    expect(g.turnPlayCount).toBe(1);
    const extra = g.grants.find((grant) => grant.label === "Charity")!.id;
    g = play(g, "apathy", extra);
    expect(publicView(g, "a").turnPlayCount).toBe(2);
    g = pass(g);
    expect(g.turnPlayCount).toBe(0);
  });

  it("does not count an unfinished play while its required cost is being chosen", () => {
    let g = table();
    const first = add(g, "apathy");
    const second = add(g, "boredom");
    add(g, "laziness", "play", "b");
    g = play(g, "regret");
    expect(g.turnPlayCount).toBe(0);
    g = choose(g, [first, second]);
    expect(g.turnPlayCount).toBe(1);
  });

  it("keeps old saved rounds on log fallback until a new turn begins", () => {
    let g = table();
    delete g.turnPlayCount;
    g = play(g, "apathy");
    expect(publicView(g, "a").turnPlayCount).toBeUndefined();
    g = pass(g);
    expect(publicView(g, "b").turnPlayCount).toBe(0);
  });
});
