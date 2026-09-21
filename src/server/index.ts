import express from "express";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Server, ServerError, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createGame } from "../game/engine";
import { cleanName, identity, MoodRoom, serverKey, publicRooms } from "./room";
import { store } from "./store";
import { createAccounts } from "./auth";
import { mountAccountRoutes, mountAuth } from "./account-routes";
const port = Number(process.env.PORT ?? 3000);
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});
// Profiles are optional. If they cannot start, the tables still must.
const accounts = await createAccounts().catch((e) => {
  console.error("Accounts are off: they failed to start.", e);
  return undefined;
});
mountAuth(app, accounts);
app.use(express.json({ limit: "8kb" }));
const http = createServer(app);
const server = new Server({
  transport: new WebSocketTransport({ server: http, maxPayload: 16 * 1024 }),
  greet: false,
});
server.define("mood", MoodRoom);
await store.init();
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, game: "mood-swings", version: 1 }),
);
const limits = new Map<string, { time: number; n: number }>();
app.use(["/api/rooms", "/api/account"], (req, res, next) => {
  // Each API gets its own budget, so a busy night of tables cannot lock a
  // player out of their profile.
  const key = `${req.baseUrl}:${req.method}:${req.ip ?? "unknown"}`,
    now = Date.now();
  for (const [k, v] of limits) if (now - v.time > 60_000) limits.delete(k);
  const r = limits.get(key) ?? { time: now, n: 0 };
  if (++r.n > (req.method === "GET" ? 120 : 30)) {
    res
      .status(429)
      .json({ error: "Too many requests. Try again in a minute." });
    return;
  }
  limits.set(key, r);
  next();
});
mountAccountRoutes(app, accounts);
app.get("/api/rooms", (_req, res) => {
  res
    .set("Cache-Control", "no-store")
    .json({ rooms: [...publicRooms.values()].slice(0, 100) });
});
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () =>
  Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
app.post("/api/rooms", async (req, res) => {
  try {
    const id = identity(req.body?.token),
      name = cleanName(req.body?.name);
    let roomCode = code();
    while (await store.load(roomCode)) roomCode = code();
    const snapshot = createGame(id, name, randomBytes(4).readUInt32LE());
    snapshot.visibility =
      req.body?.visibility === "public" ? "public" : "private";
    await store.save(roomCode, snapshot);
    await matchMaker.createRoom("mood", {
      key: serverKey,
      code: roomCode,
      snapshot,
    });
    res.status(201).json({ code: roomCode });
  } catch (e) {
    const expected = e instanceof ServerError && e.code >= 400 && e.code < 500;
    if (!expected) console.error("Table creation failed.", e);
    res.status(expected ? e.code : 500).json({
      error: expected ? e.message : "Could not create table. Please try again.",
    });
  }
});
const restoring = new Map<string, Promise<unknown>>();
app.post("/api/rooms/:code/connect", async (req, res) => {
  try {
    const roomCode = String(req.params.code).toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(roomCode)) {
      res.status(400).json({ error: "Enter an eight-character room code." });
      return;
    }
    identity(req.body?.token);
    if (!matchMaker.getLocalRoomById(roomCode)) {
      if (!restoring.has(roomCode))
        restoring.set(
          roomCode,
          (async () => {
            const snapshot = await store.load(roomCode);
            if (!snapshot)
              throw new ServerError(
                404,
                "Table not found. Check your invite link.",
              );
            if (snapshot.version !== 1)
              throw new ServerError(
                409,
                "This saved game needs a newer client.",
              );
            await matchMaker.createRoom("mood", {
              key: serverKey,
              code: roomCode,
              snapshot,
            });
          })().finally(() => restoring.delete(roomCode)),
        );
      await restoring.get(roomCode);
    }
    res.json({ code: roomCode });
  } catch (e) {
    const expected = e instanceof ServerError && e.code >= 400 && e.code < 500;
    if (!expected) console.error("Table connection failed.", e);
    res.status(expected ? e.code : 500).json({
      error: expected ? e.message : "Could not join table. Please try again.",
    });
  }
});
app.use(
  "/assets/cards",
  express.static(path.resolve("assets/cards"), {
    maxAge: "7d",
    immutable: true,
  }),
);
app.use(express.static(path.resolve("dist/client")));
app.get("*", (_req, res) =>
  res.sendFile(path.resolve("dist/client/index.html")),
);
await server.listen(port, "0.0.0.0");
console.log(`Mood Swings listening on :${port}`);
