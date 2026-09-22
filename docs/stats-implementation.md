# Finished games, statistics and ranking

Implemented from the accounts/stats/collection design, September 2026.

The rules engine still knows nothing about databases or accounts. `game/results.ts` converts a finished game and server-supplied account attribution into a result. The room captures device/account links when the match starts, persists a final result inside the game snapshot, then writes the statistics tables. The snapshot acts as an outbox: failed writes retry while the room is alive and when it is restored. Rematch cannot replace a pending result until recording succeeds. PostgreSQL has a unique `(code, game_no)` constraint and writes the parent and all seats in one transaction.

Match numbers default to 1 for older snapshots and increase on rematch. Games already underway without account attribution remain unlinked. There is no backfill or client endpoint for posting scores. Public room views contain neither attribution nor result records.

Personal records include all linked finished games, with one game per account even if it occupied multiple seats. A substitute finish is a loss. Bot records count each difficulty present once per match, excluding stand-ins. Round wins for an account with multiple seats use its highest seat total. Streaks are ordered by finish time with a stable room/match tie-breaker.

Ranked matches need at least two human-finished seats; guests can be opponents. Only linked, non-substituted human seats enter rankings. A match in which the same linked profile holds multiple human seats earns no ranked credit. Three ranked matches are required to appear. Sorting is wins, win rate, fewer games, then username for stable ties. This is a casual leaderboard, not a fraud-resistant competitive rating: multiple accounts and colluding players remain a future moderation concern.

Personal statistics require an authenticated session and are never publicly cached. The public leaderboard exposes only username and aggregate results, with a 60-second cache lifetime. Deleting a profile removes its result references; PostgreSQL also uses `ON DELETE SET NULL`. Result names remain as historical table names. A pending result whose profile was deleted is inserted without that account link.

Storage and migrations use the existing Railway PostgreSQL. Accounts-off deployments continue normal guest play. Memory mode has in-memory results for tests and development. In production, restarting or restoring the room retries a saved final result; it does not require keeping the original browser open.

Validation includes pure conversion/statistics tests, memory-store behavior, authenticated API/attribution tests, PostgreSQL transaction/uniqueness/deletion tests, and a browser scenario finishing three games and inspecting profile totals and the mobile leaderboard. CI now provisions PostgreSQL independently of the production service.

Remaining roadmap work: deck collection, public profile pages, owned badges, Bring your deck, and optional ownership verification. Social OAuth apps and physical iPhone/Android passkey checks still need configuration/hardware. No paid service was introduced.
