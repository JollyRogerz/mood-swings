import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { PostgresAccountStore } from "../src/server/accounts";
import { PostgresResultStore } from "../src/server/results";
import { finishedResult } from "../src/game/results";
import { table } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "PostgreSQL result persistence",
  () => {
    let admin: Pool,
      pool: Pool,
      accounts: PostgresAccountStore,
      results: PostgresResultStore;
    const schema = "test_" + randomUUID().replaceAll("-", "");
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c search_path=${schema}`,
      });
      accounts = new PostgresAccountStore(pool);
      results = new PostgresResultStore(pool);
      await accounts.init();
      await results.init();
      await accounts.setUsername("alice", "Alice");
      await accounts.setUsername("bob", "Bob");
    });
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("uses one atomic record per match and separate rematches", async () => {
      const g = table();
      g.status = "finished";
      g.winner = "a";
      g.players[0].wins = 3;
      g.matchAccounts = { a: "alice", b: "bob" };
      const r = finishedResult(g, "PGTESTAB", new Date().toISOString());
      await Promise.all(Array.from({ length: 5 }, () => results.record(r)));
      expect((await results.stats("alice")).games).toBe(1);
      await results.record({ ...r, gameNo: 2 });
      await results.record({ ...r, gameNo: 3 });
      expect(await results.leaderboard()).toMatchObject([
        { username: "Alice", wins: 3, games: 3 },
        { username: "Bob", wins: 0, games: 3 },
      ]);
      const restarted = new PostgresResultStore(pool);
      expect((await restarted.stats("alice")).wins).toBe(3);
      await accounts.remove("alice");
      expect((await results.stats("alice")).games).toBe(0);
      await results.record({ ...r, gameNo: 4 });
      expect((await results.stats("alice")).games).toBe(0);
      expect((await results.stats("bob")).games).toBe(4);
      expect((await results.leaderboard()).map((p) => p.username)).toEqual([
        "Bob",
      ]);
    });
    it("rolls back the parent when a seat insert fails", async () => {
      const g = table();
      g.status = "finished";
      g.winner = "a";
      const r = finishedResult(g, "BROKENAB", new Date().toISOString());
      r.players[1].seat = 0;
      await expect(results.record(r)).rejects.toThrow();
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM mood_results WHERE code='BROKENAB'",
          )
        ).rows[0].n,
      ).toBe(0);
    });
  },
);
