import React, { useEffect, useState } from "react";
import { collectionApi, CollectionSummary, Binder } from "./binder";
import { definitions } from "../game/catalog";
import { retailShaped, type Deck } from "../game/collection";
export function PublicProfile({ username }: { username: string }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    collectionApi(`/api/profiles/${encodeURIComponent(username)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [username]);
  return (
    <div className="app">
      <main className="public-profile">
        <a href="/">← Back to Mood Swings</a>
        {error ? (
          <p role="alert">{error}</p>
        ) : !data ? (
          <p role="status">Loading profile…</p>
        ) : (
          <>
            <p className="eyebrow">AT THE MOOD SWINGS TABLE</p>
            <h1>{data.username}</h1>
            <p>Joined {new Date(data.createdAt).toLocaleDateString()}</p>
            <div className="stats-grid">
              {Object.entries({
                Games: data.stats.games,
                Wins: data.stats.wins,
                Losses: data.stats.losses,
                "Win rate": `${Math.round(data.stats.winRate * 100)}%`,
              }).map(([key, value]) => (
                <div key={key}>
                  <strong>{String(value)}</strong>
                  <span>{key}</span>
                </div>
              ))}
            </div>
            {data.collection ? (
              <>
                <CollectionSummary decks={data.collection.decks} />
                <h2>Physical decks</h2>
                <p>
                  Self-declared collections. No purchase or ownership is
                  required to play.
                </p>
                {data.collection.decks.map((d: Deck) => (
                  <details className="profile-deck" key={d.id}>
                    <summary>
                      {d.name} · {d.cards.length} moods{" "}
                      {retailShaped(d.cards) && "· Retail-shaped"}
                    </summary>
                    <div className="binder-grid">
                      {d.cards.map((id) => (
                        <div key={id}>
                          <img
                            src={`/assets/cards/${id}.webp`}
                            alt={definitions[id]?.name ?? id}
                            loading="lazy"
                          />
                          <strong>{definitions[id]?.name}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </>
            ) : (
              <p>This player's collection is private.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export function CollectionPage() {
  const [account, setAccount] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    collectionApi("/api/account")
      .then(setAccount)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="app">
      <main className="public-profile">
        <a href="/">← Back to Mood Swings</a>
        <h1>Your collection</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : !account ? (
          <p role="status">Loading profile…</p>
        ) : account.user?.username ? (
          <>
            <a href={`/u/${encodeURIComponent(account.user.username)}`}>
              View your public profile
            </a>
            <Binder />
          </>
        ) : (
          <p>
            Save a profile or sign in from the home screen to keep your decks.
          </p>
        )}
      </main>
    </div>
  );
}
