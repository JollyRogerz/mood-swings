import { beforeAll, afterAll, it, expect } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import sharp from "sharp";
import { createAccounts, type Accounts } from "../src/server/auth";
import { mountAccountRoutes } from "../src/server/account-routes";
let server: Server,
  accounts: Accounts,
  base: string,
  deck: string,
  image: Buffer;
const previous = process.env.MOOD_REVIEWER_IDS;
beforeAll(async () => {
  accounts = (await createAccounts({ MOOD_ACCOUNTS: "memory" }))!;
  for (const id of ["owner", "moderator", "other"])
    await accounts.store.setUsername(id, id);
  // Authentication itself is covered by the real-session account tests. This
  // fixture gives the router three independently authenticated identities.
  accounts.userId = async (headers) =>
    ["owner", "moderator", "other"].includes(String(headers["x-test-user"]))
      ? String(headers["x-test-user"])
      : null;
  process.env.MOOD_REVIEWER_IDS = "moderator";
  const app = express();
  app.use(express.json({ limit: "8kb" }));
  mountAccountRoutes(app, accounts);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  accounts.origins = [base];
  deck = (
    await accounts.collection.save("owner", { name: "Deck", cards: ["love"] })
  ).id;
  image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "green" },
  })
    .jpeg()
    .toBuffer();
});
afterAll(async () => {
  if (previous === undefined) delete process.env.MOOD_REVIEWER_IDS;
  else process.env.MOOD_REVIEWER_IDS = previous;
  await new Promise<void>((r) => server.close(() => r()));
});
const call = (
  path: string,
  user = "owner",
  method = "GET",
  body?: Buffer | object,
  origin = base,
) =>
  fetch(base + path, {
    method,
    headers: {
      origin,
      "x-test-user": user,
      ...(body
        ? {
            "content-type": Buffer.isBuffer(body)
              ? "image/jpeg"
              : "application/json",
          }
        : {}),
    },
    body: body
      ? Buffer.isBuffer(body)
        ? new Uint8Array(body)
        : JSON.stringify(body)
      : undefined,
  });
it("automatically accepts a photo without granting public or owner review access", async () => {
  expect(
    (
      await call(
        `/api/account/decks/${deck}/photo`,
        "owner",
        "POST",
        image,
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (await call(`/api/account/decks/${deck}/photo`, "other", "POST", image))
      .status,
  ).toBe(404);
  expect(
    (
      await call(
        `/api/account/decks/${deck}/photo`,
        "owner",
        "POST",
        Buffer.from("not an image"),
      )
    ).status,
  ).toBe(400);
  expect(
    (await call(`/api/account/decks/${deck}/photo`, "owner", "POST", image))
      .status,
  ).toBe(200);
  const d = (await accounts.collection.get("owner")).decks[0];
  expect(d.photoAt).toBeTruthy();
  expect(d.verifiedAt).toBeNull();
  expect((await call("/api/account/reviews", "owner")).status).toBe(403);
  expect(
    (await call(`/api/account/reviews/${deck}/photo`, "other")).status,
  ).toBe(403);
  const queue = await (await call("/api/account/reviews", "moderator")).json();
  expect(queue.entries[0].username).toBe("owner");
  expect(queue.entries[0]).not.toHaveProperty("userId");
  const photo = await call(`/api/account/reviews/${deck}/photo`, "moderator");
  expect(photo.headers.get("content-type")).toContain("image/jpeg");
  expect(photo.headers.get("cache-control")).toBe("no-store");
  expect(
    (
      await call(`/api/account/reviews/${deck}`, "owner", "POST", {
        decision: "approve",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(`/api/account/reviews/${deck}`, "moderator", "POST", {
        decision: "approve",
      })
    ).status,
  ).toBe(200);
  expect(
    (await call(`/api/account/reviews/${deck}/photo`, "moderator")).status,
  ).toBe(404);
  expect(
    (await accounts.collection.get("owner")).decks[0].verifiedAt,
  ).toBeTruthy();
  expect(
    (await call(`/api/account/decks/${deck}/photo`, "owner", "DELETE")).status,
  ).toBe(200);
  expect((await accounts.collection.get("owner")).decks[0].photoAt).toBeNull();
});
