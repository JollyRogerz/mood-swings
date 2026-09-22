import express, {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
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
  // These routes sit outside Better Auth's handler and need their own origin
  // validation. A session cookie alone is not permission for cross-site writes.
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      accounts &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!accounts.origins.includes(req.get("origin") ?? "") ||
        req.get("sec-fetch-site") === "cross-site")
    ) {
      res.status(403).json({
        error: "Open your profile on the Mood Swings site to make changes.",
      });
      return;
    }
    next();
  });
  // Express 4 does not catch a rejected handler, and an uncaught rejection
  // would end the process and every table with it.
  const safely =
    (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    (req, res) => {
      handler(req, res).catch((e) => {
        console.error("Account request failed.", e);
        if (!res.headersSent)
          res.status(500).json({ error: "Profiles are having trouble." });
      });
    };
  const fail = (res: Response, status: number, error: string) =>
    res.status(status).json({ error });
  const signedIn = async (req: Request, res: Response) => {
    const userId = await accounts!.userId(req.headers);
    if (!userId) fail(res, 401, "Sign in first.");
    return userId;
  };
  router.get(
    "/",
    safely(async (req, res) => {
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
    }),
  );
  router.get(
    "/stats",
    safely(async (req, res) => {
      if (!accounts) {
        fail(res, 503, "Profiles are not enabled.");
        return;
      }
      const userId = await signedIn(req, res);
      if (!userId) return;
      res.json(await accounts.results.stats(userId));
    }),
  );
  app.get(
    "/api/leaderboard",
    safely(async (_req, res) => {
      if (!accounts) {
        res
          .set("Cache-Control", "no-store")
          .json({ enabled: false, players: [] });
        return;
      }
      res
        .set("Cache-Control", "public, max-age=60")
        .json({ enabled: true, players: await accounts.results.leaderboard() });
    }),
  );
  if (accounts) {
    router.post(
      "/username",
      safely(async (req, res) => {
        const userId = await signedIn(req, res);
        if (!userId) return;
        let username: string;
        try {
          username = cleanUsername(req.body?.username);
        } catch (e) {
          fail(res, 400, (e as Error).message);
          return;
        }
        // Settle first: if the name then turns out to be taken, what is left is
        // a full account without a username, which the client knows how to
        // finish. The other order could leave a name held by a half-made one.
        await accounts.settle(userId);
        try {
          const profile = await accounts.store.setUsername(userId, username);
          res.json({ username: profile.username });
        } catch (e) {
          if (!(e instanceof UsernameTaken)) throw e;
          fail(res, 409, e.message);
        }
      }),
    );
    for (const action of ["link", "unlink"] as const)
      router.post(
        `/${action}`,
        safely(async (req, res) => {
          const userId = await signedIn(req, res);
          if (!userId) return;
          let seat: string;
          try {
            seat = identity(req.body?.token);
          } catch (e) {
            fail(res, 400, (e as Error).message);
            return;
          }
          await accounts.store[action](seat, userId);
          res.json({ ok: true });
        }),
      );
    router.delete(
      "/",
      safely(async (req, res) => {
        const userId = await signedIn(req, res);
        if (!userId) return;
        await accounts.destroy(userId);
        res.json({ ok: true });
      }),
    );
  }
  app.use("/api/account", router);
}
