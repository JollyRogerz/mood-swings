import React, { useState } from "react";
import type { Deck } from "../game/collection";
import { collectionApi } from "./collection-api";
export function PhotoBadge({ deck }: { deck: Deck }) {
  return deck.verifiedAt ? (
    <span
      className="photo-badge"
      title="A maintainer reviewed a submitted photo"
    >
      Reviewed
    </span>
  ) : deck.photoAt ? (
    <span
      className="photo-badge"
      title="An image was submitted; ownership has not been verified"
    >
      Photo provided
    </span>
  ) : null;
}
async function prepare(file: File) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a photo under 20 MB.");
  const image = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not read this photo.")),
        "image/jpeg",
        0.8,
      ),
    );
  } finally {
    image.close();
  }
}
export function DeckPhoto({
  deck,
  refresh,
}: {
  deck: Deck;
  refresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const action = async (f: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await f();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="deck-photo">
      <summary>
        Ownership photo <PhotoBadge deck={deck} />
      </summary>
      <p>
        Optional: show your cards beside a handwritten note with your profile
        username. Keep faces, addresses and other personal details out of the
        picture.
      </p>
      <p>
        A valid image automatically earns “Photo provided.” This checks the
        file, not ownership or which cards it shows. Only an optional human
        review earns “Reviewed.” Photos stay private and are deleted after
        review or 14 days. The badge remains until you remove it or change the
        deck’s cards.
      </p>
      <label>
        Photo for {deck.name}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setNotice("");
          }}
        />
      </label>
      <button
        disabled={!file || busy || !deck.cards.length}
        onClick={() =>
          void action(async () => {
            const blob = await prepare(file!);
            const r = await fetch(`/api/account/decks/${deck.id}/photo`, {
              method: "POST",
              headers: { "content-type": "image/jpeg" },
              body: blob,
              credentials: "same-origin",
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setFile(undefined);
            setNotice(
              "Photo accepted. The badge does not claim verified ownership.",
            );
          })
        }
      >
        {busy ? "Processing…" : "Submit photo"}
      </button>
      {deck.photoAt && (
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              await collectionApi(
                `/api/account/decks/${deck.id}/photo`,
                "DELETE",
              );
              setNotice("Photo and badge removed.");
            })
          }
        >
          Remove photo and badge
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
