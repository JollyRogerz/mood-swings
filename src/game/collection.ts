import { catalog, definitions, COLORS } from "./catalog";
export interface Deck {
  id: string;
  name: string;
  cards: string[];
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
}
export interface Collection {
  decks: Deck[];
  public: boolean;
}
export function cleanDeck(input: unknown): { name: string; cards: string[] } {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value.name !== "string" || !Array.isArray(value.cards))
    throw new Error("Give your deck a name and select its cards.");
  const name = value.name
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name || name.length > 60)
    throw new Error("Use a deck name between 1 and 60 characters.");
  if (value.cards.length > 45)
    throw new Error("A deck can hold up to 45 unique moods.");
  if (
    value.cards.some(
      (id) => typeof id !== "string" || !Object.hasOwn(definitions, id),
    )
  )
    throw new Error("Choose cards from the Mood Swings catalog.");
  const cards = value.cards as string[];
  if (new Set(cards).size !== cards.length)
    throw new Error("Each mood can appear once in a deck.");
  return { name, cards: [...cards].sort() };
}
export function retailShaped(cards: string[]) {
  const counts = Object.fromEntries(
    ["common", "uncommon", "rare", "mythic rare"].map((r) => [
      r,
      cards.filter((id) => definitions[id]?.rarity === r).length,
    ]),
  );
  return (
    cards.length === 45 &&
    counts.common === 23 &&
    counts.uncommon === 14 &&
    counts.rare === 6 &&
    counts["mythic rare"] === 2
  );
}
export function completion(decks: Pick<Deck, "cards">[]) {
  const quantities: Record<string, number> = {};
  for (const deck of decks)
    for (const id of new Set(deck.cards))
      if (definitions[id]) quantities[id] = (quantities[id] ?? 0) + 1;
  const count = (cards: typeof catalog) => ({
    owned: cards.filter((c) => quantities[c.id]).length,
    total: cards.length,
  });
  return {
    ...count(catalog),
    quantities,
    colors: Object.fromEntries(
      COLORS.map((color) => [
        color,
        count(catalog.filter((c) => c.color === color)),
      ]),
    ),
    rarities: Object.fromEntries(
      ["common", "uncommon", "rare", "mythic rare"].map((rarity) => [
        rarity,
        count(catalog.filter((c) => c.rarity === rarity)),
      ]),
    ),
  };
}
