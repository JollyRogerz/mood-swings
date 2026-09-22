import sharp from "sharp";
import express, {
  type Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import type { Accounts } from "./auth";
import { collectionChanged } from "./collection-service";
export const isReviewer = (userId: string) =>
  (process.env.MOOD_REVIEWER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  if (
    !Buffer.isBuffer(input) ||
    !input.length ||
    input.length > 2 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG or WebP photo under 2 MB.");
  const image = sharp(input, { limitInputPixels: 8_000_000, failOn: "error" });
  const meta = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
    (meta.pages ?? 1) > 1 ||
    Math.min(meta.width ?? 0, meta.height ?? 0) < 360 ||
    Math.max(meta.width ?? 0, meta.height ?? 0) < 640
  )
    throw new Error(
      "Use a clear, single photo at least 640 × 360 pixels (either orientation).",
    );
  // Re-encode, rather than retaining EXIF/GPS, embedded payloads or the original file.
  const output = await image
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75 })
    .toBuffer();
  if (output.length > 700_000)
    throw new Error("This photo is too large. Try a less detailed background.");
  return output;
}
let processing = 0;
export function mountPhotoRoutes(router: Router, accounts: Accounts) {
  // Called below the account router's session/profile and origin checks.
  const safely =
    (f: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    (req, res) => {
      void f(req, res).catch(() => {
        if (!res.headersSent)
          res.status(500).json({
            error: "Photo processing is unavailable. Please try again.",
          });
      });
    };
  const raw = express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "2mb",
  });
  router.post(
    "/decks/:id/photo",
    (req, res, next) =>
      raw(req, res, (e) => {
        if (e) res.status(413).json({ error: "Use a photo under 2 MB." });
        else next();
      }),
    safely(async (req, res) => {
      const id = String(req.params.id),
        user = res.locals.userId;
      const d = (await accounts.collection.get(user)).decks.find(
        (d) => d.id === id,
      );
      if (!d) {
        res.status(404).json({ error: "Deck not found." });
        return;
      }
      if (!d.cards.length) {
        res.status(400).json({
          error: "Add the cards in this deck before submitting its photo.",
        });
        return;
      }
      if (processing >= 2) {
        res
          .status(429)
          .json({ error: "Photo processing is busy. Try again shortly." });
        return;
      }
      processing++;
      try {
        let data: Buffer;
        try {
          data = await normalizePhoto(req.body);
        } catch {
          res.status(400).json({
            error:
              "Use a clear JPEG, PNG or WebP photo under 2 MB, at least 640 × 360 pixels. Animated images are not accepted.",
          });
          return;
        }
        try {
          await accounts.collection.attachPhoto(user, id, data, d.cards);
        } catch {
          res.status(409).json({
            error: "The deck changed. Reload and submit its photo again.",
          });
          return;
        }
        collectionChanged();
        res.json({ ok: true, badge: "Photo provided" });
      } finally {
        processing--;
      }
    }),
  );
  router.delete(
    "/decks/:id/photo",
    safely(async (req, res) => {
      if (
        !(await accounts.collection.removePhoto(
          res.locals.userId,
          String(req.params.id),
        ))
      ) {
        res.status(404).json({ error: "Deck not found." });
        return;
      }
      collectionChanged();
      res.json({ ok: true });
    }),
  );
  router.use("/reviews", (req, res, next) => {
    if (!isReviewer(res.locals.userId)) {
      res.status(403).json({ error: "Review access is restricted." });
      return;
    }
    next();
  });
  router.get(
    "/reviews",
    safely(async (_req, res) => {
      const pending = await accounts.collection.pendingPhotos();
      const entries = await Promise.all(
        pending.map(async (p) => ({
          deckId: p.deckId,
          name: p.name,
          submittedAt: p.submittedAt,
          username:
            (await accounts.store.profile(p.userId))?.username ??
            "Deleted profile",
        })),
      );
      res.json({ entries });
    }),
  );
  router.get(
    "/reviews/:id/photo",
    safely(async (req, res) => {
      const image = await accounts.collection.photo(String(req.params.id));
      if (!image) {
        res
          .status(404)
          .json({ error: "This photo was already reviewed or expired." });
        return;
      }
      res
        .set({
          "Content-Type": "image/jpeg",
          "Content-Disposition": "inline; filename=deck-photo.jpg",
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
        })
        .send(image);
    }),
  );
  router.post(
    "/reviews/:id",
    safely(async (req, res) => {
      if (!["approve", "reject"].includes(req.body?.decision)) {
        res.status(400).json({ error: "Choose approve or reject." });
        return;
      }
      if (
        !(await accounts.collection.reviewPhoto(
          String(req.params.id),
          req.body.decision === "approve",
        ))
      ) {
        res
          .status(409)
          .json({ error: "This photo was already reviewed or expired." });
        return;
      }
      collectionChanged();
      res.json({ ok: true });
    }),
  );
}
