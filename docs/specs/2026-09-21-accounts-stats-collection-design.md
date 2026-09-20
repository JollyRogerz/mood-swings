# Accounts, stats, ranking and collection

Design agreed on 2026-09-21. Four pull requests, each shippable on its own.

## Goals

- A player can keep one identity across browsers and devices.
- Finished games are recorded, and a leaderboard ranks players.
- Owners of the physical game can log the decks they own and show them off.
- A host can deal a table from the cards they logged ("Bring your deck").

## Non-goals

- No paid service of any kind. Everything runs on the existing Railway Postgres.
- No email or password storage.
- No photo verification in this work. It is described under "Later" so the
  data model leaves room for it.
- No change to guest play. Nobody is forced to make an account.
- The collection never affects the ranking.

## Constraints found in the code

- A seat's identity is `sha256(device token).slice(0, 24)` (`identity` in
  `src/server/room.ts`). Rooms, seat reclaim and snapshots all depend on it.
- `start(g, actor, mode, fixedDeck?)` in `src/game/engine.ts` already accepts a
  fixed list of card ids.
- A game always has exactly one winner (first to three round wins, ties broken
  by seat order). There are no draws, so stats are wins and losses.
- A physical deck is 45 unique cards: 23 common, 14 uncommon, 6 rare,
  2 mythic rare.
- CI has no Postgres, and local development falls back to `FileStore`.

## PR 1: Accounts

**Library:** Better Auth, mounted on the existing Express app at `/api/auth/*`,
using the existing `pg` pool. Plugins: `anonymous`, `passkey`. Discord and
Google providers are switched on only when their env vars exist
(`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`).

**Seats do not change.** The device token stays the seat identity. An account
is a layer on top, joined through one table:

```
mood_devices (player_id text primary key, user_id text not null, linked_at timestamptz)
mood_profiles (user_id text primary key, username text unique not null, created_at timestamptz)
```

`player_id` is the 24-character id the rooms already use. One user can have
many devices.

**Flow**

1. A visitor plays as a guest, exactly as today. No database row is created.
2. "Save my profile" asks for a username, then:
   - creates a Better Auth user through the anonymous plugin,
   - registers a passkey on it (Face ID, fingerprint or device PIN),
   - writes `mood_profiles`, then `POST /api/account/link` with the device
     token writes `mood_devices`.
   If the passkey step is cancelled, the half-made user is deleted.
3. On another device: "Sign in" with the passkey (or Discord/Google if linked),
   then the same link call attaches that device.
4. "Sign out" removes the session cookie and nothing else. The device stays
   linked until the player chooses "Forget this device".

**Usernames:** 3 to 20 characters, letters, digits, `_` and `-`, unique
case-insensitively, passed through the existing `cleanName` rules. The display
name at a table defaults to the username but stays editable per table.

**When there is no database** (`DATABASE_URL` unset): `/api/config` reports
`accounts: false` and the client hides every account control. Tests use Better
Auth's memory adapter and an in-memory implementation of the account store.

**First task of this PR is a spike:** confirm that an anonymous Better Auth user
can register a passkey and later sign in with it, in Chrome and Safari. If it
cannot, fall back to Discord and Google only, and stop to re-plan.

**Files:** `src/server/auth.ts` (Better Auth setup), `src/server/accounts.ts`
(store interface, Postgres and memory implementations, link and profile
routes), `src/client/account.tsx` and `.css` (profile menu, save and sign-in
dialogs).

## PR 2: Stats and leaderboard

**Recording.** When a room's game moves to `finished`, the server writes one
result, once, keyed by room code and a per-room game counter so rematches are
separate rows.

```
mood_results (id bigserial, code text, game_no int, finished_at timestamptz,
              humans int, ranked boolean, rounds int, unique (code, game_no))
mood_result_players (result_id bigint, seat int, user_id text null, name text,
                     bot text null, won boolean, round_wins int,
                     substituted boolean)
```

- `ranked` is true when at least two seats were humans who finished the game
  themselves.
- A seat that ended under a bot stand-in is stored with `substituted = true`.
  It counts as a loss in that player's personal stats and is ignored by the
  leaderboard.
- Guests are stored with `user_id` null, so a table's history stays complete.

**Personal stats** (all games): games, wins, losses, win rate, round wins,
current and best win streak, record against each bot difficulty including the
fly.

**Leaderboard** (ranked games only): sorted by wins, then win rate, then fewer
games. A player appears after three ranked games. Served by
`GET /api/leaderboard` with a 60-second cache, shown on a new page reachable
from the landing screen.

**Files:** `src/game/results.ts` (pure: turn a finished `Game` into a result
record), `src/server/results.ts` (store), `src/client/leaderboard.tsx`.

## PR 3: Collection and profile

**The unit is a deck.** A player adds a named deck and ticks cards in a binder
of all 133.

```
mood_decks (id bigserial, user_id text, name text, cards text[], created_at, updated_at)
```

- At most 10 decks per player, 45 cards per deck, each card at most once per
  deck.
- A deck matching 23/14/6/2 is marked "retail-shaped". A deck that does not
  match is still saved, with a gentle note, because factory contents are not
  guaranteed and a player may have lost a card.
- Quantity per card is the count across that player's decks.

**Profile page** at `/u/<username>`, public: username, join date, stats,
decks, completion overall, by color and by rarity. A player can set their
collection to private.

**Files:** `src/game/collection.ts` (pure: validation, completion maths),
`src/server/collection.ts`, `src/client/binder.tsx`, `src/client/profile.tsx`.

## PR 4: Owned badge and Bring your deck

**Owned badge.** The room (not the rules engine, which stays free of database
concerns) attaches to each player's public entry the set of card ids that
player owns. The client draws a small marker on a card in play when its owner
has it. Cosmetic only. The set is read once when the player sits down.

**Bring your deck.** In the lobby the host chooses "Standard deck" or one of
their logged decks. The server loads that deck from the database, never from
the client, and passes it to `start` as `fixedDeck`. The deck must have enough
cards for the table (the engine already insists on five per player). The
lobby shows every player which deck is in use and whose it is.

Bring-your-deck games are recorded like any other. They count toward the
ranking, because the deck is shared and gives the host no advantage.

## Later: verified owner

Not built now. One photo per deck showing the cards fanned out beside a
handwritten note with the username. The photo is resized in the browser,
stored until reviewed, approved on a small admin page, then deleted. Approval
sets `verified_at` on the deck. When this exists, Bring your deck can show a
"verified" mark; it never becomes a requirement.

## Security and privacy

- No email, no password, no real name. A passkey's private half never leaves
  the player's device.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`.
- Every write route checks the session and is rate limited.
- Usernames and deck names go through the same cleaning as table names.
- A player can delete their account: profile, devices and decks are removed,
  and their past results keep the display name but lose the `user_id`.

## Testing

- Pure modules (`results.ts`, `collection.ts`) get unit tests.
- Server tests use the memory stores through the existing
  `tests/server-harness.ts`.
- Playwright uses Chrome's virtual authenticator (WebAuthn over CDP) to save a
  profile and sign back in. Chromium only.
- One end-to-end scenario per PR: save a profile; finish a game and see it on
  the leaderboard; log a deck and see completion; host a Bring-your-deck table.
