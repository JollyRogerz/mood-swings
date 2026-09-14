import { describe, expect, it } from "vitest";
import {
  act,
  baseScores,
  canPlay,
  color,
  hand,
  inPlay,
  publicView,
  value,
} from "../src/game/engine";
import { previewPlay } from "../src/game/plan";
import type { Game } from "../src/game/types";
import { add, choose, find, pass, play, settle, table } from "./helpers";

// Extra permissions isolate the interaction under test from unrelated setup cards.
function extra(g: Game, def: string) {
  g.grants.push({ id: "audit", label: "Fixture permission", source: "hand" });
  return play(g, def, "audit");
}
function finish(g: Game): Game {
  const round = g.round;
  while (g.round === round && g.status === "playing")
    g = g.prompt ? settle(g) : pass(g);
  return g;
}

describe("official-rules audit: confirmed regressions", () => {
  it("Malice spares itself, including when its player chooses it in the pair", () => {
    let g = table();
    const black = add(g, "apathy");
    const otherMalice = add(g, "malice", "play", "b");
    g = play(g, "malice");
    const source = inPlay(g, "a").find((c) => c.def === "malice")!.uid;
    g = choose(g, ["a"]);
    g = choose(g, [black, source]);
    expect(g.cards.find((c) => c.uid === source)!.zone).toBe("play");
    expect(g.cards.find((c) => c.uid === otherMalice)!.zone).toBe("discard");
    expect(find(g, "apathy").zone).toBe("discard");
  });

  it("Suspicion conceals all discards until every affected player has chosen", () => {
    let g = table(4);
    const first = add(g, "love", "hand", "b");
    const second = add(g, "wrath", "hand", "c");
    g = play(g, "suspicion");
    g = choose(g, ["b", "c", "d"]); // D has no cards and must be skipped.
    g = choose(g, [first]);
    expect(g.prompt!.actor).toBe("c");
    for (const viewer of ["a", "c", "d"]) {
      const view = publicView(g, viewer);
      expect(view.discard).toEqual([]);
      expect(view.players.find((p) => p.id === "b")!.handCount).toBe(1);
      expect(JSON.stringify(view)).not.toContain("Love");
      if (view.prompt) expect(view.prompt).not.toHaveProperty("task");
    }
    g = choose(JSON.parse(JSON.stringify(g)), [second]);
    expect(g.prompt).toBeUndefined();
    expect(g.discard).toEqual([first, second]);
    expect(g.discardedRound).toBe(1);
  });

  it("Encouragement stops tracking a mood after it leaves play and is replayed", () => {
    let g = table();
    const target = add(g, "glee", "play", "a");
    g = play(g, "encouragement");
    g = choose(g, [target]);
    expect(value(g, find(g, "glee"))).toBe(6);
    g = extra(g, "fear");
    g = choose(g, [target]);
    g = act(g, "a", { type: "play", card: target, grant: g.grants[0].id });
    g = finish(g);
    expect(value(g, find(g, "glee"))).toBe(0);
    expect(find(g, "encouragement").zone).toBe("play");
  });

  it("previews stop before a drawn hidden card can appear in a later choice", () => {
    const g = table();
    add(g, "duplicity");
    const known = add(g, "apathy", "hand");
    const secret = add(g, "love", "deck", "");
    const zeal = add(g, "zeal", "hand");
    const first = previewPlay(g, "a", zeal, "base", []);
    const choices = [{ title: first.prompt!.title, selected: [known] }];
    const afterDraw = previewPlay(g, "a", zeal, "base", choices);
    expect(afterDraw.prompt).toBeUndefined();
    expect(afterDraw.done).toBe(true);
    // Even a forged extra plan cannot inspect the deck by repeating Zeal.
    const malicious = previewPlay(g, "a", zeal, "base", [
      ...choices,
      { title: "Duplicity · Repeat Zeal’s entry effect?", selected: ["yes"] },
    ]);
    expect(malicious.applied).toBe(1);
    expect(JSON.stringify(malicious)).not.toContain(secret);
    expect(JSON.stringify(malicious)).not.toContain("Love");
    expect(find(g, "love").zone).toBe("deck");
  });
});

describe("Awe: no scoring is an effect, not a zero-point tie", () => {
  it("skips every scoring bonus, Corruption, loser draws, and Hurt Feelings", () => {
    let g = table(4);
    for (const def of ["bliss", "exhilaration", "enthusiasm", "passion"])
      add(g, def, "play", "a", { chosenColor: "green" });
    add(g, "love", "deck", "");
    g.players[0].wins = 2;
    g = play(g, "corruption");
    g = choose(g, ["wins"]);
    g = extra(g, "awe");
    g = choose(g, ["c"]);
    // Removing Awe does not revoke an already-resolved entry effect.
    g = extra(g, "panic");
    g = choose(g, [find(g, "awe").uid]);
    const beforeHands = g.players.map((p) => hand(g, p.id).length);
    g = finish(g);
    expect(g.lastRound).toMatchObject({
      round: 1,
      scores: {},
      nextFirst: "c",
      skippedBy: "awe",
    });
    expect(g.lastRound!.winner).toBeUndefined();
    expect(g.lastRound!.hurtFeelings).toBeUndefined();
    expect(g.players.map((p) => p.wins)).toEqual([2, 0, 0, 0]);
    expect(g.players.map((p) => hand(g, p.id).length)).toEqual(beforeHands);
    expect(g.deck).toHaveLength(1);
    expect(g.order).toEqual(["c", "d", "a", "b"]);
    expect(g.roundAward).toBe(1);
    expect(g.noScoring).toBe(false);
  });

  it.each([
    "bashfulness",
    "betrayal",
    "gluttony",
    "insecurity",
    "recklessness",
    "sneakiness",
  ])(
    "Awe skips %s's round-only after-scoring effect, which does not fire next round",
    (def) => {
      let g = table();
      const own = add(g, "apathy");
      const opponent = add(g, "boredom", "play", "b");
      g = play(g, def);
      if (def === "betrayal") {
        g = choose(g, [own]);
        g = choose(g, ["b"]);
      }
      if (def === "recklessness") g = choose(g, [opponent]);
      if (def === "sneakiness") g = choose(g, ["b"]);
      if (["gluttony", "insecurity"].includes(def)) g = play(g, "indifference");
      g = extra(g, "awe");
      g = choose(g, ["a"]);
      const before = g.cards
        .filter((c) => c.zone === "play")
        .map((c) => [c.uid, c.owner]);
      g = finish(g);
      expect(
        g.cards.filter((c) => c.zone === "play").map((c) => [c.uid, c.owner]),
      ).toEqual(before);
      expect(g.delayed).toEqual([]);
      g = finish(g);
      expect(g.lastRound!.winner).toBeDefined();
      if (def === "betrayal") expect(find(g, "apathy").owner).toBe("b");
      if (def === "recklessness") {
        expect(find(g, "boredom").owner).toBe("a");
        expect(find(g, "recklessness").zone).not.toBe("play");
      }
      if (["gluttony", "insecurity"].includes(def))
        expect(find(g, "indifference").zone).toBe("play");
      if (def === "bashfulness")
        expect(find(g, "bashfulness").zone).toBe("play");
      if (def === "sneakiness") expect(g.lastRound!.winner).toBe("a");
    },
  );

  it("Awe expires round suppression but preserves next-turn extra plays", () => {
    let g = table(3);
    const target = add(g, "apathy", "play", "b");
    g = play(g, "scorn");
    g = choose(g, [target]);
    g = settle(extra(g, "joy"));
    g = extra(g, "awe");
    if (g.prompt!.title.startsWith("Scorn")) g = choose(g, []);
    g = choose(g, ["a"]);
    g = finish(g);
    expect(value(g, find(g, "apathy"))).toBe(4);
    expect(g.grants.map((x) => x.label)).toContain("Joy");
    expect(g.grants.map((x) => x.label)).not.toContain("Hurt Feelings");
  });
});

describe("catalog audit: additional outcome and boundary coverage", () => {
  it.each([
    ["apathy", "black"],
    ["boredom", "red"],
    ["complacency", "white"],
    ["indifference", "blue"],
    ["laziness", "green"],
  ])("%s is a blank four-point mood", (def, col) => {
    const g = play(table(), def);
    expect(value(g, find(g, def))).toBe(4);
    expect(color(g, find(g, def))).toBe(col);
    expect(g.grants).toHaveLength(0);
    expect(g.prompt).toBeUndefined();
  });

  it.each([
    ["animosity", 3, 5],
    ["celebration", 3, 7],
    ["determination", 3, 6],
    ["fondness", 0, 7],
    ["happiness", 2, 8],
    ["misery", 2, 8],
    ["serenity", 3, 6],
    ["tranquility", 3, 6],
    ["superiority", 3, 7],
    ["vulnerability", 1, 7],
  ] as const)(
    "%s responds to both sides of its condition",
    (def, low, high) => {
      const g = table(3);
      add(g, def);
      switch (def) {
        case "animosity":
          add(g, "apathy", "hand", "b");
          add(g, "boredom", "hand", "b");
          expect(value(g, find(g, def))).toBe(low);
          add(g, "love", "hand", "b");
          break;
        case "celebration":
          add(g, "apathy", "play", "b");
          expect(value(g, find(g, def))).toBe(low);
          add(g, "boredom");
          break;
        case "determination":
          add(g, "laziness", "play", "b");
          expect(value(g, find(g, def))).toBe(low);
          add(g, "love", "play", "c");
          break;
        case "fondness":
          for (const p of ["a", "b", "c"])
            while (inPlay(g, p).length < 3) add(g, "apathy", "play", p);
          find(g, "apathy").zone = "hand";
          expect(value(g, find(g, def))).toBe(low);
          find(g, "apathy").zone = "play";
          break;
        case "happiness": {
          add(g, "boredom", "play", "b");
          const white = add(g, "complacency", "play", "c");
          expect(value(g, find(g, def))).toBe(low);
          g.cards.find((c) => c.uid === white)!.owner = "b";
          break;
        }
        case "misery":
          add(g, "apathy", "discard", "");
          expect(value(g, find(g, def))).toBe(low);
          add(g, "sadness", "discard", "");
          break;
        case "serenity":
          expect(value(g, find(g, def))).toBe(low);
          add(g, "apathy");
          break;
        case "tranquility":
          add(g, "apathy");
          expect(value(g, find(g, def))).toBe(low);
          add(g, "boredom");
          break;
        case "superiority":
          add(g, "apathy", "play", "b");
          expect(value(g, find(g, def))).toBe(low);
          add(g, "boredom");
          break;
        case "vulnerability":
          g.discardedRound = 0;
          expect(value(g, find(g, def))).toBe(low);
          g.discardedRound = 1;
          break;
      }
      expect(value(g, find(g, def))).toBe(high);
    },
  );

  it.each([
    ["cheer", "apathy", "charity"],
    ["delight", "pride", "apathy"],
    ["dignity", "charity", "apathy"],
    ["embarrassment", "apathy", "charity"],
  ])(
    "%s uses only the printed top-right die for its optional discard",
    (def, valid, invalid) => {
      let g = table();
      const yes = add(g, valid, "hand"),
        no = add(g, invalid, "hand");
      g = play(g, def);
      expect(g.prompt!.options.map((o) => o.id)).toContain(yes);
      expect(g.prompt!.options.map((o) => o.id)).not.toContain(no);
      expect(value(choose(g, []), find(g, def))).toBe(3);
      g = choose(g, [yes]);
      expect(value(g, find(g, def))).toBe(5);
      expect(g.discard).toContain(yes);
    },
  );

  it.each([
    ["anxiety", "pride", "hand"],
    ["courage", "self-loathing", "discard"],
    ["shock", "charity", "discard"],
    ["spite", "apathy", "discard"],
    ["panic", "apathy", "hand"],
    ["pacifism", "apathy", "suppress"],
  ])(
    "%s affects at most one qualifying mood per player",
    (def, target, dest) => {
      let g = table(3);
      const x = add(g, target, "play", "b"),
        y = add(g, target, "play", "b"),
        z = add(g, target, "play", "c");
      g = play(g, def);
      expect(() => choose(g, [x, y])).toThrow("at most one mood per player");
      g = choose(g, [x, z]);
      for (const uid of [x, z]) {
        const mood = g.cards.find((c) => c.uid === uid)!;
        if (dest === "suppress") expect(value(g, mood)).toBe(0);
        else expect(mood.zone).toBe(dest);
      }
      expect(g.cards.find((c) => c.uid === y)!.zone).toBe("play");
    },
  );

  it.each([
    ["contempt", "laziness", "complacency", "discard"],
    ["hesitation", "boredom", "laziness", "hand"],
    ["guilt", "apathy", "boredom", "suppress"],
  ])(
    "%s offers skip, one matching mood, or all matching moods",
    (def, first, second, dest) => {
      let g = table();
      const x = add(g, first),
        y = add(g, second, "play", "b"),
        other = add(g, "indifference", "play", "b");
      g = play(g, def);
      expect(inPlay(choose(g, [])).length).toBe(4);
      const one = choose(choose(g, ["one"]), [x]);
      expect(one.cards.find((c) => c.uid === y)!.zone).toBe("play");
      const all = choose(g, ["all"]);
      for (const uid of [x, y]) {
        const c = all.cards.find((c) => c.uid === uid)!;
        if (dest === "suppress") expect(value(all, c)).toBe(0);
        else expect(c.zone).toBe(dest);
      }
      expect(
        value(
          all,
          all.cards.find((c) => c.uid === other)!,
        ),
      ).toBe(4);
    },
  );

  it.each(["faith", "shame"])(
    "%s checks printed hand color under Imagination",
    (def) => {
      let g = table();
      add(g, "imagination", "play", "b", { chosenColor: "white" });
      const white = add(g, "complacency", "hand"),
        blue = add(g, "indifference", "hand");
      const target = add(g, "love", "play", "b");
      g = play(g, def);
      if (def === "faith") {
        expect(g.prompt!.options.map((o) => o.id)).not.toContain(white);
        g = choose(g, [blue]);
        g = choose(g, [target]);
      } else g = choose(g, [white]);
      expect(value(g, find(g, "love"))).toBe(0);
      expect(value(g, find(g, def))).toBe(3);
    },
  );

  it.each(["cruelty", "indecisiveness"])(
    "%s only randomizes opponents with at least two moods",
    (def) => {
      let g = table(3);
      add(g, "apathy");
      add(g, "boredom");
      add(g, "love", "play", "b");
      add(g, "apathy", "play", "c");
      add(g, "boredom", "play", "c");
      g = play(g, def);
      expect(g.prompt!.options.map((o) => o.id)).toEqual(["c"]);
      g = choose(g, ["c"]);
      expect(inPlay(g, "c")).toHaveLength(1);
      expect(inPlay(g, "b")).toHaveLength(1);
      if (def === "cruelty") expect(g.discard).toHaveLength(1);
      else expect(hand(g, "c")).toHaveLength(1);
    },
  );

  it.each(["disorientation", "repentance", "rebellion"])(
    "%s snapshots current values and excludes itself",
    (def) => {
      let g = table();
      const zero = add(g, "enthusiasm", "play", "b");
      const suppressed = add(g, "apathy", "play", "b");
      g.suppressions.push({ target: suppressed, round: 1 });
      g = play(g, def);
      g = choose(g, ["0"]);
      expect(find(g, def).zone).toBe("play");
      if (def === "repentance")
        expect(g.suppressions.some((s) => s.target === zero)).toBe(true);
      else
        for (const uid of [zero, suppressed])
          expect(g.cards.find((c) => c.uid === uid)!.zone).toBe(
            def === "rebellion" ? "discard" : "hand",
          );
    },
  );

  it("Meekness suppresses the entry snapshot, not later high-value moods", () => {
    let g = table();
    const high = add(g, "self-loathing", "play", "b");
    g = play(g, "meekness");
    expect(value(g, find(g, "self-loathing"))).toBe(0);
    g = extra(g, "generosity");
    g = choose(g, ["b"]);
    expect(value(g, find(g, "generosity"))).toBe(6);
    g = extra(g, "panic");
    g = choose(g, [find(g, "meekness").uid]);
    expect(
      value(
        g,
        g.cards.find((c) => c.uid === high)!,
      ),
    ).toBe(6);
  });

  it("Stubbornness keeps its start-of-turn permission after leaving play", () => {
    let g = table();
    add(g, "stubbornness", "play", "b");
    add(g, "apathy");
    add(g, "boredom");
    g = pass(g);
    const stubborn = g.grants.find((x) => x.label === "Stubbornness")!;
    g = play(g, "fear");
    g = choose(g, [find(g, "stubbornness").uid]);
    const uid = add(g, "love", "hand", "b");
    expect(
      canPlay(
        g,
        "b",
        g.cards.find((c) => c.uid === uid)!,
        stubborn,
      ),
    ).toBe(true);
  });

  it("Generosity applies on the recipient's very next turn; Joy waits for its actor", () => {
    let g = table(3);
    g = play(g, "generosity");
    g = choose(g, ["c"]);
    g = extra(g, "joy");
    g = pass(g);
    expect(g.grants.map((x) => x.label)).toEqual(["Your turn"]);
    g = pass(g);
    expect(g.grants.map((x) => x.label)).toContain("Generosity");
    g = finish(g);
    expect(g.order[0]).toBe("a");
    expect(g.grants.map((x) => x.label)).toContain("Joy");
    expect(g.grants.map((x) => x.label)).not.toContain("Generosity");
  });

  it.each(["harmony", "grief", "grace"])(
    "%s grants discard plays with its own restrictions",
    (def) => {
      let g = table();
      const white = add(g, "complacency", "discard", ""),
        black = add(g, "apathy", "discard", "");
      add(g, "complacency");
      add(g, "complacency", "hand");
      g = play(g, def);
      expect(g.grants).toHaveLength(def === "grief" ? 2 : 1);
      const view = publicView(g, "a");
      expect(view.playable[white]).toBeDefined();
      expect(!!view.playable[black]).toBe(def !== "grace");
      expect(view.hand.every((c) => !view.playable[c.uid])).toBe(true);
    },
  );

  it.each(["fear", "nostalgia"])(
    "%s grants its extra play even when the first optional effect is skipped",
    (def) => {
      let g = table();
      add(g, "apathy", def === "fear" ? "play" : "discard");
      g = choose(play(g, def), []);
      expect(g.grants).toHaveLength(1);
      expect(g.grants[0].source).toBe("hand");
    },
  );

  it("Passion and Enthusiasm add scores without changing the moods' values", () => {
    let g = table();
    const mine = add(g, "apathy"),
      theirs = add(g, "self-loathing", "play", "b");
    add(g, "enthusiasm");
    add(g, "passion");
    add(g, "exhilaration");
    expect(baseScores(g).a).toBe(8);
    g = pass(pass(g));
    g = choose(g, [mine]);
    g = choose(g, [theirs]);
    expect(g.lastRound!.scores).toEqual({ a: 18, b: 6 });
    expect(value(g, find(g, "passion"))).toBe(0);
    expect(value(g, find(g, "enthusiasm"))).toBe(0);
  });

  it.each(["condescension", "fascination"])(
    "%s needs a real gift before its value changes",
    (def) => {
      let g = table();
      const blue = add(g, "indifference", "hand"),
        red = add(g, "boredom", "hand");
      g = play(g, def);
      expect(g.prompt!.options.map((o) => o.id).includes(red)).toBe(
        def !== "fascination",
      );
      expect(value(choose(g, []), find(g, def))).toBe(3);
      g = choose(g, [blue]);
      g = choose(g, ["b"]);
      expect(hand(g, "b").map((c) => c.uid)).toEqual([blue]);
      expect(value(g, find(g, def))).toBe(def === "fascination" ? 7 : 6);
    },
  );

  it("Arrogance's victim chooses the mood; moving Arrogance does not return it until it leaves play", () => {
    let g = table(3);
    const target = add(g, "complacency", "play", "b");
    add(g, "apathy", "play", "b");
    g = play(g, "arrogance");
    g = choose(g, ["b"]);
    expect(g.prompt!.actor).toBe("b");
    expect(g.prompt!.options.map((o) => o.id)).toEqual([target]);
    g = choose(g, [target]);
    const source = find(g, "arrogance").uid;
    g = extra(g, "betrayal");
    g = choose(g, [source]);
    g = choose(g, ["c"]);
    expect(find(g, "complacency").owner).toBe("a");
    g = extra(g, "panic");
    g = choose(g, [source]);
    expect(find(g, "complacency").owner).toBe("b");
  });

  it("Avoidance waits for all choices and preserves transferred properties", () => {
    let g = table(3);
    const target = add(g, "curiosity", "play", "b", { chosenValue: 6 });
    g.suppressions.push({ target, round: 1 });
    g = play(g, "avoidance");
    g = choose(g, ["left"]);
    const source = find(g, "avoidance").uid;
    g = choose(g, [source]);
    expect(find(g, "avoidance").owner).toBe("a");
    g = choose(g, [target]); // C has no mood to pass.
    expect(find(g, "avoidance").owner).toBe("b");
    expect(find(g, "curiosity").owner).toBe("c");
    expect(find(g, "curiosity").chosenValue).toBe(6);
    expect(value(g, find(g, "curiosity"))).toBe(0);
    expect(g.grants).toHaveLength(0);
  });

  it("Chaos preserves card identities and distributes starting with its player", () => {
    let g = table(3);
    add(g, "curiosity", "play", "b", { chosenValue: 6 });
    add(g, "charity", "play", "b");
    add(g, "apathy", "play", "c");
    g = play(g, "chaos");
    expect(g.players.map((p) => inPlay(g, p.id).length)).toEqual([2, 1, 1]);
    expect(find(g, "curiosity").chosenValue).toBe(6);
    expect(g.grants).toHaveLength(0);
    expect(g.discard).toEqual([]);
  });

  it("Disillusionment waits for colors, then removes the entire color snapshot", () => {
    let g = table(3);
    add(g, "imagination", "play", "b", { chosenColor: "blue" });
    add(g, "apathy", "play", "b");
    add(g, "love", "play", "c");
    g = play(g, "disillusionment");
    expect(g.prompt!.actor).toBe("b");
    g = choose(g, ["blue"]);
    expect(g.discard).toEqual([]);
    expect(g.prompt!.actor).toBe("c");
    g = choose(g, []);
    expect(g.discard).toEqual([]);
    expect(g.prompt!.actor).toBe("a");
    g = choose(g, []);
    expect(inPlay(g).map((c) => c.def)).toEqual(["disillusionment"]);
    expect(g.discard).toHaveLength(3);
  });

  it("the latest Imagination wins; removing it restores the earlier color", () => {
    let g = table();
    const first = add(g, "imagination", "play", "b", { chosenColor: "red" });
    g = play(g, "creativity");
    g = choose(g, [first]);
    g = choose(g, ["green"]);
    expect(color(g, find(g, "imagination"))).toBe("green");
    g = extra(g, "panic");
    g = choose(g, [find(g, "creativity").uid]);
    expect(color(g, find(g, "imagination"))).toBe("red");
    expect(color(g, find(g, "creativity"))).toBe("blue");
  });

  it.each([
    ["apathy", false],
    ["pride", true],
  ] as const)(
    "Validation sees Creativity as its copied %s, not its original zero",
    (def, triggers) => {
      let g = table();
      add(g, "validation");
      const target = add(g, def, "play", "b");
      g = play(g, "creativity");
      g = choose(g, [target]);
      g = settle(g);
      expect(g.grants.some((x) => x.label === "Validation")).toBe(triggers);
    },
  );

  it("Scorn uses the played color before an entry effect removes Imagination", () => {
    let g = table();
    add(g, "scorn");
    const imagination = add(g, "imagination", "play", "b", {
      chosenColor: "white",
    });
    const red = add(g, "boredom", "play", "b");
    g = play(g, "hate");
    expect(g.prompt!.title).toMatch(/^Scorn/);
    expect(g.prompt!.options.map((o) => o.id)).toContain(red);
    g = choose(g, [red]);
    g = choose(g, [imagination]);
    expect(color(g, find(g, "boredom"))).toBe("red");
    expect(value(g, find(g, "boredom"))).toBe(0);
  });

  it.each(["thrill", "neurosis"])(
    "%s returns every selected mood before anything else is played",
    (def) => {
      let g = table();
      const moods = Array.from({ length: 15 }, () => add(g, "apathy"));
      g = play(g, def);
      g = choose(g, moods);
      expect(hand(g, "a").map((c) => c.uid)).toEqual(moods);
      expect(inPlay(g, "a").map((c) => c.def)).toEqual([def]);
      expect(g.grants).toHaveLength(def === "thrill" ? 15 : 0);
    },
  );

  it("Infatuation requires exactly two other moods to reach nine", () => {
    let g = table();
    const x = add(g, "apathy"),
      y = add(g, "boredom");
    g = play(g, "infatuation");
    expect(() => choose(g, [x])).toThrow();
    g = choose(g, [x, y]);
    expect(value(g, find(g, "infatuation"))).toBe(9);
    expect(g.discard).toEqual([x, y]);
  });

  it("Worry recalculates the remaining moods after returning its first mood", () => {
    let g = table();
    const white = add(g, "complacency");
    add(g, "disgust", "play", "b");
    add(g, "laziness", "play", "b");
    g = play(g, "worry");
    expect(value(g, find(g, "disgust"))).toBe(3);
    g = choose(g, [white]);
    expect(value(g, find(g, "disgust"))).toBe(6);
    expect(g.prompt).toBeUndefined(); // No remaining eligible targets.
    expect(find(g, "disgust").zone).toBe("play");
  });

  it.each(["paranoia", "conviction", "hate", "zeal"])(
    "%s can draw the card just placed beneath an empty deck",
    (def) => {
      let g = table();
      const uid = add(
        g,
        "love",
        def === "paranoia" || def === "zeal" ? "hand" : "play",
        def === "zeal" ? "a" : "b",
      );
      g = play(g, def);
      g = choose(g, [def === "paranoia" ? "b" : uid]);
      expect(find(g, "love").zone).toBe("hand");
      expect(find(g, "love").owner).toBe(def === "conviction" ? "b" : "a");
      expect(g.deck).toEqual([]);
    },
  );

  it("a stolen Bashfulness can resolve before Recklessness returns it, as in the extended-rules example", () => {
    let g = table();
    g = play(g, "bashfulness");
    const bashful = find(g, "bashfulness").uid;
    g = pass(g);
    add(g, "love", "play", "b");
    g = play(g, "recklessness");
    g = choose(g, [bashful]);
    // The thief has both moods at scoring and chooses Bashfulness first.
    g = pass(g);
    expect(g.prompt!.actor).toBe("b");
    const effect = g.prompt!.options.find((o) =>
      o.label.includes("bashfulness"),
    )!;
    expect(effect).toBeDefined();
    g = choose(g, [effect.id]);
    expect(find(g, "bashfulness").zone).toBe("hand");
    expect(find(g, "bashfulness").owner).toBe("b");
    g = settle(g);
    expect(g.lastRound!.winner).toBe("b");
  });

  it("Sneakiness can change who wins the match before the three-win check", () => {
    let g = table();
    add(g, "love", "play", "b");
    add(g, "apathy", "play", "b");
    g.players[0].wins = 2;
    g = play(g, "sneakiness");
    g = choose(g, ["b"]);
    g = finish(g);
    expect(g.lastRound!.scores).toEqual({ a: 8, b: 5 });
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("a");
  });
});
