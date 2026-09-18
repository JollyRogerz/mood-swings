# Mood Swings Online

**A free fan adaptation of Mood Swings, made for playing with friends wherever we are.**

[Play in your browser](https://mood-swings-production.up.railway.app) · [Original game](https://secretlair.wizards.com/eu/en/mood-swings) · [Official card notes](https://magic.wizards.com/en/news/feature/mood-swings-card-notes) · [Report a bug](https://github.com/JollyRogerz/mood-swings/issues)

> I love Mood Swings. I own two physical decks, love playing it with friends, and can't wait to see what future releases bring. This project comes from a simple wish: to keep playing together when we aren't sitting around the same table. It's a personal tribute to a game I enjoy, and I fully support the people who made it.
>
> — Ruben / [JollyRogerz](https://github.com/JollyRogerz)

This is an independent fan project. **Every gameplay feature is free.** There are no paid matches, subscriptions, advertisements, purchases, or monetized features in this adaptation. Hosting is paid for by the maintainer; players may optionally send USDC donations directly to JollyRogerz, with no benefits or access tied to payment. Please support the original game and its creators through their official channels.

Mood Swings, its original rules, card text, illustrations, branding, and other original materials belong to Wizards of the Coast and their respective rights holders. This project is not affiliated with, sponsored by, or endorsed by Wizards of the Coast, Hasbro, Secret Lair, or the original creators. A public repository and a noncommercial purpose do not grant rights to the original materials. See [rights, credits, and project policy](CREDITS.md).

![The Mood Swings Online home screen, with original card graphics](docs/images/home.png)

## What you can play

Mood Swings Online implements the traditional shared-deck game for **two to four players**, directly in a laptop, phone, or tablet browser. Friends join through an invite link. You can also play alone against bots or mix human players and bots at the same table.

| Feature            | Current behavior                                                    |
| ------------------ | ------------------------------------------------------------------- |
| Online multiplayer | Public or private tables for 2–4 players                               |
| Solo play          | Add one to three bots before starting                               |
| Difficulty         | Easy, Normal, Hard, or a real fruit-fly brain circuit, per bot      |
| Cards              | 133 unique moods with implemented card handlers                     |
| Standard deck      | 45 unique cards, sampled using the retail rarity counts             |
| Card reference     | Searchable catalog, full original images, and 497 extracted rulings |
| Rules              | Server validates actions, costs, choices, timing, scores, and wins  |
| Reconnection       | Return to your seat using the same browser and invite link          |
| Persistence        | PostgreSQL snapshots for the hosted game                            |
| Rematches          | Host returns the same players and bots to the lobby                 |
| Table chatter      | Emoji reactions, opponents' hands as card backs, and what each player is doing |
| Guidance           | The one control that moves the game along glows                     |
| Decide first       | A card's decisions are previewed and answered from the hand before it is played |
| Auto-advance       | A turn with no legal play left ends by itself                       |
| Turn timer         | Optional per-decision clock with a personal time bank, set by the host |
| Device support     | Touch layouts for phones and tablets, portrait and landscape; no installer required    |

This release does not include Duel, drafting, team variants, custom deck construction, spectators, public matchmaking, rankings, chat, or account-based seat recovery. The source engine also has an all-cards deck mode for experimentation; the standard interface uses the 45-card format.

## Start a game with friends

1. Open the [live game](https://mood-swings-production.up.railway.app).
2. Enter the name you want people at the table to see.
3. Select **Create a table**.
4. Use **Share invite & QR code** to open your phone’s native share menu (where supported), copy the link, or let a friend scan the QR code. They can also enter the room code on the home screen.
5. Wait for everyone to join. The host can add bots to empty seats.
6. With two to four players seated, the host selects **Start the game**.
7. Select a card from your hand. If its effect needs a decision, the options appear right there under the card; choose them, then choose **Play mood**. Anything you leave undecided is asked at the table after the play.
8. Use **End turn** once you have finished your plays. Extra plays are optional permissions and may have different restrictions. When you have no legal play left, the table ends your turn for you after the reveal.

While you wait, each opponent's seat shows their hand as face-down card backs and a short line about what they are up to: choosing a mood, holding a card, reading a card, checking the rules, deciding on an effect, or away. Those lines come from the other browser's own interface state and never name a hidden card. Eight emoji reactions float over your avatar for everyone at the table; reactions and activity are broadcast live and are not part of the saved game. The control that moves the game along glows: Start the game, Play mood once a card is selected, Confirm or Skip on a decision, and Continue or End turn when there is nothing left to play.

Selecting a card asks the server to preview the play: it simulates the play on a copy of the game and returns the first decision the card would raise, with the same options and limits the table would show. Answer it, and the next decision is previewed, until the plan is complete. The play is then sent with those answers attached; the engine raises its prompts as usual and the server replays each answer into the prompt it was made for. Any prompt that does not match the preview (for example, one that depends on a random outcome, since previews are re-seeded so they cannot peek at randomness) is asked at the table as before, and you can always play without deciding first.

Effect choices show a live selection count, a point-budget meter when relevant, and specific guidance for matching pairs or player restrictions. Invalid combinations cannot be confirmed. The values come from the server's decision state, including value changes caused by entering play; previews identify both the board revision and the exact answers they evaluated. **Play mood** also applies valid targets currently selected in its preview, so those choices are not silently dropped. Cards you are reading remain selected across unrelated table updates, and the browser tab announces **Your turn** or **Your choice**.

Every completed card play gets a shared six-second full-size reveal, showing who played it. Humans and bots wait while everyone reads; copied cards identify both the original mood and the copied identity. Inspect a card to read its full artwork, rules, and notes. The table displays current values, since effects may change a mood's value from the number printed on its card. The activity log helps explain what just happened. After each round, a nine-second results sequence shows the final scores, the round winner, the Hurt Feelings recipient (when applicable), and who starts next. Both humans and bots wait for it to finish. The sequence also explains ties and handles the final match result. After a match, the host can start a rematch with the same group.

An invite is intended for the people you share it with. Rooms are private by default. Hosts can choose Public at creation or in the lobby to appear on the home-page directory. Only waiting tables with an online host and fewer than four occupied seats are listed. The directory exposes the room code, host nickname, seat count and bot count, never session credentials or hands. Listings refresh every 15 seconds and are rebuilt as hosts reconnect after a server restart. Anyone with a lobby invite can try to occupy an open seat, so share it with your intended group.

Use **Last round** beside the latest move to reopen the completed round's scores, winner, Hurt Feelings, and next starting player. This personal recap has no countdown and does not pause the shared game; a new shared reveal or round result takes precedence. Catalog, inspection, rules, settings, and result dialogs keep keyboard focus inside the foremost dialog and restore it when closed. **Escape** dismisses a hover enlargement first, then a dismissible dialog. Empty catalog searches offer a **Show all cards** reset.

## Play on a phone or tablet

Open the same game link on your device; phone, tablet, and laptop players can share a table. Portrait mode puts your hand in a horizontal strip within thumb reach. Swipe through the cards, then tap a card to read its rules and choose **Inspect** or **Play mood**. Tapping selects a card without triggering the desktop hover preview. Decisions and play controls open in a scrollable panel at the bottom of a phone screen.

Every opponent has a score button above the board. Tap a name to bring that seat into view, or swipe between seats. Your current points also stay beside the turn message in your hand area. The smile button opens reactions. Tablets show larger areas for two opposing seats at a time; short landscape screens move the hand to a scrollable column beside the board. Card inspection, shared reveals, choices, and round results adapt to the available screen height. Safe-area spacing accommodates screen cutouts and home indicators, and text inputs avoid the small-font zoom on mobile browsers.

The app includes a web manifest and home-screen icons. Use your browser's **Add to Home Screen** or installation option where available. It is still the same online game: **an internet connection is required**, including for bot games, because the server validates every move. There is no offline cache or service worker. Browser and installed-app storage can differ, so start and return to a match using the same browser or home-screen app. Backgrounding a phone can interrupt its connection; returning to that same session uses the existing reconnection flow.

Mobile verification uses Chromium and WebKit with touch-enabled browser contexts, including 320 × 568 and 390 × 844 phones, 844 × 390 landscape, and 768 × 1024 and 1024 × 768 tablets. This covers browser behavior and layout; it is not a claim of testing on every physical device or operating-system version.

## Learn by playing

Choose **New here? Learn by playing.** on the home page for an optional guided practice game. A curated, unique 45-card deal and two scripted practice bots teach playing a mood, ending turns, changing values, choosing Anger’s targets, counting scores, Hurt Feelings, and winning three rounds. Every move uses the real rules engine. The bots deliberately pass to leave room for learning; their choices are instructional, not an example of the competitive bot policies.

The lesson runs locally once loaded and creates no online room. It can be closed or restarted at any point. Completion is remembered only on that browser and changes the entry to **Revisit the practice table**. Other tables continue normally while a player reads rules or score explanations. Online round results always advance on their timer; there is no next-round readiness vote.

## Play against bots

Create a table and use the lobby's difficulty selector, then **Add bot**. Repeat to add more opponents. The host can remove a bot in the lobby and add another with a different difficulty. Bot names are Fern, Ember, and Sage when those names are available.

| Difficulty | Decision method                                                        | Intended experience                                        |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Easy       | Seeded random legal choices, including occasional passes               | Relaxed practice and learning the interface                |
| Normal     | Card, value, and board-state heuristics                                | A more purposeful everyday opponent                        |
| Hard       | Compares a bounded set of candidate actions in sampled possible states | More deliberate decisions with a modest computation budget |
| Fly brain  | A mushroom body from the MaleCNS fruit-fly connectome, taught by reward | A real fly circuit that plays a little above Normal        |

This is conventional game AI running inside the server. It does **not** call an external language model, require an AI API key, or incur per-move API charges. Every bot action goes through the same rules engine as a human action.

The **Fly brain** bot (seated as Drosophila) routes each decision through 2,045 Kenyon cells and 45 output neurons of a real fruit fly's mushroom body, using the wiring of the [MaleCNS v1.0 connectome](https://blog.google/innovation-and-ai/technology/research/male-fruit-fly-brain-map/) published by HHMI Janelia and Google Research in September 2026. The wiring and neurotransmitter signs are the fly's; the game encoding and the trained Kenyon cell → output synapses are ours. It was taught by imitating the Hard bot and then by winning and losing whole games, the way dopamine teaches a real fly which smells to approach. Read [docs/fly-brain.md](docs/fly-brain.md) for what is real, what is not, the measured win rates, and how to retrain it.

The bot policy receives a player-specific view: its own hand, public cards, hand counts, legal options, and other public state. It does not receive the actual opponent hands, deck order, internal random generator, or effect queue. Hard constructs hypothetical hidden cards for its simulations; those are guesses, not access to the real hidden cards. It considers at most twelve pre-ranked plays plus passing, with two sampled continuations per candidate. Prompt resolution in those continuations uses the Normal policy.

Difficulty describes the strategy, not an advantage in the rules. Hard is an initial practical opponent, not an optimal solver or a guaranteed winner. Its current short simulations do not perform exhaustive opponent-response searches. Bots pause when no human is connected and resume when a person returns. They do not replace disconnected humans during a match.

## The game and its rules

The original game is designed by Mark Rosewater and published through Wizards of the Coast / Secret Lair. Read the [official product page](https://secretlair.wizards.com/eu/en/mood-swings) and [official card notes](https://magic.wizards.com/en/news/feature/mood-swings-card-notes) for the source material. The in-game help and inspector provide convenient references while playing.

In the implemented traditional format, everyone starts with five cards. Players take turns playing moods and resolving their effects. Each round ends after everyone has had a turn; the engine calculates scores, resolves applicable after-scoring effects, and awards the round. Three round wins win the game. Turn order matters for ties, and the Hurt Feelings helper provides its published catch-up behavior. Cards can modify this ordinary sequence.

The standard digital deck samples 23 common, 14 uncommon, six rare, and two mythic rare moods. This reproduces the published rarity counts, not the exact contents of either of the maintainer's physical decks or a claim about factory collation.

### How the implementation handles tricky interactions

- **Costs happen before entry.** The engine resolves required payments and copied costs before a mood enters play.
- **Values are live.** Distinct effect steps use the current board state when requesting targets. Suppression sets value to zero without deleting abilities.
- **Bulk choices preserve their timing.** Fury, Confusion, and Avoidance gather all required selections before their simultaneous movement is committed.
- **Extra plays are separate permissions.** Their allowed source zones and restrictions remain attached to the permission. The interface lets a player choose the permission being used.
- **Source lifetimes matter.** A card leaving and returning to play is a new incarnation for delayed effects. Copies lose their copied identity when they leave play.
- **Scoring has a sequence.** Scores are captured for the round, and after-scoring effects resolve in turn order. Players choose among their eligible effects when necessary. Effects such as Sneakiness can explicitly change the result.
- **Choices are validated.** Optional exact-pair effects accept either zero or two selections; “up to two” effects also accept one. Restrictions on ownership, matching characteristics, and combined value are checked on the server.

There are source inconsistencies worth making visible. Curiosity's printed image includes a secondary six that the card-notes heading omits. Wrath's notes contain a letter O in place of zero. The data preserves the extracted strings and separately records normalized values. The Awe/Recklessness timing discrepancy is documented with the implementation's chosen interpretation and a regression test. Read [rule interpretations](docs/rule-interpretations.md) for the reasoning and release limits.

## Visual design

The interface takes inspiration from the official Mood Swings product page: textured cream paper, graph-paper grids, bold black headlines, handwritten lettering, and blue, green, purple, and coral accents. Cut-paper labels, offset shadows, a card collage, and colorful lobby seats carry that style from the home page into the game. The table keeps large point totals, readable card previews, and staged round results, with layouts that adapt to laptop and phone screens.

The cards use the **actual official card graphics** archived from the published gallery. The digital table, controls, layout, and interaction code are this adaptation's interface. Card images retain their original visual identity and artist credits. The catalog contains 133 distinct moods; the image archive also includes the alternate Love headliner and the Hurt Feelings helper, for 135 gallery images total.

The interface uses DM Sans, Barlow Condensed, and Permanent Marker through Google Fonts with fallback fonts. The base stylesheet also retains its Libre Caslon fallback theme. These font requests are separate from the game's own server. No generated substitute illustrations are presented as the original card artwork.

### Understand each point and effect

Tap your point total or an opponent’s points to open **Score breakdown**. Player tabs let you compare everyone’s public scores. The server uses the same calculation for totals and explanations: each mood’s current contribution, suppression and value conditions, additive Exhilaration/Bliss bonuses, selected Enthusiasm/Passion bonuses during scoring, and Sneakiness score swaps. Cards in the list open the full inspector. The live panel updates with the visible table.

Round results and **Last round** also have tappable scores. Recorded contributions remain fixed when after-scoring effects move cards; score swaps are explicit adjustments. Older saved rounds still display their recorded totals and explain when a breakdown is unavailable. Awe’s skipped rounds do not show fabricated score records. No opponent hand contents or deck order are included.

Affected moods briefly glow with a change badge, while a **Feel the shift** summary identifies discards, transfers, suppression/restoration, color or copy changes, and point differences. It appears after the shared reveal releases the visible table, works with reduced motion, and can be dismissed or expanded for larger effects. Hidden card destinations are never guessed. Invitations contain only the room URL; QR generation happens in the browser without a third-party QR service. Unsupported sharing and blocked clipboard access retain a selectable link.

### How a turn feels

Cards move between the visible hand, table, and discard pile, and remaining cards slide into their new positions. Suppression and the secondary printed value keep their sideways and upside-down orientations. During a played-card reveal, the previous table stays visible behind it; card positions and score changes appear when reading finishes. Reconnecting establishes the current table without replaying historical card movement. Only each player's permitted public view is used for these animations.

The host chooses a pace in the lobby: **Relaxed** (9-second reveals / 12-second results), **Standard** (6 / 9), or **Quick** (3 / 6.5). Every connected human can press **I'm ready** to finish a reveal early; one player cannot dismiss it for everyone else, bots do not hold it open, and a minimum reveal still applies. If a card ends a round, its reveal precedes the full result sequence. Pacing survives reconnects, server restarts, and rematches.

The host can also switch on a **turn timer**. It is a shot clock with a time bank, not a fixed turn length, because a Mood Swings turn can hold several plays and decisions:

| Timer    | Each decision | Time bank per player | Bank top-up each round |
| -------- | ------------: | -------------------: | ---------------------: |
| No timer |             — |                    — |                      — |
| Relaxed  |          90 s |                 3:00 |                  +30 s |
| Standard |          45 s |                 1:30 |                  +20 s |
| Brisk    |          25 s |                 0:45 |                  +10 s |

Every decision the table waits on (playing a card, ending the turn, answering an effect) gets a fresh allowance, so a long combo is never punished. The clock runs only while the table is actually waiting on that player: never during a card reveal or the round results, and an early "I'm ready" starts it sooner, never later. When the allowance runs out, that player's own bank drains instead, which forgives the occasional hard decision without letting anyone stall every turn. When the bank is empty too, the table moves on for them: an optional effect is skipped, a mandatory one is answered the way the Normal bot would, and an unfinished turn simply ends. It never plays a card from their hand. A player who times out twice in a row is treated as away and gets a ten-second allowance until they next act for themselves, so an absent or disconnected friend costs the table seconds, not minutes. Bots are never timed, the clock stops if no human is connected, and a server restart gives the waiting player a fresh allowance. The browser receives remaining time rather than timestamps, so a wrong device clock cannot distort the countdown. At ten seconds the player on the clock gets one warning: the countdown turns coral, the turn tone plays if sound is on, and phones vibrate.

Card-effect choices highlight eligible moods on the table. Clicking a highlighted mood selects it for the existing confirmation flow; the choice panel remains available. The latest move and a **Last played** inspection shortcut stay alongside the board. Score changes have brief signed badges.

**Table settings** offers optional synthesized sound cues, effect volume, and reduced motion. Sound starts off and requires a user gesture. Preferences stay in this browser; system reduced-motion preferences are respected. The settings dialog supports Escape, keyboard focus containment, and focus return. Motion never changes the server's rules or reveals another player's hand.

## Architecture

The game is a browser application, so friends need a link rather than a Unity or Unreal installation. TypeScript is used across the interface, rules engine, bot policy, and server.

```mermaid
flowchart LR
  H[Human browser: React] -->|Actions over WebSocket| R[Colyseus room]
  B[Bot policy: player view only] -->|Actions| R
  R --> E[Rules engine]
  E --> S[Validated next state]
  S --> P[(PostgreSQL snapshot)]
  P --> V[Individual player views]
  V --> H
  V --> B
```

| Layer            | Responsibility                                                                   |
| ---------------- | -------------------------------------------------------------------------------- |
| React + Vite     | Lobby, table, hand, decisions, catalog, help, and reconnect UI                   |
| Express          | Room creation/recovery endpoints, healthcheck, static files                      |
| Colyseus         | WebSocket connections and authoritative room lifecycle                           |
| Pure game engine | Card effects, legal actions, timing, scores, and deterministic state transitions |
| Bot policy       | Choose actions from an appropriately restricted player view                      |
| PostgreSQL       | Durable JSON game snapshots, including pending decisions                         |
| File store       | Atomic local snapshots when no database URL is configured                        |

Each room serializes mutations. A submitted move includes its state revision, so stale actions are rejected and the player receives a fresh view. The engine clones the current state, validates the action, and processes its task queue until another decision is needed. The room persists the accepted result before broadcasting player-specific views. A rejected action does not partially mutate the live game.

Saved states include pending decisions and continuations. A restart therefore does not require reconstructing the game from a visual log. The server can restore a room on demand when a player reconnects.

## Privacy, sessions, and recovery

There is no email login. The browser creates a random session credential and stores it locally with the nickname. The server derives the player identity from that credential; matching a nickname is not enough to reclaim a seat.

Your private hand is sent to your browser. Opponents receive your hand count, not its contents. The actual deck order and internal effect queue stay on the server. This protects players from seeing hidden information through ordinary client state; the server and its database necessarily hold the complete game state.

Refresh or reopen the invite using the same browser profile to return to your seat. Clearing browser storage, using another browser, or switching profiles loses access to that credential. There is no account recovery system. A second tab using the same credential replaces the earlier connection. During a match, disconnected humans keep their seats, and the game waits if they need to act. In a lobby, disconnected guests release their seats; the host retains theirs.

The hosted PostgreSQL store permits recovery of snapshots updated within the last 30 days. **That is a recovery cutoff, not automatic deletion:** expired database records are not currently purged. Local file snapshots have no time cutoff. Nicknames, game histories, player identifiers, and full game states are part of these snapshots. The hosting platform may also maintain operational logs. Never publish database snapshots, browser credentials, or Playwright traces containing live sessions.

## Run locally

Use Node.js 22 and npm. Python is only needed to rerun the source collector or the fly-circuit extraction.

```sh
git clone https://github.com/JollyRogerz/mood-swings.git
cd mood-swings
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. Without `DATABASE_URL`, the server writes snapshots to `.runtime/rooms/`. That folder is ignored by Git.

For live interface development, use two terminals:

```sh
npm run dev
```

```sh
npm run dev:client
```

Open the Vite URL printed by the second command. The development proxy forwards game traffic to the server.

| Environment variable | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `PORT`               | Server port; defaults to 3000 and is supplied by Railway in production |
| `DATABASE_URL`       | PostgreSQL connection string; omit to use local files                  |
| `TEST_BASE_URL`      | Override the browser test target; defaults to localhost:3000           |

`.env.example` documents the values but contains placeholders. The server reads process environment variables; it does not automatically load a `.env` file. Export values in your shell or configure them in your host. Do not commit real credentials.

## Verification and tests

The current automated suite contains **553 engine, regression, simulation, bot, fly-circuit, planning, selection, score explanation, practice, and restart tests**. **19 Playwright scenarios** exercise the actual browser application across Chromium and WebKit. Passing tests are evidence of the covered behavior, not a claim that every combination of 133 cards has been exhaustively proven. The [14 September 2026 rules audit](docs/rules-audit-2026-09-14.md) covers all 133 cards and 497 official notes, the corrections made, and published ambiguities.

| Suite                           | What it checks                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `tests/engine.test.ts`          | Setup, values, costs, permissions, scoring, privacy, interactions, and traversal of all 133 card handlers                      |
| `tests/regressions.test.ts`     | Concrete card outcomes, copy and source lifetimes, delayed effects, and file persistence                                       |
| `tests/rules-audit.test.ts` | Awe and all delayed-effect families, card values and targeting boundaries, costs, suppression, transfers, simultaneous hidden choices, and preview privacy |
| `tests/simulation.test.ts`      | 60 seeded complete games with two to four players and card-conservation invariants                                             |
| `tests/bot.test.ts`             | Difficulty behavior, hidden-information independence, card-choice paths, and complete bot matches                              |
| `tests/fly.test.ts`             | Connectome circuit integrity, feature wiring, sparse codes, legal fly decisions, and a win-rate check against Easy             |
| `tests/plan.test.ts`            | Previewing a play from the hand, complete planned selections, malformed-input rejection, and mismatch fallback                        |
| `tests/server-restart.test.ts`  | Launch a real server, play, terminate it, relaunch, and recover the room                                                       |
| `tests/selection.test.ts` | Selection limits, pair and player constraints, authoritative preview values, response identity, and actor-only metadata |
| `tests/e2e/clarity.spec.ts` | Isolated populated table, point-budget guidance, selected-target submission, revision updates, phone decision overflow, and round recap in Chromium and WebKit |
| `tests/e2e/polish.spec.ts` | Sound and motion preferences, nested keyboard focus, empty-search recovery, and persistence |
| `tests/e2e/portable.spec.ts` | Touch selection and shared play, small-screen dialogs and scroll restoration, opponent navigation, reactions, phone rotation, tablet layout, round results and recaps, and home-screen assets in Chromium and WebKit |
| `tests/e2e/community.spec.ts` | Public/private room discovery and joining, host visibility controls, donation address, and mobile layout |
| `tests/e2e/multiplayer.spec.ts` | Two-browser play/reconnect, card catalog/help/mobile layout, four-player match/rematch, and solo play against a selectable bot |

```sh
npm test
npm run build
npx playwright install chromium webkit
npm start
```

With the server running, in another terminal:

```sh
npm run test:e2e
```

To verify a deployment:

```sh
TEST_BASE_URL=https://mood-swings-production.up.railway.app npm run test:e2e
```

Browser tests create real rooms and matches on their target. The populated-decision regression additionally starts its own built server with temporary storage, without modifying the target server. Screenshots and retained failure traces go to ignored `output/playwright/`. The GitHub Actions workflow installs dependencies, builds, runs the automated rules suite, starts the built server, and runs all Chromium scenarios plus the portable-device and populated-decision scenarios in WebKit.

The handler traversal tests alone do not prove every card's semantics; targeted outcome tests and seeded games complement them. New reported interactions should become focused regression fixtures before being fixed.

## Railway hosting

The live deployment uses a Railway application service and a PostgreSQL service. The included multi-stage Dockerfile builds the browser and server bundles and runs the server as the unprivileged Node user. The Railway configuration checks `GET /api/health`.

To deploy your own authorized instance, create a Railway project with an app service and PostgreSQL. Configure the app's `DATABASE_URL` as a reference to the database service, such as `${{Postgres.DATABASE_URL}}`, when the database service is named `Postgres`. Railway supplies `PORT`; the app listens on that port. Generate a public domain for the app and keep the database connection private.

```sh
railway login
railway link
railway up --service mood-swings
```

Use **one app replica**. Active room ownership lives in one process; shared coordination for horizontal scaling is not implemented. PostgreSQL persists state, but it does not by itself coordinate two active owners of the same room. The file-store fallback is for local development, not an ephemeral production filesystem.

A deploy restarts the app. Browsers reconnect and request restoration from saved state. Keep database backups appropriate to how much game history you want to preserve. Future changes to the persisted state schema may require migrations; this first release does not implement a general schema migration system. Production is connected to `JollyRogerz/mood-swings`, branch `main`, with Railway GitHub autodeploys and **Wait for CI** enabled. Pushing or merging into `main` automatically queues a deployment; Railway waits for the GitHub Actions check suites before deploying. Feature-branch pushes and unmerged pull requests do not update production. The existing Dockerfile and PostgreSQL configuration remain in use.

For normal releases, push the reviewed changes to `main` and check GitHub Actions and Railway’s deployment status; no separate `railway up` is needed. The CLI command above remains a manual fallback and deploys the local checkout, so use it only intentionally.

## Source collection and provenance

The source collector archives ten official pages, extracts card definitions and rulings, and downloads the gallery assets used by the interface. The checked-in archive makes it possible to inspect which published wording informed an implementation. It is research material, not a separate license to redistribute the original work.

| Path                             | Contents                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `data/raw/`                      | Official HTML page snapshots                                                     |
| `data/processed/manifest.json`   | Source URLs, collection metadata, and checksums                                  |
| `data/processed/cards.json`      | 133 card definitions, extracted dice strings, normalized values, and 497 rulings |
| `data/processed/validation.json` | Collector coverage checks                                                        |
| `assets/cards/`                  | 135 official gallery images                                                      |
| `assets/`                        | Additional archived supporting images                                            |
| `scripts/scrape.py`              | Collection, extraction, normalization, and validation                            |
| `data/fly/circuit.json`          | Mushroom body wiring extracted from the MaleCNS v1.0 connectome, with checksums  |
| `data/fly/weights.json`          | Trained Kenyon cell → MBON synapses and the evaluation that produced them        |
| `scripts/fly/`                   | Circuit extraction, training, and baseline measurement for the fly brain bot     |

To reproduce collection:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/scrape.py
```

Add `--refresh` to fetch source pages again. Review refreshed data and rerun tests before shipping. Editorial changes to a page do not automatically update executable behavior: card implementations live in `src/game/engine.ts`.

## Repository map

```text
src/client/                 Browser application and styles
src/game/types.ts           Serializable game state and action types
src/game/catalog.ts         Typed access to the extracted catalog
src/game/engine.ts          Rules and card-effect implementation
src/game/bot.ts             Difficulty policies and sampled continuations
src/game/heuristics.ts      View-only card and decision heuristics shared by the bots
src/game/fly.ts             Fruit-fly mushroom body encoder, circuit, and readout
src/game/plan.ts            Preview a play from the hand and replay its planned answers
src/server/index.ts         HTTP, WebSocket, and static-serving entry point
src/server/room.ts          Sessions, serialized actions, bots, and broadcasts
src/server/store.ts         PostgreSQL and local-file persistence
scripts/                    Source collection and fly-brain extraction and training
tests/                      Automated rules, bot, restart, and browser tests
data/                       Source snapshots and processed research
assets/                     Original card and supporting images
docs/                       Rule decisions and implementation background
.github/workflows/          Continuous integration
Dockerfile                  Production build and runtime
railway.json                Railway healthcheck and restart configuration
CREDITS.md                  Original creators, rights, and free-access policy
```

## Report an issue or contribute

Please open an [issue](https://github.com/JollyRogerz/mood-swings/issues) with the relevant cards, round, turn order, expected result, and observed result. A minimal sequence of moves is particularly useful. Avoid posting session credentials, hidden hands from an ongoing match, database files, or browser traces. Room codes can grant access to open lobbies; share them thoughtfully.

For code contributions, explain the official ruling or reproducible problem, add a meaningful regression test, and run the rules and browser suites affected by the change. Keep bots behind the player-view boundary and use the authoritative engine for every action. Preserve original artist credits and source provenance. Do not add paid access, advertising, paid gameplay advantages, or claims of official affiliation. Voluntary maintainer donations are available without rewards.

Potential future work includes more interaction fixtures, stronger bot evaluations, accessibility improvements, explicit snapshot migrations, and additional formats after their rules are implemented and tested. These are ideas, not promises about availability.

## Thank you to the original creators

Thank you to **Mark Rosewater**, **Corey Bowen**, **Colby Nichols**, the artists, editors, playtesters, and everyone at Wizards of the Coast and Secret Lair who brought Mood Swings to life. This adaptation exists because the original game made us want to play more.

Mark's [history of Mood Swings](https://magic.wizards.com/en/news/making-magic/the-history-of-mood-swings) credits many of those contributors. Colby's [visual identity article](https://magic.wizards.com/en/news/feature/crafting-the-visual-identity-of-mood-swings) explains the look that makes these cards so distinctive. See [CREDITS.md](CREDITS.md) for more acknowledgments and verified public links.

**To anyone from the original team who finds this project: you are warmly invited to try the browser adaptation with your friends. Thank you for making a game we love.** These credits and links express appreciation; they do not imply the creators have reviewed, approved, or played this project.

## Optional maintainer donations

The home-page support panel displays the USDC donation address `0x5e61495C929fC93355f245e5D6A31Bf142e73E69`, as supplied and confirmed by the maintainer. The panel only displays and copies the address; it never connects a wallet or initiates a transfer. Donations go to JollyRogerz, not Wizards of the Coast, and grant no features or rewards. This does not establish rights-holder permission for the adaptation or its funding model.
