# Accounts (PR 1) implementation plan

**Goal:** a player can save a profile with a passkey, Discord or Google, and
link any device to it, without changing how seats or guest play work.

**Architecture:** Better Auth 1.7 is mounted on the existing Express app at
`/api/auth/*`, before `express.json()`. Seats keep their device-token identity;
a `mood_devices` table joins a seat id to a Better Auth user, and
`mood_profiles` holds the unique username. Everything account-related sits
behind one `accounts` object that is `undefined` when accounts are off.

**Tech stack:** `better-auth`, `@better-auth/passkey`, `pg`, React 19, Vitest,
Playwright with Chrome's virtual authenticator.

## Global constraints

- No paid service, no email, no password.
- Guest play is unchanged; no database row for a guest.
- Accounts are on when `DATABASE_URL` and `BETTER_AUTH_SECRET` are both set, or
  when `MOOD_ACCOUNTS=memory` (tests, local development). Otherwise the client
  hides every account control and the game runs as before.
- Usernames: 3–20 characters, `A–Z a–z 0–9 _ -`, unique case-insensitively.
- The project installs from the public npm registry (`.npmrc`).

## Spike result (2026-09-21)

Headless Chrome with a virtual authenticator: `signIn.anonymous()` →
`passkey.addPasskey()` → `signOut()` → `signIn.passkey()` returned the same
user. The memory adapter needs every table present up front
(`user, session, account, verification, passkey`). Migrations run from code
with `getMigrations` from `better-auth/db/migration`. Safari is still to be
checked by hand on a real device.

A passkey user is created through the anonymous plugin, so it carries
`isAnonymous: true`. The username route clears that flag; otherwise linking
Discord later would make Better Auth replace the user instead of attaching to
it.

## Tasks

### 1. Username rules (pure)

- Create `src/game/account.ts`: `cleanUsername(raw: unknown): string` (throws
  `Error` with a player-facing message), `usernameKey(name): string`
  (lower-case key for uniqueness).
- Test `tests/account.test.ts`: trims; rejects 2 and 21 characters, spaces,
  emoji, non-strings; keeps case; key is lower-case.

### 2. Account store

- Create `src/server/accounts.ts`:
  ```ts
  export interface Profile { userId: string; username: string; createdAt: string }
  export interface AccountStore {
    init(): Promise<void>;
    profile(userId: string): Promise<Profile | null>;
    setUsername(userId: string, username: string): Promise<Profile>; // throws "taken"
    link(playerId: string, userId: string): Promise<void>;          // moves the device if linked elsewhere
    unlink(playerId: string, userId: string): Promise<void>;
    userFor(playerId: string): Promise<string | null>;
    devices(userId: string): Promise<number>;
    remove(userId: string): Promise<void>;
  }
  export class MemoryAccountStore implements AccountStore
  export class PostgresAccountStore implements AccountStore  // takes a pg Pool
  ```
- Test `tests/accounts-store.test.ts` against the memory store: username taken
  in another case; renaming frees the old name; link, relink to another user,
  unlink by the wrong user is ignored; remove clears profile and devices.

### 3. Better Auth setup

- Create `src/server/auth.ts`: `createAccounts(env)` returns
  `{ auth, store, providers: ("discord" | "google")[] } | undefined`.
  Plugins `anonymous()` and `passkey({ rpID, rpName: "Mood Swings Online", origin })`.
  Base URL from `BETTER_AUTH_URL`, else `https://$RAILWAY_PUBLIC_DOMAIN`, else
  `http://localhost:$PORT`. Social providers only when both of their env vars
  exist. `user.deleteUser.enabled`. Trusted origins add the Vite dev server.
  With Postgres, run `getMigrations(...).runMigrations()` at start.

### 4. Routes

- Modify `src/server/index.ts`: mount `toNodeHandler(auth)` before
  `express.json()`; add, all rate limited like `/api/rooms`:
  - `GET /api/account` → `{ accounts, providers, user: null | { id, username, devices }, linked }`
    (`linked` reads the device token from the `x-mood-session` header, so it never
    appears in a URL or a log; it is hashed with `identity`, never stored raw)
  - `POST /api/account/username { username }`
  - `POST /api/account/link { token }`, `POST /api/account/unlink { token }`
  - `DELETE /api/account`
- Test `tests/account-server.test.ts` through `tests/server-harness.ts` with
  `MOOD_ACCOUNTS=memory`: accounts off by default; anonymous sign-in then
  username then link; second user cannot take the name; unauthenticated writes
  get 401; delete removes everything.

### 5. Client

- Create `src/client/account.tsx` and `.css`: `authClient`, `useAccount(token)`,
  `AccountButton` in the site header, `AccountDialog` with three states
  (guest, needs username, signed in). After any sign-in the device is linked
  automatically. The table name field defaults to the username.
- Modify `src/client/main.tsx`: render the button in `<nav>`, pass the username
  as the default name.

### 6. End to end

- Create `tests/e2e/account.spec.ts` (Chromium only): virtual authenticator;
  save a profile; reload and still signed in; sign out; sign in with the
  passkey; the landing name field shows the username.
- Modify `playwright.config.ts` web server env: `MOOD_ACCOUNTS=memory`.

### 7. Docs

- README: accounts section, env table (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `DISCORD_*`, `GOOGLE_*`), redirect URLs to register with each provider.
- `.env.example`: the same variables, empty.
