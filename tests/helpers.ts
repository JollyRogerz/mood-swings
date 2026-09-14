import { act, addPlayer, createGame } from "../src/game/engine";
import type { Game, Mood } from "../src/game/types";
export function table(n = 2): Game {
  const g = createGame("a", "Alice", 123);
  for (const id of ["b", "c", "d"].slice(0, n - 1))
    addPlayer(g, id, id.toUpperCase());
  g.status = "playing";
  g.order = g.players.map((p) => p.id);
  g.round = 1;
  g.turn = 1;
  g.grants = [{ id: "base", label: "Your turn", source: "hand" }];
  return g;
}
export function add(
  g: Game,
  def: string,
  zone: Mood["zone"] = "play",
  owner = "a",
  extra: Partial<Mood> = {},
): string {
  const uid = `test${g.cards.length + 1}`;
  g.cards.push({
    uid,
    def,
    zone,
    owner,
    entered: 0,
    serial: ++g.serial,
    ...extra,
  });
  if (zone === "deck") g.deck.push(uid);
  if (zone === "discard") g.discard.push(uid);
  return uid;
}
export function play(g: Game, def: string, grant = g.grants[0]?.id): Game {
  const id = add(g, def, "hand", g.order[g.turnIndex]);
  return act(g, g.order[g.turnIndex], { type: "play", card: id, grant });
}
export function choose(g: Game, ids: string[] = []): Game {
  if (!g.prompt) throw new Error("No prompt");
  return act(g, g.prompt.actor, {
    type: "choose",
    prompt: g.prompt.id,
    selected: ids,
  });
}
export function find(g: Game, def: string) {
  return g.cards.find((c) => c.def === def)!;
}
export function pass(g: Game) {
  return act(g, g.order[g.turnIndex], { type: "pass" });
}
export function settle(g: Game): Game {
  let count = 0;
  while (g.prompt) {
    if (count++ > 100) throw new Error("Prompt loop");
    const q = g.prompt;
    g = choose(g, q.min ? q.options.slice(0, q.min).map((o) => o.id) : []);
  }
  return g;
}
