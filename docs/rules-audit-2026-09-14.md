# Rules audit — 14 September 2026

## Reported round

The reported round was correctly skipped by **Awe**, played by Ember. Awe's resolved entry effect cancels scoring for that round, including extra scoring and after-scoring effects. Nobody wins or loses that round, nobody draws for losing, and nobody receives Hurt Feelings. The chosen player starts next, subject to the ongoing Honor interpretation below. Tranquility changes its own value; it does not cancel scoring. Removing Awe after its entry effect resolves does not restore scoring.

The game now names Awe in the round-results presentation and the end-of-round log, with an explanation of the skipped awards and draws.

## Sources and scope

- [Official card notes](https://magic.wizards.com/en/news/feature/mood-swings-card-notes).
- [Official extended rules](https://magic.wizards.com/en/news/feature/mood-swings-extended-rules).
- Local source catalog: `data/processed/cards.json`; extended rules: `data/processed/extended-rules.txt`.

Fresh downloads were compared with the saved references: **133 card entries, 497 card notes, and the extended-rules article matched**. The review covered each card's handler or continuous calculation, the referenced interactions, and the shared engine and network decision paths. The supported format is the traditional shared-deck game for two to four players, using a retail-collated 45-card deck or the full 133-card pool. Other published variants, custom decks, and teams are outside this implementation.

## Corrections

1. **Malice:** the resolving Malice now survives its own effect, as its specific notes require. Other Malice copies can still be discarded. The prior outcome test incorrectly expected the source to be discarded and has been corrected. The printed wording is broader than the self-exclusion in the notes; this follows the specific ruling.
2. **Suspicion:** selections stay private until every affected player has chosen. All selected cards then enter the discard pile together. Previously, later players could see earlier discards. Pending selections survive a JSON save/reload, and players without cards are skipped.
3. **Encouragement:** returning or discarding the chosen mood ends the link. Replaying that physical card creates a fresh mood and no longer inherits the old boost. Transferring the mood between players preserves the link. This follows the game's distinction between an in-play mood and a card outside play.
4. **Planned choices:** the server no longer silently truncates a selection or plan to 12 items. Any-number costs and long effect sequences retain the player's complete selection. Malformed input is rejected; the existing WebSocket payload bound remains in force.
5. **Hidden information in previews:** a preview stops at a random outcome or movement of an initially hidden card. Those later choices happen after the real play. Previously, repeating Zeal through Duplicity could expose a future draw in a preview prompt; changing only the RNG seed did not protect the ordered deck.

Regression tests reproduced the Malice, Suspicion, Encouragement, and preview-boundary failures before their fixes. Additional tests cover the planned-choice parser, broad card outcomes, and Awe with all six after-scoring card families, Corruption, all scoring bonuses, source removal, suppression expiry, and next-turn permissions. The original Awe scoring behavior was already correct.

## Shared rules reviewed

- Shared deck/discard, five-card starting hands, published rarity collation, random clockwise first player, and persistent moods.
- One ordinary play or pass; optional extra plays remain separately spendable. Hand/discard restrictions and printed-color/die checks precede entry.
- Mandatory costs before entry, Creativity's copying before costs, continuous values before entry effects, and recalculation between Hostility/Worry steps.
- Current-value targeting; one target per chosen player where required; pair constraints; simultaneous group selection and movement; optional effects can be declined.
- Suppression sets value to zero while leaving abilities/colors present. Source-controlled suppression ends when its source leaves its controller. Round suppression expires even after Awe.
- Copy/choice reset when leaving play; transfers preserve in-play state and do not replay entry effects. Delayed effects track the correct incarnation.
- Additive scoring bonuses; optional Enthusiasm/Passion selections; earlier-turn winner ties; later-turn lowest-score ties for Hurt Feelings; losers draw only after all scoring effects.
- Three wins ends the match, including Corruption reaching four. No consolation draws follow the winning round. Honor and Awe affect the next first player.
- Server validation, private prompts, planned actions, JSON persistence, bot legality, and presentation pauses between shared reveals and results.

## Published ambiguities and chosen interpretations

The source material has inconsistencies; this audit does not represent a ruling from the creators.

- **Awe / Recklessness:** Awe's notes say there are no ongoing after-scoring abilities, but Recklessness explicitly prints one. Follow Recklessness's printed ongoing cleanup: Awe skips it now; it runs at the next actual scoring. The borrowed mood's round-only return expires unresolved. This is covered by regression tests.
- **After-scoring ordering after transfers:** the extended rules give the current holder of Bashfulness control of its cleanup, including an example of a thief ordering it before Recklessness's return, and say to continue around the table for effects that change owners. Some Bashfulness/Recklessness card-note examples instead let the original player order cleanup after giving the card away with Betrayal. These examples cannot all be applied literally with the same ordering rule. Keep the extended-rules approach: current holder orders Bashfulness and ongoing Recklessness cleanup; entry-created return/discard/hand/swap obligations retain their originating actor. The stolen-Bashfulness example has a focused test. Creator clarification would be needed to settle the conflicting give-away examples.
- **Awe with Honor:** there is no explicit ruling for their precedence in the reviewed notes. Keep the existing interpretation that the most recently played Honor's ongoing first-player instruction overrides the next-round selection. The no-scoring part of Awe still applies.
- **Choosing a number with no matches:** Disorientation and Repentance offer existing values plus Skip. Naming an absent number has the same board outcome as Skip; Rebellion offers all four required numbers, including those without matches.

## Verification

The expanded suite contains 528 tests (83 added during this audit). The local production build passes, and all 528 tests pass. The local run used `npm test -- --testTimeout=30000` after the existing circuit-integrity check exceeded its default five-second timeout under heavy laptop load; assertion coverage and CI timeouts were left unchanged. The local browser run passed 10 of 12 scenarios; two four-player scenarios exceeded their overall timeouts on the same loaded laptop (Chromium reached the rematch lobby; WebKit also failed to finish its trace archive). No test assertions or time limits were relaxed in the repository. The GitHub Actions workflow reruns the production build, standard-timeout unit suite, and all 12 browser scenarios; Railway is configured to wait for that workflow. Passing tests establish covered behavior, not proof of every possible combination of 133 cards. The complete-catalog traversal test reaches every handler but often declines optional effects; the focused outcome tests and manual rules comparison provide separate evidence.

## Card-by-card review index

Every entry below was compared with its text and notes. The descriptions identify the behavior reviewed; they do not imply a dedicated test for every bullet in the official notes. Focused tests live in `tests/engine.test.ts`, `tests/regressions.test.ts`, `tests/rules-audit.test.ts`, and `tests/plan.test.ts`; complete-game simulations and bot tests exercise additional combinations.

| Card | Behavior reviewed |
| --- | --- |
| Altruism | Entry choice fixes a secondary value; hand checks use printed traits |
| Ambition | Separate additional-play permissions and their restrictions |
| Ambivalence | Live value conditions, with suppression and higher-die overrides |
| Anger | Bulk targets chosen using current values/colors before movement |
| Animosity | Live value conditions, with suppression and higher-die overrides |
| Angst | Separate additional-play permissions and their restrictions |
| Anxiety | Bulk targets chosen using current values/colors before movement |
| Apathy | Blank four-point moods |
| Arrogance | Ownership transfers and simultaneous/private decisions |
| Avoidance | Ownership transfers and simultaneous/private decisions |
| Awe | Scoring cancellation or delayed cleanup/score exchange |
| Bashfulness | Scoring cancellation or delayed cleanup/score exchange |
| Benevolence | Separate additional-play permissions and their restrictions |
| Betrayal | Ownership transfers and simultaneous/private decisions |
| Bitterness | Bulk targets chosen using current values/colors before movement |
| Bliss | Scoring bonuses add independently, without changing mood values |
| Boredom | Blank four-point moods |
| Bravado | Separate additional-play permissions and their restrictions |
| Celebration | Live value conditions, with suppression and higher-die overrides |
| Chaos | Ownership transfers and simultaneous/private decisions |
| Charity | Separate additional-play permissions and their restrictions |
| Cheer | Entry choice fixes a secondary value; hand checks use printed traits |
| Chivalry | Live value conditions, with suppression and higher-die overrides |
| Complacency | Blank four-point moods |
| Compulsion | Ownership transfers and simultaneous/private decisions |
| Condescension | Entry choice fixes a secondary value; hand checks use printed traits |
| Confusion | Ownership transfers and simultaneous/private decisions |
| Contempt | Bulk targets chosen using current values/colors before movement |
| Conviction | Deck-bottom movement, drawing player, and empty-deck behavior |
| Corruption | Deck-bottom movement, drawing player, and empty-deck behavior |
| Courage | Bulk targets chosen using current values/colors before movement |
| Creativity | Copy printed characteristics/costs; repeat entry effects with fresh choices |
| Cruelty | Bulk targets chosen using current values/colors before movement |
| Curiosity | Entry choice fixes a secondary value; hand checks use printed traits |
| Cynicism | Entry choice fixes a secondary value; hand checks use printed traits |
| Delight | Entry choice fixes a secondary value; hand checks use printed traits |
| Denial | Bulk targets chosen using current values/colors before movement |
| Determination | Live value conditions, with suppression and higher-die overrides |
| Dignity | Entry choice fixes a secondary value; hand checks use printed traits |
| Discipline | Live value conditions, with suppression and higher-die overrides |
| Disgust | Live value conditions, with suppression and higher-die overrides |
| Disillusionment | Bulk targets chosen using current values/colors before movement |
| Disorientation | Bulk targets chosen using current values/colors before movement |
| Disregard | Live value conditions, with suppression and higher-die overrides |
| Doubt | Deck-bottom movement, drawing player, and empty-deck behavior |
| Duplicity | Copy printed characteristics/costs; repeat entry effects with fresh choices |
| Eagerness | Separate additional-play permissions and their restrictions |
| Embarrassment | Entry choice fixes a secondary value; hand checks use printed traits |
| Encouragement | Continuous overrides and selected-target lifetime |
| Enjoyment | Live value conditions, with suppression and higher-die overrides |
| Enthusiasm | Scoring bonuses add independently, without changing mood values |
| Envy | Values calculated from hand, board, or discard counts |
| Euphoria | Values calculated from hand, board, or discard counts |
| Excitement | Live value conditions, with suppression and higher-die overrides |
| Exhilaration | Scoring bonuses add independently, without changing mood values |
| Faith | Suppression targets, source ownership, duration, and zero values |
| Fascination | Entry choice fixes a secondary value; hand checks use printed traits |
| Fear | Separate additional-play permissions and their restrictions |
| Fickleness | Bulk targets chosen using current values/colors before movement |
| Fondness | Live value conditions, with suppression and higher-die overrides |
| Friendliness | Separate additional-play permissions and their restrictions |
| Frustration | Live value conditions, with suppression and higher-die overrides |
| Fury | Bulk targets chosen using current values/colors before movement |
| Generosity | Separate additional-play permissions and their restrictions |
| Glee | Live value conditions, with suppression and higher-die overrides |
| Gluttony | Scoring cancellation or delayed cleanup/score exchange |
| Grace | Separate additional-play permissions and their restrictions |
| Grief | Separate additional-play permissions and their restrictions |
| Guile | Costs paid before entry; full selection and zone requirements |
| Guilt | Suppression targets, source ownership, duration, and zero values |
| Happiness | Live value conditions, with suppression and higher-die overrides |
| Harmony | Separate additional-play permissions and their restrictions |
| Hate | Deck-bottom movement, drawing player, and empty-deck behavior |
| Hesitation | Bulk targets chosen using current values/colors before movement |
| Honor | Continuous overrides and selected-target lifetime |
| Hope | Separate additional-play permissions and their restrictions |
| Hostility | Bulk targets chosen using current values/colors before movement |
| Idealism | Continuous overrides and selected-target lifetime |
| Imagination | Continuous overrides and selected-target lifetime |
| Indecisiveness | Bulk targets chosen using current values/colors before movement |
| Indifference | Blank four-point moods |
| Infatuation | Entry choice fixes a secondary value; hand checks use printed traits |
| Insecurity | Scoring cancellation or delayed cleanup/score exchange |
| Instability | Ownership transfers and simultaneous/private decisions |
| Intimidation | Separate additional-play permissions and their restrictions |
| Joy | Separate additional-play permissions and their restrictions |
| Kindness | Separate additional-play permissions and their restrictions |
| Laziness | Blank four-point moods |
| Love | Live value conditions, with suppression and higher-die overrides |
| Loyalty | Live value conditions, with suppression and higher-die overrides |
| Malice | Bulk targets chosen using current values/colors before movement |
| Meekness | Suppression targets, source ownership, duration, and zero values |
| Melancholy | Separate additional-play permissions and their restrictions |
| Misery | Live value conditions, with suppression and higher-die overrides |
| Neurosis | Costs paid before entry; full selection and zone requirements |
| Nostalgia | Separate additional-play permissions and their restrictions |
| Obsession | Live value conditions, with suppression and higher-die overrides |
| Pacifism | Suppression targets, source ownership, duration, and zero values |
| Panic | Bulk targets chosen using current values/colors before movement |
| Paranoia | Deck-bottom movement, drawing player, and empty-deck behavior |
| Passion | Scoring bonuses add independently, without changing mood values |
| Patience | Live value conditions, with suppression and higher-die overrides |
| Pity | Live value conditions, with suppression and higher-die overrides |
| Pride | Separate additional-play permissions and their restrictions |
| Rage | Bulk targets chosen using current values/colors before movement |
| Rationalization | Ownership transfers and simultaneous/private decisions |
| Rebellion | Bulk targets chosen using current values/colors before movement |
| Recklessness | Scoring cancellation or delayed cleanup/score exchange |
| Regret | Costs paid before entry; full selection and zone requirements |
| Rejection | Bulk targets chosen using current values/colors before movement |
| Repentance | Suppression targets, source ownership, duration, and zero values |
| Sadness | Values calculated from hand, board, or discard counts |
| Scorn | Suppression targets, source ownership, duration, and zero values |
| Self-Loathing | Costs paid before entry; full selection and zone requirements |
| Serenity | Live value conditions, with suppression and higher-die overrides |
| Shame | Suppression targets, source ownership, duration, and zero values |
| Shock | Bulk targets chosen using current values/colors before movement |
| Sloth | Values calculated from hand, board, or discard counts |
| Sneakiness | Scoring cancellation or delayed cleanup/score exchange |
| Spite | Bulk targets chosen using current values/colors before movement |
| Stubbornness | Separate additional-play permissions and their restrictions |
| Superiority | Live value conditions, with suppression and higher-die overrides |
| Suspicion | Ownership transfers and simultaneous/private decisions |
| Thrill | Separate additional-play permissions and their restrictions |
| Tranquility | Live value conditions, with suppression and higher-die overrides |
| Triumph | Live value conditions, with suppression and higher-die overrides |
| Validation | Separate additional-play permissions and their restrictions |
| Vanity | Values calculated from hand, board, or discard counts |
| Vulnerability | Live value conditions, with suppression and higher-die overrides |
| Wonder | Values calculated from hand, board, or discard counts |
| Worry | Bulk targets chosen using current values/colors before movement |
| Wrath | Bulk targets chosen using current values/colors before movement |
| Zeal | Deck-bottom movement, drawing player, and empty-deck behavior |
