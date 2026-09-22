import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { PostgresAccountStore } from "../src/server/accounts";
import { PostgresCollectionStore } from "../src/server/collection";
describe.skipIf(!process.env.TEST_DATABASE_URL)("Postgres collections", () => {
  let admin: Pool,
    pool: Pool,
    accounts: PostgresAccountStore,
    store: PostgresCollectionStore;
  const schema = "test_" + randomUUID().replaceAll("-", "");
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    accounts = new PostgresAccountStore(pool);
    store = new PostgresCollectionStore(pool);
    await accounts.init();
    await store.init();
    await accounts.setUsername("a", "Alice");
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
  it("serializes the ten-deck limit and persists privacy and account deletion", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        store.save("a", { name: `Deck ${i}`, cards: ["love"] }),
      ),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    const d = (await store.get("a")).decks[0];
    await expect(
      store.save("other", { name: "Stolen", cards: [] }, d.id),
    ).rejects.toThrow();
    await store.privacy("a", true);
    expect((await new PostgresCollectionStore(pool).get("a")).public).toBe(
      true,
    );
    await accounts.remove("a");
    expect((await store.get("a")).decks).toHaveLength(0);
  });
});
