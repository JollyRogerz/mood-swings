import React, { useEffect, useState } from "react";
import { collectionApi } from "./collection-api";
interface Entry {
  deckId: string;
  name: string;
  username: string;
  submittedAt: string;
}
export function ReviewPage() {
  const [entries, setEntries] = useState<Entry[]>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () =>
    setEntries((await collectionApi("/api/account/reviews")).entries);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  const review = async (id: string, decision: string) => {
    setBusy(true);
    setError("");
    try {
      await collectionApi(`/api/account/reviews/${id}`, "POST", { decision });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app">
      <main className="public-profile">
        <a href="/collection">← Back to collection</a>
        <h1>Photo review</h1>
        <p>
          Check that the cards and handwritten username match the submission. A
          review is a manual check of the photo, not a guarantee of ownership.
          Either decision deletes the image.
        </p>
        {error && <p role="alert">{error}</p>}
        {!entries && !error && <p role="status">Loading submissions…</p>}
        {entries?.length === 0 && <p>No photos awaiting review.</p>}
        {entries?.map((p) => (
          <section className="review-photo" key={p.deckId}>
            <h2>{p.name}</h2>
            <p>
              Submitted by {p.username} on{" "}
              {new Date(p.submittedAt).toLocaleDateString()}
            </p>
            <img
              src={`/api/account/reviews/${p.deckId}/photo`}
              alt={`Private deck photo from ${p.username}`}
              loading="lazy"
            />
            <div>
              <button
                disabled={busy}
                onClick={() => void review(p.deckId, "approve")}
              >
                Approve photo for {p.username}
              </button>
              <button
                disabled={busy}
                onClick={() => void review(p.deckId, "reject")}
              >
                Reject photo for {p.username}
              </button>
            </div>
          </section>
        ))}
        {!!entries?.length && (
          <p>
            Showing up to 50 oldest submissions. Review these to load the next
            batch.
          </p>
        )}
      </main>
    </div>
  );
}
