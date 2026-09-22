import React, { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import type { LeaderboardEntry, PersonalStats } from "../game/results";
import { useOverlayScrollLock } from "./portable";
import "./leaderboard.css";
function useData<T>(url: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(undefined);
    fetch(url, { signal: controller.signal, credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok)
          throw new Error("Could not load this right now. Please try again.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [url, attempt]);
  return { data, error, retry: () => setAttempt((n) => n + 1) };
}
const rate = (n: number) => `${Math.round(n * 100)}%`;
export function PersonalStatsPanel() {
  const { data, error, retry } = useData<PersonalStats>("/api/account/stats");
  return (
    <section className="personal-stats" aria-label="Your game statistics">
      <h3>Your record</h3>
      {error ? (
        <p role="alert">
          {error} <button onClick={retry}>Retry</button>
        </p>
      ) : !data ? (
        <p role="status">Loading your record…</p>
      ) : (
        <>
          <div className="stats-grid">
            {[
              ["Games", data.games],
              ["Wins", data.wins],
              ["Losses", data.losses],
              ["Win rate", rate(data.winRate)],
              ["Round wins", data.roundWins],
              ["Current streak", data.currentStreak],
              ["Best streak", data.bestStreak],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {!data.games && (
            <p>
              Your next finished game starts your record. Link your profile
              before the host starts.
            </p>
          )}
          <details>
            <summary>Against the bots</summary>
            <ul className="bot-records">
              {Object.entries(data.bots).map(([bot, r]) => (
                <li key={bot}>
                  <span>{bot === "fly" ? "Fly brain" : bot} bot</span>
                  <strong>
                    {r.wins} wins · {r.losses} losses
                  </strong>
                </li>
              ))}
            </ul>
          </details>
          <p className="stats-note">
            A bot finishing your seat counts as a loss. Unfinished games do not
            count.
          </p>
        </>
      )}
    </section>
  );
}
export function LeaderboardButton() {
  const [open, setOpen] = useState(false);
  useOverlayScrollLock(open);
  return (
    <>
      <button aria-label="Leaderboard" onClick={() => setOpen(true)}>
        <Trophy size={16} />
        <span>Leaderboard</span>
      </button>
      {open && (
        <div className="modal-backdrop preferences-backdrop">
          <section
            className="preferences-panel leaderboard-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Leaderboard"
          >
            <button
              className="close-modal"
              data-dialog-close
              aria-label="Close leaderboard"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <span className="eyebrow">GOOD GAMES. GOOD COMPANY.</span>
            <h2>The leaderboard</h2>
            <LeaderboardContent />
          </section>
        </div>
      )}
    </>
  );
}
function LeaderboardContent() {
  const { data, error, retry } = useData<{
    enabled: boolean;
    players: LeaderboardEntry[];
  }>("/api/leaderboard");
  return (
    <>
      <p>
        Finish three ranked games to appear. Ranked games need at least two
        human-finished seats. Substitute bots never earn a ranking.
      </p>
      <p className="stats-note">
        Sorted by wins, then win rate, then fewer games. Updates may take a
        minute.
      </p>
      {error ? (
        <p role="alert">
          {error} <button onClick={retry}>Retry</button>
        </p>
      ) : !data ? (
        <p role="status">Loading the table…</p>
      ) : !data.enabled ? (
        <p>Profiles and rankings are not enabled on this server yet.</p>
      ) : !data.players.length ? (
        <div className="leaderboard-empty">
          The first names are still being written.
          <small>
            Play with friends and finish three ranked games to get started.
          </small>
        </div>
      ) : (
        <div className="ranking-scroll">
          <table>
            <caption>Top players by ranked wins</caption>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Games</th>
                <th>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((p, i) => (
                <tr key={p.username}>
                  <td>{i + 1}</td>
                  <th scope="row">
                    <a href={`/u/${encodeURIComponent(p.username)}`}>
                      {p.username}
                    </a>
                  </th>
                  <td>{p.wins}</td>
                  <td>{p.games}</td>
                  <td>{rate(p.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
