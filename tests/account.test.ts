import { describe, expect, it } from "vitest";
import { cleanUsername, usernameKey } from "../src/game/account";
describe("usernames", () => {
  it("trims and keeps the case the player chose", () => {
    expect(cleanUsername("  Ruben_M-1 ")).toBe("Ruben_M-1");
  });
  it("compares without case", () => {
    expect(usernameKey("Ruben")).toBe(usernameKey("rUBEN"));
  });
  it.each([
    ["ab"],
    ["a".repeat(21)],
    ["two words"],
    ["smile😀"],
    [""],
    [42],
    [null],
  ])("rejects %j", (raw) => expect(() => cleanUsername(raw)).toThrow());
  it("accepts the shortest and longest names", () => {
    expect(cleanUsername("abc")).toBe("abc");
    expect(cleanUsername("a".repeat(20))).toHaveLength(20);
  });
});
