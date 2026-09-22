import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { PostgresStore } from "../src/server/store";
import { table } from "./helpers";
import { finishedResult } from "../src/game/results";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "room snapshot retention",
  () => {
    let admin: Pool, pool: Pool, store: PostgresStore;
    const schema = "test_" + randomUUID().replaceAll("-", "");
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema}`);
      pool = new Pool({ connectionString: url.toString() });
      store = new PostgresStore(url.toString());
      await store.init();
    });
    afterAll(async () => {
      await store?.close();
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("expires inactive snapshots but retains and restores unrecorded results", async () => {
      const g = table();
      await store.save("EXPIREDX", g);
      await store.save("CURRENTX", g);
      g.status = "finished";
      g.winner = "a";
      g.result = finishedResult(g, "PENDINGX", new Date().toISOString());
      await store.save("PENDINGX", g);
      await pool.query(
        "UPDATE mood_games SET updated_at=now()-interval '31 days' WHERE code <> 'CURRENTX'",
      );
      expect(await store.load("EXPIREDX")).toBeNull();
      expect(await store.purgeExpired()).toBe(1);
      expect(await store.load("CURRENTX")).not.toBeNull();
      expect((await store.load("PENDINGX"))?.result).toEqual(g.result);
      // Even with accounts unavailable, the pending result survives cleanup.
      expect(await store.purgeExpired()).toBe(0);
      await pool.query("CREATE TABLE mood_results(code text, game_no int)");
      await pool.query("INSERT INTO mood_results VALUES('PENDINGX',2)");
      expect(await store.purgeExpired()).toBe(0); // Another rematch is insufficient.
      await pool.query("INSERT INTO mood_results VALUES('PENDINGX',1)");
      expect(await store.load("PENDINGX")).toBeNull();
      expect(await store.purgeExpired()).toBe(1);
      expect((await pool.query("SELECT code FROM mood_games")).rows).toEqual([
        { code: "CURRENTX" },
      ]);
    });
    it("preserves malformed result outboxes without unsafe numeric casts", async () => {
      const g = table();
      await store.save("LEGACYXX", g);
      await pool.query(
        `UPDATE mood_games SET state=jsonb_set(state,'{result}','{"code":"LEGACYXX","gameNo":"unknown"}'),updated_at=now()-interval '31 days' WHERE code='LEGACYXX'`,
      );
      expect(await store.purgeExpired()).toBe(0);
      expect(await store.load("LEGACYXX")).not.toBeNull();
    });
  },
);
