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
it("loads a host deck on the server and revalidates it at match start", async () => {
  const { randomUUID } = await import("node:crypto");
  const { catalog } = await import("../src/game/catalog");
  const { readFile } = await import("node:fs/promises");
  const as = await visitor("DeckHost"),
    token = randomUUID();
  await as("/api/account/link", "POST", { token });
  const cards = catalog.slice(0, 12).map((c) => c.id);
  const deck = (
    await as("/api/account/decks", "POST", { name: "Our shared deck", cards })
  ).body;
  const created = await server.post("/api/rooms", { token, name: "Host" });
  const host = await server.join(created.code, token, "Host"),
    friend = await server.join(created.code, randomUUID(), "Friend");
  friend.room.send("deck", { id: deck.id });
  await expect.poll(() => friend.errors.length).toBe(1);
  host.room.send("deck", { id: "forged", cards });
  await expect.poll(() => host.errors.length).toBe(1);
  host.room.send("deck", { id: deck.id });
  await expect.poll(() => friend.view.customDeck?.name).toBe("Our shared deck");
  expect(friend.view.customDeck?.id).toBeUndefined();
  await as(`/api/account/decks/${deck.id}`, "PUT", {
    name: "Now too small",
    cards: [cards[0]],
  });
  host.room.send("start", {});
  await expect.poll(() => host.errors.length).toBe(2);
  expect(host.view.status).toBe("lobby");
  await as(`/api/account/decks/${deck.id}`, "PUT", { name: "Ready", cards });
  host.room.send("start", { cards: ["love"] });
  await expect.poll(() => host.view.status).toBe("playing");
  const saved = JSON.parse(
    await readFile(
      `${server.root}/.runtime/rooms/${created.code}.json`,
      "utf8",
    ),
  );
  expect(saved.cards.map((c: any) => c.def).sort()).toEqual([...cards].sort());
  expect(friend.view.customDeck?.name).toBe("Ready");
  await host.room.leave();
  await friend.room.leave();
});
