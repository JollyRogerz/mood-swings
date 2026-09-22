import type { Pool } from "pg";
import { usernameKey } from "../game/account";
export interface Profile {
  userId: string;
  username: string;
  createdAt: string;
}
// An account sits on top of the seats, never inside them: a seat is still the
// hash of a device token, and this store only remembers which account each
// of those devices belongs to.
export interface AccountStore {
  init(): Promise<void>;
  profile(userId: string): Promise<Profile | null>;
  byUsername(username: string): Promise<Profile | null>;
  setUsername(userId: string, username: string): Promise<Profile>;
  link(playerId: string, userId: string): Promise<void>;
  unlink(playerId: string, userId: string): Promise<void>;
  userFor(playerId: string): Promise<string | null>;
  devices(userId: string): Promise<number>;
  remove(userId: string): Promise<void>;
}
export class UsernameTaken extends Error {
  constructor() {
    super("That username is taken.");
  }
}
export class MemoryAccountStore implements AccountStore {
  private profiles = new Map<string, Profile>();
  private owners = new Map<string, string>();
  async init() {}
  async profile(userId: string) {
    return this.profiles.get(userId) ?? null;
  }
  async byUsername(username: string) {
    return (
      [...this.profiles.values()].find(
        (p) => usernameKey(p.username) === usernameKey(username),
      ) ?? null
    );
  }
  async setUsername(userId: string, username: string) {
    const key = usernameKey(username);
    for (const p of this.profiles.values())
      if (p.userId !== userId && usernameKey(p.username) === key)
        throw new UsernameTaken();
    const profile = {
      userId,
      username,
      createdAt:
        this.profiles.get(userId)?.createdAt ?? new Date().toISOString(),
    };
    this.profiles.set(userId, profile);
    return profile;
  }
  async link(playerId: string, userId: string) {
    this.owners.set(playerId, userId);
  }
  async unlink(playerId: string, userId: string) {
    if (this.owners.get(playerId) === userId) this.owners.delete(playerId);
  }
  async userFor(playerId: string) {
    return this.owners.get(playerId) ?? null;
  }
  async devices(userId: string) {
    return [...this.owners.values()].filter((u) => u === userId).length;
  }
  async remove(userId: string) {
    this.profiles.delete(userId);
    for (const [seat, owner] of this.owners)
      if (owner === userId) this.owners.delete(seat);
  }
}
export class PostgresAccountStore implements AccountStore {
  constructor(private pool: Pool) {}
  async init() {
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS mood_profiles (user_id text PRIMARY KEY, username text NOT NULL, username_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now())",
    );
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS mood_devices (player_id text PRIMARY KEY, user_id text NOT NULL, linked_at timestamptz NOT NULL DEFAULT now())",
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS mood_devices_user ON mood_devices (user_id)",
    );
  }
  async profile(userId: string) {
    const r = await this.pool.query(
      "SELECT user_id, username, created_at FROM mood_profiles WHERE user_id=$1",
      [userId],
    );
    const row = r.rows[0];
    return row
      ? {
          userId: row.user_id,
          username: row.username,
          createdAt: new Date(row.created_at).toISOString(),
        }
      : null;
  }
  async byUsername(username: string) {
    const r = await this.pool.query(
      "SELECT user_id FROM mood_profiles WHERE username_key=$1",
      [usernameKey(username)],
    );
    return r.rows[0] ? this.profile(r.rows[0].user_id) : null;
  }
  async setUsername(userId: string, username: string) {
    try {
      await this.pool.query(
        "INSERT INTO mood_profiles (user_id, username, username_key) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET username=EXCLUDED.username, username_key=EXCLUDED.username_key",
        [userId, username, usernameKey(username)],
      );
    } catch (e) {
      // 23505: the unique index on username_key.
      if ((e as { code?: string }).code === "23505") throw new UsernameTaken();
      throw e;
    }
    return (await this.profile(userId))!;
  }
  async link(playerId: string, userId: string) {
    await this.pool.query(
      "INSERT INTO mood_devices (player_id, user_id) VALUES ($1,$2) ON CONFLICT (player_id) DO UPDATE SET user_id=EXCLUDED.user_id, linked_at=now()",
      [playerId, userId],
    );
  }
  async unlink(playerId: string, userId: string) {
    await this.pool.query(
      "DELETE FROM mood_devices WHERE player_id=$1 AND user_id=$2",
      [playerId, userId],
    );
  }
  async userFor(playerId: string) {
    const r = await this.pool.query(
      "SELECT user_id FROM mood_devices WHERE player_id=$1",
      [playerId],
    );
    return r.rows[0]?.user_id ?? null;
  }
  async devices(userId: string) {
    const r = await this.pool.query(
      "SELECT count(*)::int AS n FROM mood_devices WHERE user_id=$1",
      [userId],
    );
    return r.rows[0].n;
  }
  async remove(userId: string) {
    await this.pool.query("DELETE FROM mood_devices WHERE user_id=$1", [
      userId,
    ]);
    await this.pool.query("DELETE FROM mood_profiles WHERE user_id=$1", [
      userId,
    ]);
  }
}
