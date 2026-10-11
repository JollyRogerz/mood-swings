import { expect, it } from "vitest";
import {
  clearRecentTables,
  forgetTable,
  readRecentTables,
  rememberTable,
} from "../src/client/recent-tables";

it("keeps only valid room codes and handles damaged or blocked local storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  storage.setItem(
    "mood-recent-tables-v1",
    JSON.stringify([
      "ABCD2345",
      "https://example.com/private",
      "ABCD2345",
      "bad code",
      "WXYZ6789",
    ]),
  );
  expect(readRecentTables(storage)).toEqual(["ABCD2345", "WXYZ6789"]);
  expect(rememberTable(storage, "WXYZ6789")).toEqual(["WXYZ6789", "ABCD2345"]);
  expect(rememberTable(storage, "not-valid")).toEqual(["WXYZ6789", "ABCD2345"]);
  expect(forgetTable(storage, "WXYZ6789")).toEqual(["ABCD2345"]);
  clearRecentTables(storage);
  expect(readRecentTables(storage)).toEqual([]);

  storage.setItem("mood-recent-tables-v1", "not json");
  expect(readRecentTables(storage)).toEqual([]);
  const blocked = {
    getItem: () => {
      throw new Error("storage blocked");
    },
    setItem: () => {
      throw new Error("storage blocked");
    },
    removeItem: () => {
      throw new Error("storage blocked");
    },
  };
  expect(readRecentTables(blocked)).toEqual([]);
  expect(rememberTable(blocked, "ABCD2345")).toEqual(["ABCD2345"]);
  expect(() => clearRecentTables(blocked)).not.toThrow();
});
