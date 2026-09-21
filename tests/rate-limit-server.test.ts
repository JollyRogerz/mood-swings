import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { launchServer } from "./server-harness";

it("bounds sync bursts and queued room commands, then accepts normal play again", async () => {
  const server = await launchServer();
  try {
    const token = randomUUID();
    const { code } = await server.post("/api/rooms", { token, name: "Host" });
    const host = await server.join(code, token, "Host");
    let views = 0;
    host.room.onMessage("view", () => views++);
    for (let i = 0; i < 80; i++) host.room.send("sync");
    for (let i = 0; i < 80; i++) host.room.send("rematch");
    await expect
      .poll(() => host.errors.includes("Please slow down."))
      .toBe(true);
    // Wait for the finite burst to drain, then use the next one-second budget.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(views).toBeLessThanOrEqual(20);
    host.room.send("add-bot", { difficulty: "easy" });
    await expect.poll(() => host.view.players.length).toBe(2);
    await host.room.leave();
  } finally {
    await server.stop();
  }
}, 20000);

it("keeps restore errors private while preserving useful validation errors", async () => {
  const server = await launchServer();
  try {
    await writeFile(
      path.join(server.root, ".runtime/rooms/BADSTATE.json"),
      "internal-storage-detail: invalid JSON",
    );
    const connect = (code: string, token: string) =>
      fetch(`${server.base}/api/rooms/${code}/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    const broken = await connect("BADSTATE", randomUUID());
    expect(broken.status).toBe(500);
    expect(await broken.json()).toEqual({
      error: "Could not join table. Please try again.",
    });
    const missing = await connect("MISSINGA", randomUUID());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "Table not found. Check your invite link.",
    });
    expect((await connect("MISSINGA", "bad-token")).status).toBe(400);
  } finally {
    await server.stop();
  }
}, 20000);
