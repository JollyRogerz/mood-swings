import { describe, it, expect } from "vitest";
import { catalog } from "../src/game/catalog";
import { cleanDeck, completion, retailShaped } from "../src/game/collection";
import { MemoryCollectionStore } from "../src/server/collection";
describe("physical deck collection", () => {
  it("validates unique known moods and a bounded name and deck", () => {
    for (const cards of [
      ["__proto__"],
      ["constructor"],
      ["not-a-card"],
      ["love", "love"],
      catalog.slice(0, 46).map((c) => c.id),
    ])
      expect(() => cleanDeck({ name: "Deck", cards })).toThrow();
    expect(cleanDeck({ name: "  My <deck>  ", cards: ["love"] })).toEqual({
      name: "My deck",
      cards: ["love"],
    });
    expect(() => cleanDeck({ name: " ", cards: [] })).toThrow();
  });
  it("counts unique completion and quantities and recognizes the retail mix", () => {
    const cards = [
      ["common", 23],
      ["uncommon", 14],
      ["rare", 6],
      ["mythic rare", 2],
    ].flatMap(([rarity, n]) =>
      catalog
        .filter((c) => c.rarity === rarity)
        .slice(0, Number(n))
        .map((c) => c.id),
    );
    expect(retailShaped(cards)).toBe(true);
    expect(retailShaped(cards.slice(1))).toBe(false);
    const c = completion([{ cards }, { cards: [cards[0]] }]);
    expect(c.owned).toBe(45);
    expect(c.total).toBe(133);
    expect(c.quantities[cards[0]]).toBe(2);
    expect(Object.values(c.colors).reduce((n, c) => n + c.owned, 0)).toBe(45);
  });
  it("isolates owners, enforces limits and removes collections", async () => {
    const s = new MemoryCollectionStore();
    const d = await s.save("a", { name: "First", cards: ["love"] });
    expect((await s.get("a")).public).toBe(false);
    await expect(
      s.save("b", { name: "Stolen", cards: [] }, d.id),
    ).rejects.toThrow("not found");
    expect(await s.remove("b", d.id)).toBe(false);
    for (let i = 1; i < 10; i++)
      await s.save("a", { name: `Deck ${i}`, cards: [] });
    await expect(s.save("a", { name: "11", cards: [] })).rejects.toThrow(
      "10 decks",
    );
    await s.privacy("a", true);
    expect((await s.get("a")).public).toBe(true);
    await s.erase("a");
    expect((await s.get("a")).decks).toHaveLength(0);
  });
});
