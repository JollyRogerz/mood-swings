import { EventEmitter } from "node:events";
import type { Accounts } from "./auth";
import { cleanDeck } from "../game/collection";
import { RuleError } from "../game/engine";
import type { Game, View } from "../game/types";
let accounts: Accounts | undefined;
const changes = new EventEmitter();
changes.setMaxListeners(0);
export const configureCollections = (value: Accounts | undefined) => {
  accounts = value;
};
export const collectionChanged = () => changes.emit("change");
export function watchCollections(callback: () => void) {
  changes.on("change", callback);
  return () => {
    changes.off("change", callback);
  };
}
export async function hostDeck(host: string, id: unknown) {
  if (typeof id !== "string" || id.length > 100 || !accounts)
    throw new RuleError(
      "Choose one of your saved decks, or use the standard deck.",
    );
  const user = await accounts.store.userFor(host);
  const profile = user && (await accounts.store.profile(user));
  const collection = user && (await accounts.collection.get(user));
  const deck = collection && collection.decks.find((d) => d.id === id);
  if (!deck || !profile)
    throw new RuleError(
      "That deck is no longer available. Choose another deck.",
    );
  const value = cleanDeck(deck);
  return {
    cards: value.cards,
    info: {
      id: deck.id,
      name: deck.name,
      username: profile.username,
      count: value.cards.length,
    },
  };
}
export async function publicOwnership(
  game: Game,
): Promise<Map<string, Set<string>>> {
  const owned = new Map<string, Set<string>>();
  if (!accounts) return owned;
  await Promise.all(
    game.players
      .filter((p) => !p.bot)
      .map(async (p) => {
        const user = await accounts!.store.userFor(p.id);
        if (!user) return;
        const c = await accounts!.collection.get(user);
        if (c.public) owned.set(p.id, new Set(c.decks.flatMap((d) => d.cards)));
      }),
  );
  return owned;
}
export function decorateCollection(
  view: View,
  game: Game,
  owned: Map<string, Set<string>>,
): View {
  const chosen = game.customDeck;
  return {
    ...view,
    customDeck: chosen
      ? {
          id: view.you === game.host ? chosen.id : undefined,
          name: chosen.name,
          username: chosen.username,
          count: chosen.count,
        }
      : undefined,
    moods: view.moods.map((c) => ({
      ...c,
      owned: owned.get(c.owner)?.has(c.def) ?? false,
    })),
  };
}
