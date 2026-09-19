import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { Client } from "@colyseus/sdk";
import { expect } from "vitest";
import type { View } from "../src/game/types";
// Launch the real server in isolated storage for socket-level tests.
export async function launchServer(extraEnv: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mood-server-"));
  const port = await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PORT: String(port),
  };
  delete env.DATABASE_URL;
  const proc: ChildProcess = spawn(
    process.execPath,
    [
      "--import",
      path.resolve("node_modules/tsx/dist/loader.mjs"),
      path.resolve("src/server/index.ts"),
    ],
    { cwd: root, env, stdio: "pipe" },
  );
  let output = "";
  proc.stdout?.on("data", (b) => (output += b.toString()));
  proc.stderr?.on("data", (b) => (output += b.toString()));
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (proc.exitCode !== null || i > 100)
      throw new Error("Server did not start: " + output);
    await new Promise((r) => setTimeout(r, 100));
  }
  async function post(url: string, body: unknown) {
    const r = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(r.ok).toBe(true);
    return r.json();
  }
  async function join(
    code: string,
    token: string,
    name: string,
    options: Record<string, unknown> = {},
  ) {
    await post(`/api/rooms/${code}/connect`, { token });
    const room = await new Client(base).joinById(code, {
      token,
      name,
      ...options,
    });
    room.reconnection.enabled = false;
    let view: View | undefined;
    const errors: string[] = [];
    room.onMessage("view", (v: View) => (view = v));
    room.onMessage("error", (m: string) => errors.push(m));
    for (const quiet of ["presence", "reaction", "preview"])
      room.onMessage(quiet, () => {});
    room.send("sync");
    await expect.poll(() => !!view).toBe(true);
    return {
      room,
      errors,
      get view() {
        return view!;
      },
    };
  }
  return {
    base,
    post,
    join,
    listing: async () =>
      (await (await fetch(base + "/api/rooms")).json()).rooms,
    async stop() {
      if (proc.exitCode === null) {
        const done = new Promise<void>((r) => proc.once("exit", () => r()));
        proc.kill("SIGTERM");
        await done;
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}
