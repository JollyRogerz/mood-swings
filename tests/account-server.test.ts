import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchServer } from "./server-harness";
type Server = Awaited<ReturnType<typeof launchServer>>;
// A tiny browser: keeps the session cookie and sends the page's origin.
function visitor(base: string) {
  let cookie = "";
  return async (
    url: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        origin: base,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(token ? { "x-mood-session": token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}
describe("accounts switched off", () => {
  let server: Server;
  beforeAll(async () => (server = await launchServer()));
  afterAll(() => server.stop());
  it("says so, and has no sign-in endpoint", async () => {
    const get = visitor(server.base);
    expect((await get("/api/account")).json).toMatchObject({ accounts: false });
    expect(
      (await get("/api/account/username", "POST", { username: "ruben" }))
        .status,
    ).toBe(404);
  });
});
describe("accounts", () => {
  let server: Server;
  beforeAll(async () => {
    server = await launchServer({ MOOD_ACCOUNTS: "memory" });
  });
  afterAll(() => server.stop());
  const signUp = async () => {
    const as = visitor(server.base);
    expect((await as("/api/auth/sign-in/anonymous", "POST", {})).status).toBe(
      200,
    );
    return as;
  };
  it("refuses writes from a guest", async () => {
    const guest = visitor(server.base);
    expect((await guest("/api/account")).json).toMatchObject({
      accounts: true,
      user: null,
    });
    for (const [url, method] of [
      ["/api/account/username", "POST"],
      ["/api/account/link", "POST"],
      ["/api/account", "DELETE"],
    ])
      expect(
        (await guest(url, method, { username: "ruben", token: randomUUID() }))
          .status,
      ).toBe(401);
  });
  it("saves a username, links this device, and keeps the name unique", async () => {
    const ruben = await signUp(),
      token = randomUUID();
    expect(
      (await ruben("/api/account/username", "POST", { username: "no" })).status,
    ).toBe(400);
    expect(
      (await ruben("/api/account/username", "POST", { username: "Ruben" }))
        .json,
    ).toEqual({ username: "Ruben" });
    expect((await ruben("/api/account/link", "POST", { token })).status).toBe(
      200,
    );
    expect(
      (await ruben("/api/account", "GET", undefined, token)).json,
    ).toMatchObject({
      linked: true,
      user: { username: "Ruben", devices: 1 },
    });
    // The same account seen from a device that was never linked.
    expect(
      (await ruben("/api/account", "GET", undefined, randomUUID())).json.linked,
    ).toBe(false);
    const other = await signUp();
    expect(
      (await other("/api/account/username", "POST", { username: "rUBEN" }))
        .status,
    ).toBe(409);
    // Someone else cannot unlink Ruben's device.
    await other("/api/account/unlink", "POST", { token });
    expect(
      (await ruben("/api/account", "GET", undefined, token)).json.linked,
    ).toBe(true);
  });
  it("turns the saved profile into a full account", async () => {
    const as = await signUp();
    await as("/api/account/username", "POST", { username: "Settled" });
    const session = (await as("/api/auth/get-session")).json;
    expect(session.user).toMatchObject({ name: "Settled", isAnonymous: false });
  });
  it("deletes everything on request", async () => {
    const as = await signUp(),
      token = randomUUID();
    await as("/api/account/username", "POST", { username: "Leaving" });
    await as("/api/account/link", "POST", { token });
    expect((await as("/api/account", "DELETE")).status).toBe(200);
    expect(
      (await as("/api/account", "GET", undefined, token)).json,
    ).toMatchObject({ user: null, linked: false });
    const next = await signUp();
    expect(
      (await next("/api/account/username", "POST", { username: "Leaving" }))
        .status,
    ).toBe(200);
  });
});
