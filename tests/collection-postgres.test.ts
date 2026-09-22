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
  it("deletes photo bytes on review, editing, expiry and account deletion", async () => {
    await accounts.setUsername("photos", "Photos");
    const d = await store.save("photos", {
      name: "Photo deck",
      cards: ["love"],
    });
    await store.attachPhoto("photos", d.id, Buffer.from("test"), d.cards);
    expect((await store.pendingPhotos()).some((p) => p.deckId === d.id)).toBe(
      true,
    );
    expect(await store.reviewPhoto(d.id, true)).toBe(true);
    expect(await store.photo(d.id)).toBeNull();
    expect((await store.get("photos")).decks[0].verifiedAt).toBeTruthy();
    await store.save("photos", { name: "Changed", cards: ["curiosity"] }, d.id);
    expect((await store.get("photos")).decks[0].verifiedAt).toBeNull();
    await store.attachPhoto("photos", d.id, Buffer.from("test"), ["curiosity"]);
    await pool.query(
      "UPDATE mood_deck_photos SET submitted_at=now()-interval '15 days' WHERE deck_id=$1",
      [d.id],
    );
    await store.purgePhotos();
    expect(await store.photo(d.id)).toBeNull();
    await store.attachPhoto("photos", d.id, Buffer.from("test"), ["curiosity"]);
    await accounts.remove("photos");
    expect(await store.photo(d.id)).toBeNull();
  });
});
