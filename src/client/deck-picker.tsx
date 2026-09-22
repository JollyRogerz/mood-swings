import React, { useEffect, useState } from "react";
import type { View } from "../game/types";
import type { Deck } from "../game/collection";
import { collectionApi } from "./collection-api";
export function DeckPicker({
  view,
  enabled,
  choose,
}: {
  view: View;
  enabled: boolean;
  choose: (id: string | null) => void;
}) {
  const [decks, setDecks] = useState<Deck[]>([]),
    [error, setError] = useState("");
  const host = view.host === view.you;
  useEffect(() => {
    if (host && enabled)
      collectionApi("/api/account/collection")
        .then((c) => setDecks(c.decks))
        .catch(() =>
          setError(
            "Saved decks could not load. You can still play with the standard deck.",
          ),
        );
  }, [host, enabled]);
  const chosen = decks.find((d) => d.id === view.customDeck?.id);
  return (
    <section className="deck-picker" aria-label="Shared deck">
      {host && enabled && (
        <label>
          Shared deck
          <select
            aria-label="Shared deck"
            value={view.customDeck ? (chosen?.id ?? "unavailable") : ""}
            onChange={(e) => choose(e.target.value || null)}
          >
            <option value="">Standard · fresh 45-card deck</option>
            {view.customDeck && !chosen && (
              <option value="unavailable" disabled>
                {view.customDeck.name}
              </option>
            )}
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.cards.length} moods
              </option>
            ))}
          </select>
        </label>
      )}
      {host && !enabled && view.customDeck && (
        <button onClick={() => choose(null)}>Use standard deck</button>
      )}
      <p>
        {view.customDeck ? (
          <>
            <strong>{view.customDeck.name}</strong> brought by{" "}
            {view.customDeck.username} · {view.customDeck.count} moods, shared
            by everyone.
          </>
        ) : (
          "Standard shared deck · a fresh 45-card mix."
        )}
      </p>
      {view.customDeck && view.customDeck.count < view.players.length * 5 && (
        <p role="status">
          Choose a deck with at least {view.players.length * 5} cards for this
          table.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {host && enabled && (
        <small>
          To edit your decks, return home and open your profile. Choosing a
          private deck shares its name here, but not your collection.
        </small>
      )}
    </section>
  );
}
