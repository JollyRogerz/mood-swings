import raw from "../../data/processed/cards.json";
import type { Definition } from "./types";
export const catalog = raw as unknown as Definition[];
export const definitions = Object.fromEntries(catalog.map((c) => [c.id, c]));
export const COLORS = ["white", "blue", "black", "red", "green"] as const;
