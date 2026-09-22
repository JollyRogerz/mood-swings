import type { Pool } from "pg";
import {
  personalStats,
  rankingSeats,
  type MatchResult,
  type LeaderboardEntry,
  type PersonalStats,
} from "../game/results";
import type { AccountStore } from "./accounts";

export interface ResultStore {
  init(): Promise<void>;
  record(result: MatchResult): Promise<void>;
  stats(userId: string): Promise<PersonalStats>;
  leaderboard(): Promise<LeaderboardEntry[]>;
  anonymize(userId: string): Promise<void>;
}
export class MemoryResultStore implements ResultStore {
  private results = new Map<string, MatchResult>();
  private eligible = new Map<string, Set<number>>();
  constructor(private accounts: AccountStore) {}
  async init() {}
  async record(result: MatchResult) {
    const key = `${result.code}:${result.gameNo}`;
    if (this.results.has(key)) return;
    const saved = structuredClone(result);
    for (const player of saved.players)
      if (player.userId && !(await this.accounts.profile(player.userId)))
        player.userId = null;
    if (!this.results.has(key)) {
      this.results.set(key, saved);
      this.eligible.set(key, new Set(rankingSeats(result).map((p) => p.seat)));
    }
  }
  async stats(userId: string) {
    return personalStats([...this.results.values()], userId);
  }
  async leaderboard() {
    const scores = new Map<string, { games: number; wins: number }>();
    for (const [key, result] of this.results)
      for (const p of result.players.filter(
        (p) => p.userId && this.eligible.get(key)?.has(p.seat),
      )) {
        const score = scores.get(p.userId!) ?? { games: 0, wins: 0 };
        score.games++;
        score.wins += Number(p.won);
        scores.set(p.userId!, score);
      }
    const entries: LeaderboardEntry[] = [];
    for (const [id, score] of scores) {
      const profile = await this.accounts.profile(id);
      if (profile && score.games >= 3)
        entries.push({
          ...score,
          losses: score.games - score.wins,
          winRate: score.wins / score.games,
          username: profile.username,
        });
    }
    return entries
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.winRate - a.winRate ||
          a.games - b.games ||
          a.username.localeCompare(b.username),
      )
      .slice(0, 100);
  }
  async anonymize(userId: string) {
    for (const r of this.results.values())
      for (const p of r.players) if (p.userId === userId) p.userId = null;
  }
}
export class PostgresResultStore implements ResultStore {
  constructor(private pool: Pool) {}
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS mood_results (
      id bigserial PRIMARY KEY, code text NOT NULL, game_no int NOT NULL,
      finished_at timestamptz NOT NULL, humans int NOT NULL, ranked boolean NOT NULL,
      rounds int NOT NULL, UNIQUE(code,game_no))`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS mood_result_players (
      result_id bigint NOT NULL REFERENCES mood_results(id) ON DELETE CASCADE,
      seat int NOT NULL, user_id text REFERENCES mood_profiles(user_id) ON DELETE SET NULL,
      name text NOT NULL, bot text, won boolean NOT NULL, round_wins int NOT NULL,
      substituted boolean NOT NULL, eligible boolean NOT NULL, PRIMARY KEY(result_id,seat))`);
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS mood_result_players_user ON mood_result_players(user_id)",
    );
  }
  async record(r: MatchResult) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO mood_results(code,game_no,finished_at,humans,ranked,rounds) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code,game_no) DO NOTHING RETURNING id",
        [r.code, r.gameNo, r.finishedAt, r.humans, r.ranked, r.rounds],
      );
      if (inserted.rows.length) {
        const eligible = new Set(rankingSeats(r).map((p) => p.seat));
        for (const p of r.players)
          await client.query(
            `INSERT INTO mood_result_players(result_id,seat,user_id,name,bot,won,round_wins,substituted,eligible)
          VALUES($1,$2,(SELECT user_id FROM mood_profiles WHERE user_id=$3),$4,$5,$6,$7,$8,$9)`,
            [
              inserted.rows[0].id,
              p.seat,
              p.userId,
              p.name,
              p.bot,
              p.won,
              p.roundWins,
              p.substituted,
              eligible.has(p.seat),
            ],
          );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async stats(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT r.*, json_agg(json_build_object('seat',p.seat,'userId',p.user_id,'name',p.name,'bot',p.bot,'won',p.won,'roundWins',p.round_wins,'substituted',p.substituted)) AS players
      FROM mood_results r JOIN mood_result_players p ON p.result_id=r.id
      WHERE EXISTS(SELECT 1 FROM mood_result_players mine WHERE mine.result_id=r.id AND mine.user_id=$1)
      GROUP BY r.id ORDER BY r.finished_at,r.id`,
      [userId],
    );
    return personalStats(
      rows.map((r) => ({
        code: r.code,
        gameNo: r.game_no,
        finishedAt: new Date(r.finished_at).toISOString(),
        humans: r.humans,
        ranked: r.ranked,
        rounds: r.rounds,
        players: r.players,
      })),
      userId,
    );
  }
  async leaderboard() {
    const { rows } = await this.pool
      .query(`SELECT profile.username, count(*)::int AS games,
      count(*) FILTER(WHERE p.won)::int AS wins
      FROM mood_result_players p JOIN mood_profiles profile ON profile.user_id=p.user_id
      JOIN mood_results r ON r.id=p.result_id WHERE r.ranked AND p.eligible
      GROUP BY profile.user_id,profile.username HAVING count(*)>=3
      ORDER BY count(*) FILTER(WHERE p.won) DESC,
      (count(*) FILTER(WHERE p.won))::float / count(*) DESC, count(*) ASC, profile.username ASC LIMIT 100`);
    return rows.map((r) => ({
      ...r,
      losses: r.games - r.wins,
      winRate: r.wins / r.games,
    })) as LeaderboardEntry[];
  }
  async anonymize(userId: string) {
    await this.pool.query(
      "UPDATE mood_result_players SET user_id=NULL WHERE user_id=$1",
      [userId],
    );
  }
}
