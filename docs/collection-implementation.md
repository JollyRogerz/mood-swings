# Physical decks and public profiles

The collection is an optional layer over guest play. Validation and completion live in `game/collection.ts`; PostgreSQL and memory implementations share the `CollectionStore` interface. Stored decks contain catalog IDs, never arbitrary image URLs or browser-supplied card rules. A profile row lock serializes concurrent creation and enforces the ten-deck limit. Deck access is always scoped to the authenticated account.

Collections are private by default. Public profile responses omit private decks and completion entirely and use `Cache-Control: no-store`. They expose username, join date and aggregate games/wins/losses/win rate, never account IDs, devices, detailed bot records or sign-in data. Renames resolve through the case-insensitive username index. Deleting the account removes collections; PostgreSQL foreign keys also cascade deletion.

The editor lives on `/collection`, reached from the account menu, rather than nesting a long binder inside a small modal. It supports search, colour filters, selected-only filtering, a 45-card cap, progress, empty states, retryable errors and confirmed deletion. `/u/<username>` supports directly shared links and mobile layouts.

Changing card contents clears `verified_at`; renaming alone keeps it. Photo processing and badge display are the next ownership slice. The collection never changes the rules engine or who can play.
