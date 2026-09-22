import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { cleanDeck, type Collection, type Deck } from "../game/collection";
export class CollectionError extends Error {}
export interface PendingPhoto {
  deckId: string;
  userId: string;
  name: string;
  submittedAt: string;
}
export interface CollectionStore {
  attachPhoto(
    userId: string,
    id: string,
    data: Buffer,
    cards: string[],
  ): Promise<void>;
  removePhoto(userId: string, id: string): Promise<boolean>;
  pendingPhotos(): Promise<PendingPhoto[]>;
  photo(id: string): Promise<Buffer | null>;
  reviewPhoto(id: string, approve: boolean): Promise<boolean>;
  purgePhotos(): Promise<void>;
  init(): Promise<void>;
  get(userId: string): Promise<Collection>;
  save(userId: string, input: unknown, id?: string): Promise<Deck>;
  remove(userId: string, id: string): Promise<boolean>;
  privacy(userId: string, visible: boolean): Promise<void>;
  erase(userId: string): Promise<void>;
}
export class MemoryCollectionStore implements CollectionStore {
  private collections = new Map<string, Collection>();
  private photos = new Map<string, PendingPhoto & { data: Buffer }>();
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
      photoAt:
        old && JSON.stringify(old.cards) === JSON.stringify(value.cards)
          ? old.photoAt
          : null,
      verifiedAt:
        old && JSON.stringify(old.cards) === JSON.stringify(value.cards)
          ? old.verifiedAt
          : null,
    };
    if (old && JSON.stringify(old.cards) !== JSON.stringify(value.cards))
      this.photos.delete(old.id);
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
    this.photos.delete(id);
    c.decks.splice(index, 1);
    return true;
  }
  async privacy(userId: string, visible: boolean) {
    const c = this.collections.get(userId) ?? { decks: [], public: false };
    c.public = visible;
    this.collections.set(userId, c);
  }
  async attachPhoto(userId: string, id: string, data: Buffer, cards: string[]) {
    const deck = this.collections.get(userId)?.decks.find((d) => d.id === id);
    if (!deck || JSON.stringify(deck.cards) !== JSON.stringify(cards))
      throw new CollectionError(
        "The deck changed. Reload and submit its photo again.",
      );
    deck.photoAt = new Date().toISOString();
    deck.verifiedAt = null;
    this.photos.set(id, {
      deckId: id,
      userId,
      name: deck.name,
      submittedAt: deck.photoAt,
      data,
    });
  }
  async removePhoto(userId: string, id: string) {
    const d = this.collections.get(userId)?.decks.find((d) => d.id === id);
    if (!d) return false;
    this.photos.delete(id);
    d.photoAt = null;
    d.verifiedAt = null;
    return true;
  }
  async purgePhotos() {
    const before = Date.now() - 14 * 86400000;
    for (const [id, p] of this.photos)
      if (Date.parse(p.submittedAt) < before) this.photos.delete(id);
  }
  async pendingPhotos() {
    await this.purgePhotos();
    return [...this.photos.values()].slice(0, 50).map(({ data, ...p }) => p);
  }
  async photo(id: string) {
    await this.purgePhotos();
    return this.photos.get(id)?.data ?? null;
  }
  async reviewPhoto(id: string, approve: boolean) {
    await this.purgePhotos();
    const p = this.photos.get(id);
    if (!p) return false;
    const d = this.collections.get(p.userId)?.decks.find((d) => d.id === id);
    if (!d) return false;
    if (approve) d.verifiedAt = new Date().toISOString();
    else {
      d.verifiedAt = null;
      d.photoAt = null;
    }
    this.photos.delete(id);
    return true;
  }
  async erase(userId: string) {
    for (const [id, p] of this.photos)
      if (p.userId === userId) this.photos.delete(id);
    this.collections.delete(userId);
  }
}
const deckFrom = (r: any): Deck => ({
  id: r.id,
  name: r.name,
  cards: r.cards,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  photoAt: r.photo_at ? new Date(r.photo_at).toISOString() : null,
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
      "ALTER TABLE mood_decks ADD COLUMN IF NOT EXISTS photo_at timestamptz",
    );
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS mood_deck_photos (deck_id text PRIMARY KEY REFERENCES mood_decks(id) ON DELETE CASCADE, image bytea NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now())",
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
        const old = (
          await c.query(
            "SELECT cards FROM mood_decks WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [id, userId],
          )
        ).rows[0];
        if (old && JSON.stringify(old.cards) !== JSON.stringify(value.cards))
          await c.query("DELETE FROM mood_deck_photos WHERE deck_id=$1", [id]);
        row = (
          await c.query(
            "UPDATE mood_decks SET name=$3, cards=$4, updated_at=now(), verified_at=CASE WHEN cards=$4 THEN verified_at ELSE NULL END, photo_at=CASE WHEN cards=$4 THEN photo_at ELSE NULL END WHERE id=$2 AND user_id=$1 RETURNING *",
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
  async attachPhoto(userId: string, id: string, data: Buffer, cards: string[]) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const d = (
        await c.query(
          "SELECT cards FROM mood_decks WHERE user_id=$1 AND id=$2 FOR UPDATE",
          [userId, id],
        )
      ).rows[0];
      if (!d || JSON.stringify(d.cards) !== JSON.stringify(cards))
        throw new CollectionError(
          "The deck changed. Reload and submit its photo again.",
        );
      await c.query(
        "INSERT INTO mood_deck_photos(deck_id,image) VALUES($1,$2) ON CONFLICT(deck_id) DO UPDATE SET image=EXCLUDED.image,submitted_at=now()",
        [id, data],
      );
      await c.query(
        "UPDATE mood_decks SET photo_at=now(),verified_at=NULL WHERE id=$1",
        [id],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async removePhoto(userId: string, id: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(
        "UPDATE mood_decks SET photo_at=NULL,verified_at=NULL WHERE user_id=$1 AND id=$2 RETURNING id",
        [userId, id],
      );
      if (r.rowCount)
        await c.query("DELETE FROM mood_deck_photos WHERE deck_id=$1", [id]);
      await c.query("COMMIT");
      return !!r.rowCount;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async pendingPhotos(): Promise<PendingPhoto[]> {
    const r = await this.pool.query(
      "SELECT d.id,d.user_id,d.name,p.submitted_at FROM mood_deck_photos p JOIN mood_decks d ON d.id=p.deck_id WHERE p.submitted_at>now()-interval '14 days' ORDER BY p.submitted_at LIMIT 50",
    );
    return r.rows.map((r) => ({
      deckId: r.id,
      userId: r.user_id,
      name: r.name,
      submittedAt: new Date(r.submitted_at).toISOString(),
    }));
  }
  async photo(id: string) {
    const r = await this.pool.query(
      "SELECT image FROM mood_deck_photos WHERE deck_id=$1 AND submitted_at>now()-interval '14 days'",
      [id],
    );
    return r.rows[0]?.image ?? null;
  }
  async reviewPhoto(id: string, approve: boolean) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT id FROM mood_decks WHERE id=$1 FOR UPDATE", [id]);
      const r = await c.query(
        "DELETE FROM mood_deck_photos WHERE deck_id=$1 AND submitted_at>now()-interval '14 days' RETURNING deck_id",
        [id],
      );
      if (r.rowCount)
        await c.query(
          approve
            ? "UPDATE mood_decks SET verified_at=now() WHERE id=$1"
            : "UPDATE mood_decks SET verified_at=NULL,photo_at=NULL WHERE id=$1",
          [id],
        );
      await c.query("COMMIT");
      return !!r.rowCount;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async purgePhotos() {
    await this.pool.query(
      "DELETE FROM mood_deck_photos WHERE submitted_at<=now()-interval '14 days'",
    );
  }
  async erase(userId: string) {
    await this.pool.query("DELETE FROM mood_decks WHERE user_id=$1", [userId]);
  }
}
