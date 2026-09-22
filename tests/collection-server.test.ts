import { afterAll, beforeAll, it, expect } from "vitest";
import { launchServer } from "./server-harness";
let server: Awaited<ReturnType<typeof launchServer>>;
beforeAll(async () => {
  server = await launchServer({ MOOD_ACCOUNTS: "memory" });
});
afterAll(() => server.stop());
async function visitor(name: string) {
  let cookie = "";
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    origin = server.base,
  ) => {
    const r = await fetch(server.base + path, {
      method,
      headers: { origin, cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    return {
      status: r.status,
      body: await r.json(),
      cache: r.headers.get("cache-control"),
    };
  };
  await call("/api/auth/sign-in/anonymous", "POST", {});
  await call("/api/account/username", "POST", { username: name });
  return call;
}
it("protects private decks, owner writes, CSRF and deletion", async () => {
  const a = await visitor("CollectorA"),
    b = await visitor("CollectorB");
  expect((await fetch(server.base + "/api/account/collection")).status).toBe(
    401,
  );
  const d = await a("/api/account/decks", "POST", {
    name: "My deck",
    cards: ["love"],
  });
  expect(d.status).toBe(200);
  expect(
    (
      await b(`/api/account/decks/${d.body.id}`, "PUT", {
        name: "Mine",
        cards: [],
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await a(
        "/api/account/collection",
        "PATCH",
        { public: true },
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect((await b("/api/profiles/collectora")).body.collection).toBeNull();
  await a("/api/account/collection", "PATCH", { public: true });
  const pub = await b("/api/profiles/CollectorA");
  expect(pub.body.collection.decks[0].cards).toEqual(["love"]);
  expect(pub.body).not.toHaveProperty("userId");
  expect(pub.cache).toBe("no-store");
  await a("/api/account/collection", "PATCH", { public: false });
  expect((await b("/api/profiles/CollectorA")).body.collection).toBeNull();
  await a("/api/account", "DELETE");
  expect((await b("/api/profiles/CollectorA")).status).toBe(404);
});
