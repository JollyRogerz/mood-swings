# Mood Swings: digital implementation reference

This document records the initial research and engine design. The playable engine
is now in `src/game/engine.ts`; current scope and interpretations are documented
in `docs/rule-interpretations.md`.
The database contains the published card text and explanatory rulings. Those strings
are reference data, not executable card effects. Executable behavior is maintained separately from the archived source data.

## Source hierarchy

- [Extended rules](https://magic.wizards.com/en/news/feature/mood-swings-extended-rules): base game procedure and vocabulary.
- [Card notes](https://magic.wizards.com/en/news/feature/mood-swings-card-notes): individual effects and interactions.
- [Card gallery](https://magic.wizards.com/en/news/card-image-gallery/mood-swings): visual reference and printed details.
- [Alternate formats](https://magic.wizards.com/en/news/feature/other-ways-to-play-mood-swings): duel, draft, and team changes.
- [Product page](https://secretlair.wizards.com/eu/en/mood-swings): product overview and linked design material.

Raw HTML is kept so that extraction and interpretation can be audited. The manifest
records source URLs, file timestamps, byte counts, and SHA-256 hashes. A timestamp
describes our local file, not the publication date or last revision on Wizards' site.

## Catalog

133 distinct playable cards: white 26, blue 26, black 27, red 27, green 27.
Rarity totals: 48 common, 40 uncommon, 30 rare, 15 mythic rare.
There are 135 gallery images: 133 standard cards, a Love headliner treatment with
the same mechanics, and the separate Hurt Feelings helper. Do not shuffle either
the extra Love treatment or the helper into a default 133-card pool.

A retail deck has 45 unique cards: 23 common, 14 uncommon, 6 rare, 2 mythic rare.
For a digital simulated retail deck, sample that distribution without replacement;
this is a proposed approximation, not a claim to reproduce factory collation.
Traditional play uses a shared deck; it is not Magic with lands, mana, or combat.

## Traditional game procedure

Shuffle one shared deck and deal five cards to each player. Choose the initial
starting player using the rulebook's emotion prompt or its permitted random option.
Each player takes one turn clockwise per round. On a turn, play one card or pass;
card abilities can grant additional plays. Moods remain on the table across rounds.

After the turns, evaluate each player's moods and scoring modifiers. Highest score
wins, with earlier turn order breaking a tie. Resolve after-scoring effects before
final consolation draws, allowing effects such as Sneakiness to change the winner.
Three round wins end the game. Otherwise, each loser draws one card and the winner
starts the next round, subject to card overrides.

With at least three players, the lowest scorer receives Hurt Feelings for one
additional play on their next turn. Later turn order breaks a lowest-score tie.
Traditional minimum deck sizes are 15 for two players, then 15 more per additional
player; the published recommendation is at least 45 for two to four players.

## Engine design decisions

These are proposed engineering choices, not additional game rules.

Use separate immutable card definitions and mutable card instances. An instance
needs its definition ID, current zone, current controller, entry round, chosen
values/colors, copy identity, suppression links, and any temporary transfer record.
For duel mode, preserve physical ownership separately from current control.

Keep hand, deck, discard, and play as distinct zones. The rules distinguish a card
discarded from hand from a mood sent from play to the discard pile. Track both events
separately. Movement between players while remaining in play is another event;
it does not replay a card or repeat its entry ability.

Store a round's seating order explicitly. Both winning ties and Hurt Feelings ties
depend on the order of turns in that round. The winner ordinarily starts the next
round; the order should not be inferred from an instance's entry timestamp.

Use a seeded random generator for shuffles, random transfers, and random draws from
discard. Save the seed, player decisions, and resulting events for reproducible
bug reports. Player views must conceal other hands and the order of the deck.
Bots must receive the same permitted information as a human player.

### Playing a card

The implementation needs explicit steps for play legality, optional copying,
cost payment, entering play, continuous effects, entry effects, and further
continuous-effect updates. Creativity's special timing makes a single generic
"play then evaluate text" function insufficient. Its printed identity can affect
whether it may be played, while the copied identity determines costs and relevant
play triggers.

Extra plays should be individual permissions, with their own allowed source zone
and restrictions. A single integer `extraPlays` cannot represent combinations
such as Angst, Benevolence, and an unrestricted extra play. Players may choose
the order in which to spend permissions and may decline optional ones.

Choices should be serializable prompts: actor, legal targets, minimum/maximum
selection, source zone, and continuation. Distinguish target chooser from affected
player; Compulsion makes the selected player choose the card they give away.
Simultaneous selections such as Confusion must be committed before revealing the
results to the other players.

### Values and scoring

Preserve printed dice separately from current value. A pair such as `[6][1]` totals
7, whereas `[3]/[6][1]` denotes two alternatives, 3 and 7. Some zero-valued cards
have formulas or extra-scoring abilities; a printed zero is not evidence that
their eventual contribution must be zero.

Separate value calculation from extra scoring. Enthusiasm, Passion, Exhilaration,
and Bliss grant additional contributions without increasing their own values.
Their contributions stack additively; two extra-scoring effects are not an
automatic multiplicative doubling of a total.

Re-evaluate relevant continuous effects after board changes and between effect
steps when instructed. Validate termination of the evaluation procedure. If an
interaction cannot stabilize, expose a diagnostic rather than inventing a winner.

Suppression sets current value to zero. It does not erase the card's color or remove
it from play. Do not implement suppression as deleting the card's definition or
disabling every ability. Suppression links may expire at round end or when the
source leaves its original controller. Once that source changes players, moving
it back does not revive the old suppression link.

Keep the scoring result as a snapshot that can be changed by after-scoring effects.
Sneakiness can change who wins; do not draw consolation cards or finalize the game
before resolving the necessary after-scoring work. Effects within a player's group
can require a player-selected order. Track resolved effects explicitly so that
ownership changes do not skip or repeat them.

Awe requires a separate no-scoring round path. Corruption requires a configurable
round-win award. Do not bake "every round produces one win" into the engine.

### Copies and transfers

Creativity copies printed characteristics, not a target's temporary value or
suppressed state. A copy persists independently of its original while in play,
and resets when it leaves play. Resolve copying another copy to its copied identity.

Transfers generally preserve instance state. Record temporary transfer obligations
using instance IDs and players; do not look up cards by name. A card returned to a
hand normally goes to its current controller's hand in traditional play. Duel
format ownership rules additionally determine deck and discard destinations.

## Required interaction fixtures before calling the game complete

1. Costs fail without the required resources; optional effects can be declined.
2. Charity permits another play, and passing remains possible.
3. Patience and Glee use the correct entry-round values.
4. Anger selects its whole target set using values at selection time; destruction
   cannot lower a later target's value to sneak it into the same selection.
5. Worry and Hostility refresh values between their effect steps.
6. Pacifism expires correctly when its source changes controllers and does not
   reactivate on return; its targets still count toward color conditions.
7. Duplicity resolves two separate effects with fresh choices and intervening
   value updates, rather than combining their limits into one larger effect.
8. Creativity pays copied costs, preserves its own play restrictions, and resets
   on leaving play.
9. Multiple extra-scoring effects add their contributions without changing values.
10. Sneakiness and Bashfulness resolve differently depending on their chosen order.
11. Awe skips scoring-related work and uses its selected next starting player.
12. Corruption can award the final wins needed to finish the game.
13. Multiplayer highest-score ties favor earlier turns; lowest-score ties for
    Hurt Feelings favor later turns.
14. Confusion and Avoidance commit selections before simultaneous transfers.
15. Cards leaving and re-entering play get fresh instance state for temporary effects.

## Alternate formats and scope

The alternate-format article is archived in full. Its formats are Structure Duel,
Power Duel, Quick Draft, Winston Draft, Open Team, and Closed Team. These need
explicit configuration, not cosmetic menu options. Duel changes deck/discard
ownership; draft adds a hidden-information selection stage; team games change
turn order, information sharing, scoring, and card draws. Hurt Feelings is absent
from team games. The current Power Duel text includes an editorial update, so
future implementation should use the archived current restrictions.

Start with traditional two-player play, then add three/four-player support and
alternate formats after the core card interactions pass. A local laptop client
can use the archived images and JSON without a runtime dependency on Wizards' site.

## Source anomalies and remaining verification

- Frustration and Glee put rarity before color in their headings; extraction
  accepts either order.
- Hope uses square brackets around its color/rarity instead of parentheses.
- Wrath's notes spell its die `[O]`; the card image visibly shows zero. Preserve
  `[O]` in `printed_dice`, normalize to `[0]` in `normalized_dice`.
- Several explanatory passages use "turn" where surrounding rules discuss a
  round. Preserve the wording and interpret interactions against the full context.
- Awe's notes say there are no current after-scoring abilities under "While in
  play," but Recklessness has exactly such an ability in both its text and its
  image (visually verified). Its interaction with a skipped scoring round merits
  an explicit interpretation and regression fixture; the source wording is
  inconsistent. Examples also substitute the name "Relentless" for Recklessness.
  Preserve these discrepancies rather than silently treating every example as
  authoritative executable logic.
- Full text-versus-image proofreading of all 133 cards has not been performed.
  Coverage checks confirm matching identities and counts, not flawless editorial
  consistency. Artist credits, collector numbers, and die colors remain available
  in the images but have not been transcribed into structured fields.
- Linked podcasts/videos are inventoried as references, not downloaded or
  transcribed. Commerce flows and unrelated site assets are outside this archive.

Original card text, artwork, and branding belong to their respective rights holders.
This source archive does not itself grant a license to redistribute those assets.
