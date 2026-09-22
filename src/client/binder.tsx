import { collectionApi } from "./collection-api";
import { DeckPhoto, PhotoBadge } from "./deck-photo";
import React, { useEffect, useState } from "react";
import { catalog, COLORS } from "../game/catalog";
import {
  completion,
  retailShaped,
  type Collection,
  type Deck,
} from "../game/collection";
import "./collection.css";
export function CollectionSummary({ decks }: { decks: Deck[] }) {
  const c = completion(decks);
  return (
    <section className="collection-summary" aria-label="Collection completion">
      <h3>
        {c.owned} / {c.total} moods collected
      </h3>
      <progress aria-label="Overall completion" max={c.total} value={c.owned} />
      <div className="completion-groups">
        {[...Object.entries(c.colors), ...Object.entries(c.rarities)].map(
          ([label, value]) => (
            <span key={label}>
              {label}:{" "}
              <strong>
                {value.owned}/{value.total}
              </strong>
            </span>
          ),
        )}
      </div>
    </section>
  );
}
export function Binder() {
  const [data, setData] = useState<Collection>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    id?: string;
    name: string;
    cards: string[];
  }>();
  const [remove, setRemove] = useState<string>();
  const [search, setSearch] = useState("");
  const [color, setColor] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const refresh = async () =>
    setData(await collectionApi("/api/account/collection"));
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cards = catalog.filter(
    (c) =>
      (!color || c.color === color) &&
      (!selectedOnly || draft?.cards.includes(c.id)) &&
      c.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="binder" aria-label="Your deck collection">
      <h3>Your physical decks</h3>
      <p>
        Log the moods in your real decks. Ownership is self-declared and never
        required to play.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => void run(refresh)}>Retry loading</button>
        </p>
      )}
      {!data ? (
        <p role="status">Loading collection…</p>
      ) : (
        <>
          <label className="collection-privacy">
            <input
              type="checkbox"
              checked={data.public}
              disabled={busy}
              onChange={(e) => {
                const visible = e.target.checked;
                void run(async () => {
                  await collectionApi("/api/account/collection", "PATCH", {
                    public: visible,
                  });
                  await refresh();
                });
              }}
            />{" "}
            Share my decks and collection publicly
          </label>
          <CollectionSummary decks={data.decks} />
          {!draft ? (
            <>
              <ul className="deck-list">
                {data.decks.map((d) => (
                  <li key={d.id}>
                    <div>
                      <strong>{d.name}</strong>
                      <PhotoBadge deck={d} />
                      <span>
                        {d.cards.length}/45 moods ·{" "}
                        {retailShaped(d.cards)
                          ? "Retail-shaped"
                          : "Custom selection"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setDraft({ ...d });
                        setError("");
                      }}
                    >
                      Edit {d.name}
                    </button>
                    <button disabled={busy} onClick={() => setRemove(d.id)}>
                      Delete {d.name}
                    </button>
                    <DeckPhoto deck={d} refresh={refresh} />
                    {remove === d.id && (
                      <div
                        role="group"
                        aria-label={`Confirm deleting ${d.name}`}
                      >
                        <p>Delete this deck? Your game record stays.</p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await collectionApi(
                                `/api/account/decks/${d.id}`,
                                "DELETE",
                              );
                              setRemove(undefined);
                              await refresh();
                            })
                          }
                        >
                          Confirm delete
                        </button>
                        <button onClick={() => setRemove(undefined)}>
                          Keep deck
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button
                className="primary"
                disabled={data.decks.length >= 10}
                onClick={() => {
                  setDraft({ name: "", cards: [] });
                  setSearch("");
                  setColor("");
                  setSelectedOnly(false);
                }}
              >
                Add a deck
              </button>
              <small>{data.decks.length}/10 saved decks</small>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await collectionApi(
                    `/api/account/decks${draft.id ? "/" + draft.id : ""}`,
                    draft.id ? "PUT" : "POST",
                    draft,
                  );
                  await refresh();
                  setDraft(undefined);
                });
              }}
            >
              <label>
                Deck name
                <input
                  required
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="binder-toolbar">
                <label>
                  Find a mood
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label>
                  Colour
                  <select
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  >
                    <option value="">All colours</option>
                    {COLORS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedOnly}
                    onChange={(e) => setSelectedOnly(e.target.checked)}
                  />{" "}
                  Selected only
                </label>
              </div>
              <p role="status">
                {draft.cards.length}/45 selected.{" "}
                {retailShaped(draft.cards)
                  ? "Matches the retail rarity mix."
                  : "Any selection can be saved; a retail deck has 23 common, 14 uncommon, 6 rare and 2 mythic rare moods."}
              </p>
              <div className="binder-grid">
                {cards.map((c) => {
                  const checked = draft.cards.includes(c.id);
                  return (
                    <label key={c.id} className={checked ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={
                          busy || (!checked && draft.cards.length >= 45)
                        }
                        onChange={() =>
                          setDraft({
                            ...draft,
                            cards: checked
                              ? draft.cards.filter((id) => id !== c.id)
                              : [...draft.cards, c.id],
                          })
                        }
                      />
                      <img
                        src={`/assets/cards/${c.id}.webp`}
                        alt=""
                        loading="lazy"
                      />
                      <strong>{c.name}</strong>
                      <small>
                        {c.color} · {c.rarity}
                      </small>
                    </label>
                  );
                })}
              </div>
              {!cards.length && (
                <p>No moods match. Try another search or colour.</p>
              )}
              <div className="binder-actions">
                <button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Save deck"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDraft(undefined)}
                >
                  Cancel editing
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
