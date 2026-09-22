import { describe, expect, it } from "vitest";
import {
  finishedResult,
  personalStats,
  rankingSeats,
} from "../src/game/results";
import { MemoryResultStore } from "../src/server/results";
import { MemoryAccountStore } from "../src/server/accounts";
import { rematchGame } from "../src/game/seats";
import { configureResults, recordResult } from "../src/server/result-service";
import { table } from "./helpers";
function result(gameNo = 1, won = true) {
  const g = table(3);
  g.status = "finished";
  g.winner = won ? "a" : "b";
  g.gameNo = gameNo;
  g.matchAccounts = { a: "alice", b: "bob", c: null };
  g.players[won ? 0 : 1].wins = 3;
  return finishedResult(g, "TESTABCD", new Date(1_000 * gameNo).toISOString());
}
describe("finished game records", () => {
  it("requires a finished winner and contains no cards or device tokens", () => {
    expect(() =>
      finishedResult(table(), "TESTABCD", new Date().toISOString()),
    ).toThrow();
    const r = result();
    expect(r.ranked).toBe(true);
    expect(r.players[0]).toMatchObject({
      userId: "alice",
      won: true,
      roundWins: 3,
    });
    expect(r).not.toHaveProperty("cards");
    expect(r.players[0]).not.toHaveProperty("id");
  });
  it("uses a fresh counter for rematches and drops previous attribution", () => {
    const g = table();
    g.status = "finished";
    g.winner = "a";
    g.gameNo = 4;
    g.matchAccounts = { a: "alice" };
    const next = rematchGame(g, "a", 9, ["a", "b"]);
    expect(next.gameNo).toBe(5);
    expect(next.matchAccounts).toBeUndefined();
    expect(next.result).toBeUndefined();
  });
  it("counts substitute winners as losses without ranking them", () => {
    const g = table(3);
    g.status = "finished";
    g.winner = "a";
    g.matchAccounts = { a: "alice", b: "bob" };
    g.players[0].bot = "normal";
    g.players[0].substitute = true;
    const r = finishedResult(g, "TESTABCD", new Date().toISOString());
    expect(r.ranked).toBe(true);
    expect(r.humans).toBe(2);
    expect(r.players[0].won).toBe(false);
    expect(rankingSeats(r).map((p) => p.userId)).toEqual(["bob"]);
    expect(personalStats([r], "alice")).toMatchObject({
      games: 1,
      wins: 0,
      losses: 1,
    });
  });
  it("keeps solo bot games personal, not ranked", () => {
    const g = table();
    g.status = "finished";
    g.winner = "a";
    g.matchAccounts = { a: "alice" };
    g.players[1].bot = "fly";
    const r = finishedResult(g, "TESTABCD", new Date().toISOString());
    expect(r.ranked).toBe(false);
    expect(rankingSeats(r)).toEqual([]);
    expect(personalStats([r], "alice").bots.fly).toEqual({
      games: 1,
      wins: 1,
      losses: 0,
    });
  });
  it("calculates streaks chronologically and does not double-count a profile", () => {
    const rounds = [result(4), result(1), result(3, false), result(2)];
    expect(personalStats(rounds, "alice")).toMatchObject({
      games: 4,
      wins: 3,
      losses: 1,
      winRate: 0.75,
      currentStreak: 1,
      bestStreak: 2,
      roundWins: 9,
    });
    rounds[0].players[1].userId = "alice";
    expect(personalStats(rounds, "alice").games).toBe(4);
    expect(rankingSeats(rounds[0])).toEqual([]);
    rounds[0].players[1].bot = "normal";
    rounds[0].players[1].substituted = true;
    expect(rankingSeats(rounds[0])).toEqual([]);
  });
});
describe("result storage", () => {
  it("retains linked results if the optional account service is unavailable", async () => {
    configureResults(undefined);
    const g = table();
    g.result = result();
    await expect(recordResult(g)).rejects.toThrow("keep the saved result");
    g.result.players.forEach((p) => (p.userId = null));
    await expect(recordResult(g)).resolves.toBeUndefined();
  });

  it("records once, ranks after three games, and anonymizes deleted accounts", async () => {
    const accounts = new MemoryAccountStore();
    await accounts.setUsername("alice", "Alice");
    await accounts.setUsername("bob", "Bob");
    const store = new MemoryResultStore(accounts);
    await Promise.all([store.record(result()), store.record(result())]);
    expect((await store.stats("alice")).games).toBe(1);
    expect(await store.leaderboard()).toEqual([]);
    await store.record(result(2));
    await store.record(result(3, false));
    expect(await store.leaderboard()).toMatchObject([
      { username: "Alice", wins: 2, games: 3 },
      { username: "Bob", wins: 1, games: 3 },
    ]);
    await store.anonymize("alice");
    await accounts.remove("alice");
    await store.record(result());
    expect((await store.stats("alice")).games).toBe(0);
    expect((await store.leaderboard()).map((p) => p.username)).toEqual(["Bob"]);
  });
});
