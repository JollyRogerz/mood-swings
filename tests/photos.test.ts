import { it, expect, afterEach, vi } from "vitest";
import sharp from "sharp";
import { normalizePhoto } from "../src/server/photos";
import { MemoryCollectionStore } from "../src/server/collection";
afterEach(() => vi.useRealTimers());
it("re-encodes images, strips metadata and rejects non-photo or tiny uploads", async () => {
  const image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "green" },
  })
    .withMetadata({ exif: { IFD0: { Artist: "private-test-metadata" } } })
    .jpeg()
    .toBuffer();
  const cleaned = await normalizePhoto(image),
    metadata = await sharp(cleaned).metadata();
  expect(metadata.format).toBe("jpeg");
  expect(metadata.exif).toBeUndefined();
  expect(cleaned.length).toBeLessThan(700000);
  await expect(
    normalizePhoto(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"/>',
      ),
    ),
  ).rejects.toThrow();
  await expect(
    normalizePhoto(
      await sharp({
        create: { width: 50, height: 50, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
    ),
  ).rejects.toThrow();
  await expect(
    normalizePhoto(Buffer.alloc(2 * 1024 * 1024 + 1)),
  ).rejects.toThrow();
});
it("clears raw photos after review or expiry and invalidates changed decks", async () => {
  const s = new MemoryCollectionStore(),
    d = await s.save("owner", { name: "Deck", cards: ["love"] });
  await expect(
    s.attachPhoto("other", d.id, Buffer.from("test"), d.cards),
  ).rejects.toThrow();
  await s.attachPhoto("owner", d.id, Buffer.from("test"), d.cards);
  expect((await s.get("owner")).decks[0].photoAt).toBeTruthy();
  expect(await s.reviewPhoto(d.id, true)).toBe(true);
  expect(await s.photo(d.id)).toBeNull();
  expect((await s.get("owner")).decks[0].verifiedAt).toBeTruthy();
  await s.save("owner", { name: "Renamed", cards: d.cards }, d.id);
  expect((await s.get("owner")).decks[0].verifiedAt).toBeTruthy();
  await s.attachPhoto("owner", d.id, Buffer.from("test"), d.cards);
  await s.save("owner", { name: "Edited", cards: ["curiosity"] }, d.id);
  expect(await s.photo(d.id)).toBeNull();
  expect((await s.get("owner")).decks[0].photoAt).toBeNull();
  expect((await s.get("owner")).decks[0].verifiedAt).toBeNull();
  await expect(
    s.attachPhoto("owner", d.id, Buffer.from("test"), d.cards),
  ).rejects.toThrow("changed");
  await s.attachPhoto("owner", d.id, Buffer.from("test"), ["curiosity"]);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 15 * 86400000);
  await s.purgePhotos();
  expect(await s.photo(d.id)).toBeNull();
  expect((await s.get("owner")).decks[0].photoAt).toBeTruthy();
});
