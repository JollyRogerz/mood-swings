import type { Difficulty, Game } from "./types";

export interface ResultPlayer {
  seat: number;
  userId: string | null;
  name: string;
  bot: Difficulty | null;
  substituted: boolean;
  won: boolean;
  roundWins: number;
}
export interface MatchResult {
  code: string;
  gameNo: number;
  finishedAt: string;
  humans: number;
  ranked: boolean;
  rounds: number;
  players: ResultPlayer[];
}
export interface RecordCount {
  games: number;
  wins: number;
  losses: number;
}
export interface PersonalStats extends RecordCount {
  winRate: number;
  roundWins: number;
  currentStreak: number;
  bestStreak: number;
  bots: Record<Difficulty, RecordCount>;
}
export interface LeaderboardEntry extends RecordCount {
  username: string;
  winRate: number;
}

// Account attribution is supplied by the room, never read by the rules engine.
export function finishedResult(
  game: Game,
  code: string,
  finishedAt: string,
): MatchResult {
  if (
    game.status !== "finished" ||
    !game.players.some((p) => p.id === game.winner)
  )
    throw new Error("Only a finished game with a winner has a result.");
  const humans = game.players.filter((p) => !p.bot).length;
  return {
    code,
    gameNo: game.gameNo ?? 1,
    finishedAt,
    humans,
    ranked: humans >= 2,
    rounds: game.round,
    players: game.players.map((p, seat) => ({
      seat,
      userId:
        !p.bot || p.substitute ? (game.matchAccounts?.[p.id] ?? null) : null,
      name: p.name,
      bot: p.bot ?? null,
      substituted: !!p.substitute,
      won: p.id === game.winner && !p.substitute,
      roundWins: p.wins,
    })),
  };
}
export function personalStats(
  results: MatchResult[],
  userId: string,
): PersonalStats {
  const empty = (): RecordCount => ({ games: 0, wins: 0, losses: 0 });
  const stats: PersonalStats = {
    ...empty(),
    winRate: 0,
    roundWins: 0,
    currentStreak: 0,
    bestStreak: 0,
    bots: { easy: empty(), normal: empty(), hard: empty(), fly: empty() },
  };
  for (const r of [...results].sort(
    (a, b) =>
      a.finishedAt.localeCompare(b.finishedAt) ||
      a.code.localeCompare(b.code) ||
      a.gameNo - b.gameNo,
  )) {
    // Two devices on the same profile still count as one game, never two wins.
    const seats = r.players.filter((p) => p.userId === userId);
    if (!seats.length) continue;
    const won = seats.some((p) => p.won && !p.substituted);
    stats.games++;
    stats.wins += Number(won);
    stats.losses += Number(!won);
    stats.roundWins += Math.max(...seats.map((p) => p.roundWins));
    stats.currentStreak = won ? stats.currentStreak + 1 : 0;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    for (const difficulty of new Set(
      r.players
        .filter((p) => p.userId !== userId && p.bot && !p.substituted)
        .map((p) => p.bot!),
    )) {
      const record = stats.bots[difficulty];
      record.games++;
      record.wins += Number(won);
      record.losses += Number(!won);
    }
  }
  stats.winRate = stats.games ? stats.wins / stats.games : 0;
  return stats;
}
export function rankingSeats(result: MatchResult) {
  if (!result.ranked) return [];
  // Include stand-ins: replacing a duplicate seat must not restore ranked credit.
  const ids = result.players
    .filter((p) => p.userId)
    .map((p) => p.userId);
  if (new Set(ids).size !== ids.length) return [];
  return result.players.filter((p) => p.userId && !p.bot && !p.substituted);
}
