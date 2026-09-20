import express, { type Express, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { cleanUsername } from "../game/account";
import { UsernameTaken } from "./accounts";
import type { Accounts } from "./auth";
import { identity } from "./room";
// Better Auth reads the raw request body, so its handler has to be mounted
// before any JSON body parser.
export function mountAuth(app: Express, accounts: Accounts | undefined) {
  if (accounts) app.all("/api/auth/*", toNodeHandler(accounts.auth));
}
export function mountAccountRoutes(
  app: Express,
  accounts: Accounts | undefined,
) {
  const router = express.Router();
  const fail = (res: Response, status: number, error: string) =>
    res.status(status).json({ error });
  const signedIn = async (req: Request, res: Response) => {
    const userId = await accounts!.userId(req.headers);
    if (!userId) fail(res, 401, "Sign in first.");
    return userId;
  };
  router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!accounts) {
      res.json({ accounts: false, providers: [], user: null, linked: false });
      return;
    }
    const userId = await accounts.userId(req.headers);
    let linked = false;
    if (userId && typeof req.get("x-mood-session") === "string")
      try {
        linked =
          (await accounts.store.userFor(
            identity(req.get("x-mood-session")),
          )) === userId;
      } catch {}
    res.json({
      accounts: true,
      providers: accounts.providers,
      linked,
      user: userId && {
        id: userId,
        username: (await accounts.store.profile(userId))?.username ?? null,
        devices: await accounts.store.devices(userId),
      },
    });
  });
  if (accounts) {
    router.post("/username", async (req, res) => {
      const userId = await signedIn(req, res);
      if (!userId) return;
      try {
        const username = cleanUsername(req.body?.username);
        const profile = await accounts.store.setUsername(userId, username);
        await accounts.settle(userId, username);
        res.json({ username: profile.username });
      } catch (e) {
        fail(
          res,
          e instanceof UsernameTaken ? 409 : 400,
          e instanceof Error ? e.message : "Could not save that username.",
        );
      }
    });
    for (const action of ["link", "unlink"] as const)
      router.post(`/${action}`, async (req, res) => {
        const userId = await signedIn(req, res);
        if (!userId) return;
        try {
          await accounts.store[action](identity(req.body?.token), userId);
          res.json({ ok: true });
        } catch (e) {
          fail(res, 400, e instanceof Error ? e.message : "Could not do that.");
        }
      });
    router.delete("/", async (req, res) => {
      const userId = await signedIn(req, res);
      if (!userId) return;
      await accounts.destroy(userId);
      res.json({ ok: true });
    });
  }
  app.use("/api/account", router);
}
