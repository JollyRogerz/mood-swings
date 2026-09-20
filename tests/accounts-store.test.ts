import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore } from "../src/server/accounts";
let store: MemoryAccountStore;
beforeEach(async () => {
  store = new MemoryAccountStore();
  await store.init();
});
describe("account store", () => {
  it("keeps a username unique whatever the case", async () => {
    await store.setUsername("u1", "Ruben");
    await expect(store.setUsername("u2", "rUBEN")).rejects.toThrow(/taken/i);
    expect((await store.profile("u1"))?.username).toBe("Ruben");
    expect(await store.profile("u2")).toBeNull();
  });
  it("frees the old name when a player renames", async () => {
    const first = await store.setUsername("u1", "Ruben");
    const second = await store.setUsername("u1", "Macedo");
    expect(second.createdAt).toBe(first.createdAt);
    await expect(store.setUsername("u2", "ruben")).resolves.toMatchObject({
      username: "ruben",
    });
  });
  it("lets a player keep their own name with new capitals", async () => {
    await store.setUsername("u1", "ruben");
    await expect(store.setUsername("u1", "Ruben")).resolves.toMatchObject({
      username: "Ruben",
    });
  });
  it("links a device, and moves it when someone else signs in there", async () => {
    await store.link("seat-a", "u1");
    await store.link("seat-b", "u1");
    expect(await store.devices("u1")).toBe(2);
    await store.link("seat-a", "u2");
    expect(await store.userFor("seat-a")).toBe("u2");
    expect(await store.devices("u1")).toBe(1);
  });
  it("only lets the owner unlink a device", async () => {
    await store.link("seat-a", "u1");
    await store.unlink("seat-a", "u2");
    expect(await store.userFor("seat-a")).toBe("u1");
    await store.unlink("seat-a", "u1");
    expect(await store.userFor("seat-a")).toBeNull();
  });
  it("removes a player's profile and devices together", async () => {
    await store.setUsername("u1", "Ruben");
    await store.link("seat-a", "u1");
    await store.remove("u1");
    expect(await store.profile("u1")).toBeNull();
    expect(await store.userFor("seat-a")).toBeNull();
    await expect(store.setUsername("u2", "Ruben")).resolves.toBeTruthy();
  });
});
