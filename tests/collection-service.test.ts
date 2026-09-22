import { afterEach, it, expect } from "vitest";
import { createAccounts } from "../src/server/auth";
import {
  configureCollections,
  hostDeck,
  publicOwnership,
  decorateCollection,
} from "../src/server/collection-service";
import { table, add } from "./helpers";
import { publicView } from "../src/game/engine";
afterEach(() => configureCollections(undefined));
it("loads only the host's saved deck and hides private ownership", async () => {
  const accounts = (await createAccounts({ MOOD_ACCOUNTS: "memory" }))!;
  configureCollections(accounts);
  await accounts.store.setUsername("alice", "Alice");
  await accounts.store.link("a", "alice");
  const deck = await accounts.collection.save("alice", {
    name: "Owned",
    cards: ["love"],
  });
  expect((await hostDeck("a", deck.id)).cards).toEqual(["love"]);
  await expect(hostDeck("b", deck.id)).rejects.toThrow("no longer available");
  const g = table();
  add(g, "love", "play", "a");
  expect((await publicOwnership(g)).size).toBe(0);
  await accounts.collection.privacy("alice", true);
  const owned = await publicOwnership(g);
  expect(owned.get("a")?.has("love")).toBe(true);
  g.customDeck = (await hostDeck("a", deck.id)).info;
  const host = decorateCollection(publicView(g, "a"), g, owned),
    guest = decorateCollection(publicView(g, "b"), g, owned);
  expect(host.customDeck?.id).toBe(deck.id);
  expect(guest.customDeck?.id).toBeUndefined();
  expect(guest.moods[0].owned).toBe(true);
  expect(guest).not.toHaveProperty("owned");
  await accounts.collection.privacy("alice", false);
  expect(
    decorateCollection(publicView(g, "b"), g, await publicOwnership(g)).moods[0]
      .owned,
  ).toBe(false);
});
