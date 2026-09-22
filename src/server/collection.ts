import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { cleanDeck, type Collection, type Deck } from "../game/collection";
export class CollectionError extends Error {}
export interface CollectionStore {
  init(): Promise<void>;
  get(userId: string): Promise<Collection>;
  save(userId: string, input: unknown, id?: string): Promise<Deck>;
  remove(userId: string, id: string): Promise<boolean>;
  privacy(userId: string, visible: boolean): Promise<void>;
  erase(userId: string): Promise<void>;
}
export class MemoryCollectionStore implements CollectionStore {
  private collections = new Map<string, Collection>();
  async init() {}
  async get(userId: string) {
    return structuredClone(
      this.collections.get(userId) ?? { decks: [], public: false },
    );
  }
  async save(userId: string, input: unknown, id?: string) {
    const value = cleanDeck(input);
    const collection = this.collections.get(userId) ?? {
      decks: [],
      public: false,
    };
    const old = id ? collection.decks.find((d) => d.id === id) : undefined;
    if (id && !old) throw new CollectionError("Deck not found.");
    if (!old && collection.decks.length >= 10)
      throw new CollectionError("You can save up to 10 decks.");
    const now = new Date().toISOString();
    const deck: Deck = {
      ...value,
      id: old?.id ?? randomUUID(),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      verifiedAt:
        old && JSON.stringify(old.cards) === JSON.stringify(value.cards)
          ? old.verifiedAt
          : null,
    };
    collection.decks = [
      ...collection.decks.filter((d) => d.id !== deck.id),
      deck,
    ];
    this.collections.set(userId, collection);
    return structuredClone(deck);
  }
  async remove(userId: string, id: string) {
    const c = this.collections.get(userId),
      index = c?.decks.findIndex((d) => d.id === id) ?? -1;
    if (!c || index < 0) return false;
    c.decks.splice(index, 1);
    return true;
  }
  async privacy(userId: string, visible: boolean) {
    const c = this.collections.get(userId) ?? { decks: [], public: false };
    c.public = visible;
    this.collections.set(userId, c);
  }
  async erase(userId: string) {
    this.collections.delete(userId);
  }
}
const deckFrom = (r: any): Deck => ({
  id: r.id,
  name: r.name,
  cards: r.cards,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
});
export class PostgresCollectionStore implements CollectionStore {
  constructor(private pool: Pool) {}
  async init() {
    await this.pool.query(
      "ALTER TABLE mood_profiles ADD COLUMN IF NOT EXISTS collection_public boolean NOT NULL DEFAULT false",
    );
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS mood_decks (id text PRIMARY KEY, user_id text NOT NULL REFERENCES mood_profiles(user_id) ON DELETE CASCADE, name text NOT NULL, cards text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz)",
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS mood_decks_owner ON mood_decks(user_id)",
    );
  }
  async get(userId: string): Promise<Collection> {
    const [p, d] = await Promise.all([
      this.pool.query(
        "SELECT collection_public FROM mood_profiles WHERE user_id=$1",
        [userId],
      ),
      this.pool.query(
        "SELECT * FROM mood_decks WHERE user_id=$1 ORDER BY created_at,id",
        [userId],
      ),
    ]);
    return {
      public: p.rows[0]?.collection_public ?? false,
      decks: d.rows.map(deckFrom),
    };
  }
  async save(userId: string, input: unknown, id?: string) {
    const value = cleanDeck(input),
      c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // Serialize edits per profile, including the limit check, across processes.
      const owner = await c.query(
        "SELECT user_id FROM mood_profiles WHERE user_id=$1 FOR UPDATE",
        [userId],
      );
      if (!owner.rowCount)
        throw new CollectionError("Save your profile first.");
      let row;
      if (id) {
        row = (
          await c.query(
            "UPDATE mood_decks SET name=$3, cards=$4, updated_at=now(), verified_at=CASE WHEN cards=$4 THEN verified_at ELSE NULL END WHERE id=$2 AND user_id=$1 RETURNING *",
            [userId, id, value.name, value.cards],
          )
        ).rows[0];
        if (!row) throw new CollectionError("Deck not found.");
      } else {
        const count = await c.query(
          "SELECT count(*)::int AS n FROM mood_decks WHERE user_id=$1",
          [userId],
        );
        if (count.rows[0].n >= 10)
          throw new CollectionError("You can save up to 10 decks.");
        row = (
          await c.query(
            "INSERT INTO mood_decks(id,user_id,name,cards) VALUES($1,$2,$3,$4) RETURNING *",
            [randomUUID(), userId, value.name, value.cards],
          )
        ).rows[0];
      }
      await c.query("COMMIT");
      return deckFrom(row);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async remove(userId: string, id: string) {
    return !!(
      await this.pool.query(
        "DELETE FROM mood_decks WHERE user_id=$1 AND id=$2",
        [userId, id],
      )
    ).rowCount;
  }
  async privacy(userId: string, visible: boolean) {
    await this.pool.query(
      "UPDATE mood_profiles SET collection_public=$2 WHERE user_id=$1",
      [userId, visible],
    );
  }
  async erase(userId: string) {
    await this.pool.query("DELETE FROM mood_decks WHERE user_id=$1", [userId]);
  }
}
