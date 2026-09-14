import { Pool } from "pg";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Game } from "../game/types";
export interface Store {
  init(): Promise<void>;
  save(code: string, game: Game): Promise<void>;
  load(code: string): Promise<Game | null>;
  close(): Promise<void>;
}
export class PostgresStore implements Store {
  private pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async init() {
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS mood_games (code text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
    );
  }
  async save(code: string, game: Game) {
    await this.pool.query(
      "INSERT INTO mood_games (code,state) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET state=EXCLUDED.state, updated_at=now()",
      [code, JSON.stringify(game)],
    );
  }
  async load(code: string) {
    const r = await this.pool.query(
      "SELECT state FROM mood_games WHERE code=$1 AND updated_at > now() - interval '30 days'",
      [code],
    );
    return r.rows[0]?.state ?? null;
  }
  async close() {
    await this.pool.end();
  }
}
export class FileStore implements Store {
  constructor(private root = path.resolve(".runtime/rooms")) {}
  async init() {
    await mkdir(this.root, { recursive: true });
  }
  private file(code: string) {
    if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error("Invalid room code");
    return path.join(this.root, code + ".json");
  }
  async save(code: string, game: Game) {
    const dest = this.file(code),
      tmp = dest + ".tmp";
    await writeFile(tmp, JSON.stringify(game));
    await rename(tmp, dest);
  }
  async load(code: string) {
    try {
      return JSON.parse(await readFile(this.file(code), "utf8")) as Game;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async close() {}
}
export const store: Store = process.env.DATABASE_URL
  ? new PostgresStore(process.env.DATABASE_URL)
  : new FileStore();
