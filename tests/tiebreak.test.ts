import { describe, expect, it } from "vitest";
import { add, choose, pass, play, table } from "./helpers";

describe("round ties use actual plays", () => {
  it("awards a three-player score tie to the earliest player who played, not a passer", () => {
    let g = table(3);
    add(g, "apathy", "play", "a");
    g = pass(g);
    g = pass(play(g, "apathy"));
    g = pass(play(g, "apathy"));

    expect(g.lastRound?.scores).toEqual({ a: 4, b: 4, c: 4 });
    expect(g.lastRound?.winner).toBe("b");
  });

  it("records only the first play of a turn with extra plays", () => {
    let g = table(3);
    add(g, "apathy", "play", "a");
    add(g, "charity", "play", "a");
    g = pass(g);
    g = play(g, "charity");
    const extra = g.grants.find((grant) => grant.label === "Charity")!.id;
    g = play(g, "apathy", extra);
    expect(g.roundPlays).toEqual(["b"]);
    g = pass(g);
    g = pass(play(g, "chivalry"));

    expect(g.lastRound?.scores).toEqual({ a: 5, b: 5, c: 5 });
    expect(g.lastRound?.winner).toBe("b");
    expect(g.roundPlays).toEqual([]);
  });

  it("breaks a lowest-score tie for Hurt Feelings by the latest actual play", () => {
    let g = table(3);
    add(g, "apathy", "play", "a");
    g = pass(g);
    g = choose(play(g, "creativity"), []);
    g = pass(g);
    g = pass(g);

    expect(g.lastRound?.scores).toEqual({ a: 4, b: 0, c: 0 });
    expect(g.lastRound?.hurtFeelings).toBe("b");
  });

  it("uses seat order when nobody played and starts fresh next round", () => {
    let g = table(3);
    g = pass(pass(pass(g)));
    expect(g.lastRound?.winner).toBe("a");
    expect(g.lastRound?.hurtFeelings).toBe("c");
    expect(g.roundPlays).toEqual([]);
  });

  it("lets an older saved round finish with seat-order fallback", () => {
    let g = table(3);
    delete g.roundPlays;
    g = pass(pass(pass(g)));
    expect(g.lastRound?.winner).toBe("a");
    expect(g.roundPlays).toEqual([]);
  });
});
