# Rules interpretations and release scope

The release implements the traditional shared-deck game for 2–4 players with
all 133 unique cards available in the catalog. Each standard game samples a
45-card deck using the published retail rarity counts. Duel, draft, team rules,
spectators and user-built decks are not part of this release.

## Image-verified card data

Curiosity’s card-notes heading lists only its primary value, but the official
image also has a secondary die of six. The normalized data includes `[3]/[6]`
so Idealism and Encouragement apply correctly. Wrath’s `[O]` typo is normalized
to `[0]`. The unmodified extracted dice strings remain available separately.

## Published discrepancy: Awe and Recklessness

Awe cancels scoring and all after-scoring effects for that round. Entry-triggered
round-only effects expire without resolving. Recklessness's printed **While in
play** cleanup remains applicable at the next round that actually scores.

The broad statement in Awe's card notes that no existing cards have such an
ongoing cleanup conflicts with Recklessness's text and image. This implementation
follows the printed ongoing ability and the explanation of how a future such
ability would behave. A dedicated regression test covers it.

## Sequential timing and ownership

Costs are paid before entry. Current values are calculated from current board
state when each distinct effect step requests its choices. Bulk removal selects
all targets before movement. Fury, Confusion, and Avoidance collect all choices
before committing their simultaneous movement. Additional plays are separate
permissions with their own restrictions; players explicitly choose which to use.

After-scoring effects resolve by the current turn order, with a player choosing
between their available effects. Processing continues around the table as needed
when effects change controllers. Scoring totals are snapshots; subsequent removal
or transfer does not itself recalculate that round's already-counted totals.
Sneakiness explicitly swaps those totals before the final winner is awarded.

Cards that leave play and return are new incarnations for delayed effects.
Copies retain printed copied characteristics only while in play. Suppression
keeps the mood and its abilities present, while setting its value to zero.

Encouragement's link ends when the chosen mood leaves play. A later play of
that physical card is a fresh mood. Transfers between players retain the link.
Suspicion collects every private discard choice before revealing or moving any
of those cards. Malice excludes itself, following its specific card notes.

The [September 2026 audit](rules-audit-2026-09-14.md) records conflicting
after-scoring transfer examples in the published notes and the unresolved
Awe/Honor precedence. The implementation follows the extended rules' current
holder ordering for Bashfulness and ongoing Recklessness cleanup. Honor's ongoing
first-player instruction takes precedence over Awe's selection.

## Network and persistence behavior

The server validates every action and commits a JSON snapshot before broadcasting.
Only the acting player's own choices and hand are sent to that player. Other
hands, the deck order, random generator, and effect continuations stay on the server.
Refreshes and reconnections use a random browser-local session credential; opening
an invite link in a different browser does not grant access to an existing seat.
Keep using the same browser to recover that seat. An additional tab for the same
credential replaces the older connection.

Disconnected players keep their seats; the game waits if they must act. This
release does not automatically forfeit a disconnected human or replace them with a bot. Bots can
be added by the host before a game starts, with Easy, Normal, or Hard difficulty.
Room snapshots can be restored from PostgreSQL for 30 days after last activity.
Run one app replica: room coordination across multiple instances is not implemented.

## Validation limits

Tests cover card handler traversal, focused card outcomes, scoring and timing
regressions, seeded complete-game simulations, persistence, and real browser flows.
They do not exhaust every possible combination of 133 cards. Card notes retain
editorial inconsistencies; unusual interaction reports should include the room
code, round, and relevant cards so they can become new regression fixtures.

## Deciding from the hand

Players may answer a card's decisions before playing it. The interface previews
the play on a copy of the game and shows the same prompts the engine would raise,
in order; the answers travel with the play and are replayed into the live
prompts only when the prompt's title matches. Selections and decision sequences
are not truncated. The engine's timing is unchanged:
costs are still paid before entry, values are still read when each effect step
asks. Planning stops when randomness or movement of an initially hidden card
occurs, so future draws cannot appear in a later preview prompt. A prompt that
depends on such an outcome, or on another player's decision, is asked at the
table after the real play.
