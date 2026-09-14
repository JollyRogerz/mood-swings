import { Client, Room, ServerError } from "@colyseus/core";
import { createHash, randomBytes } from "node:crypto";
import {
  act,
  addPlayer,
  createGame,
  publicView,
  RuleError,
  startGame,
} from "../game/engine";
import { botAction } from "../game/bot";
import type { Action, Difficulty, Game, PublicRoom } from "../game/types";
import { store } from "./store";
export const serverKey = randomBytes(32).toString("hex");
export function identity(token: unknown): string {
  if (typeof token !== "string" || !/^[a-f0-9-]{36,128}$/i.test(token))
    throw new ServerError(400, "Invalid player session. Please reload.");
  return createHash("sha256").update(token).digest("hex").slice(0, 24);
}
export function cleanName(name: unknown): string {
  if (typeof name !== "string") throw new ServerError(400, "Enter your name.");
  const value = name
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 24);
  if (!value) throw new ServerError(400, "Enter your name.");
  return value;
}
export const publicRooms = new Map<string, PublicRoom>();
export class MoodRoom extends Room {
  maxClients = 12;
  autoDispose = false;
  game!: Game;
  private botTimer?: { clear(): void };
  private chain: Promise<unknown> = Promise.resolve();
  private actors = new Map<string, string>();
  private rates = new Map<string, { time: number; count: number }>();
  async onCreate(options: { key: string; code: string; snapshot: Game }) {
    if (options.key !== serverKey)
      throw new ServerError(403, "Create a table from the home screen.");
    this.roomId = options.code;
    this.game = options.snapshot;
    for (const p of this.game.players) p.connected = !!p.bot;
    await this.setPrivate(true);
    this.onMessage("visibility", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        if (
          this.actor(client) !== this.game.host ||
          this.game.status !== "lobby"
        )
          throw new RuleError(
            "Only the host can change visibility in the lobby.",
          );
        if (!["private", "public"].includes(message?.visibility))
          throw new RuleError("Choose private or public.");
        const next = structuredClone(this.game);
        next.visibility = message.visibility;
        next.revision++;
        await this.commit(next);
      }, client),
    );
    this.onMessage("sync", (client) => this.sendView(client));
    this.onMessage("action", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        const actor = this.actor(client);
        if (!message || message.revision !== this.game.revision) {
          this.sendView(client);
          throw new RuleError("The table changed. Please try your move again.");
        }
        if ((this.game.roundPauseUntil ?? 0) > Date.now())
          throw new RuleError(
            "The round results are being shown. Play resumes shortly.",
          );
        if ((this.game.playPauseUntil ?? 0) > Date.now())
          throw new RuleError(
            "A played card is being revealed. Play resumes shortly.",
          );
        const next = act(this.game, actor, message.action as Action);
        await this.commit(next);
      }, client),
    );
    this.onMessage("start", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        const actor = this.actor(client);
        const next = structuredClone(this.game);
        startGame(next, actor, message?.mode === "all" ? "all" : "retail");
        await this.commit(next);
      }, client),
    );
    this.onMessage("add-bot", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        if (
          this.actor(client) !== this.game.host ||
          this.game.status !== "lobby"
        )
          throw new RuleError("Only the host can add bots before the game.");
        const difficulty: Difficulty = ["easy", "normal", "hard"].includes(
          message?.difficulty,
        )
          ? message.difficulty
          : "normal";
        const next = structuredClone(this.game),
          names = ["Fern", "Ember", "Sage"];
        const name =
          names.find((n) => !next.players.some((p) => p.name === n)) ?? "Bot";
        const id = "bot-" + randomBytes(8).toString("hex");
        addPlayer(next, id, name);
        next.players.find((p) => p.id === id)!.bot = difficulty;
        await this.commit(next);
      }, client),
    );
    this.onMessage("remove-bot", (client, message) =>
      this.enqueue(async () => {
        if (
          this.actor(client) !== this.game.host ||
          this.game.status !== "lobby"
        )
          throw new RuleError("Only the host can remove bots before the game.");
        const next = structuredClone(this.game);
        next.players = next.players.filter(
          (p) => p.id !== message?.id || !p.bot,
        );
        next.revision++;
        await this.commit(next);
      }, client),
    );
    this.onMessage("rematch", (client) =>
      this.enqueue(async () => {
        const actor = this.actor(client);
        if (actor !== this.game.host || this.game.status !== "finished")
          throw new RuleError(
            "Only the host can start a rematch after the game.",
          );
        const host = this.game.players.find((p) => p.id === actor)!;
        const next = createGame(
          actor,
          host.name,
          randomBytes(4).readUInt32LE(),
        );
        next.visibility = this.game.visibility;
        for (const p of this.game.players.filter((p) => p.id !== actor)) {
          addPlayer(next, p.id, p.name);
          next.players.find((x) => x.id === p.id)!.bot = p.bot;
        }
        next.players.forEach(
          (p) =>
            (p.connected = !!p.bot || [...this.actors.values()].includes(p.id)),
        );
        next.revision = this.game.revision + 1;
        await this.commit(next);
      }, client),
    );
    this.clock.setInterval(
      () => {
        if (this.clients.length === 0) this.disconnect();
      },
      30 * 60 * 1000,
    );
  }
  onAuth(_client: Client, options: { token?: unknown; name?: unknown }) {
    const id = identity(options.token);
    const existing = this.game.players.find((p) => p.id === id);
    if (
      !existing &&
      (this.game.status !== "lobby" || this.game.players.length >= 4)
    )
      throw new ServerError(403, "This table is full or already playing.");
    return { id, name: existing?.name ?? cleanName(options.name) };
  }
  async onJoin(client: Client) {
    await this.enqueue(async () => {
      const { id, name } = client.auth as { id: string; name: string };
      const next = structuredClone(this.game);
      if (!next.players.some((p) => p.id === id)) addPlayer(next, id, name);
      this.actors.set(client.sessionId, id);
      for (const other of this.clients)
        if (other !== client && this.actors.get(other.sessionId) === id)
          other.leave(4001, "Opened in another tab");
      next.players.find((p) => p.id === id)!.connected = true;
      next.revision++;
      await this.commit(next);
    });
  }
  async onDrop(client: Client) {
    await this.onLeave(client);
  }
  async onLeave(client: Client) {
    const id = this.actors.get(client.sessionId);
    this.actors.delete(client.sessionId);
    this.rates.delete(client.sessionId);
    if (!id) return;
    await this.enqueue(async () => {
      const next = structuredClone(this.game);
      const p = next.players.find((p) => p.id === id);
      if (p) p.connected = [...this.actors.values()].includes(id);
      if (p && !p.connected && next.status === "lobby" && id !== next.host)
        next.players = next.players.filter((player) => player.id !== id);
      next.revision++;
      await this.commit(next);
    });
  }
  private actor(client: Client) {
    const id = this.actors.get(client.sessionId);
    if (!id) throw new RuleError("Your connection is not ready.");
    return id;
  }
  private limit(client: Client) {
    const now = Date.now(),
      old = this.rates.get(client.sessionId),
      r = old && now - old.time < 1000 ? old : { time: now, count: 0 };
    if (++r.count > 20) throw new RuleError("Please slow down.");
    this.rates.set(client.sessionId, r);
  }
  private enqueue(fn: () => Promise<void>, client?: Client): Promise<unknown> {
    const job = this.chain.then(fn);
    this.chain = job.catch((error) => {
      if (client)
        client.send(
          "error",
          error instanceof RuleError || error instanceof ServerError
            ? error.message
            : "Could not save that move. Please try again.",
        );
      if (!(error instanceof RuleError) && !(error instanceof ServerError))
        console.error(
          "Room operation failed",
          error instanceof Error ? error.message : "Unknown error",
        );
    });
    return client ? this.chain : job;
  }
  private async commit(next: Game) {
    if (next.lastPlayed && next.lastPlayed.id !== this.game.lastPlayed?.id)
      next.playPauseUntil = Date.now() + 6000;
    if (next.lastRound && next.lastRound.round !== this.game.lastRound?.round)
      next.roundPauseUntil = Date.now() + 9000;
    await store.save(this.roomId, next);
    this.game = next;
    this.updateListing();
    for (const client of this.clients) this.sendView(client);
    this.scheduleBot();
  }
  onDispose() {
    publicRooms.delete(this.roomId);
  }
  private updateListing() {
    const host = this.game.players.find((p) => p.id === this.game.host);
    if (
      this.game.visibility === "public" &&
      this.game.status === "lobby" &&
      host?.connected &&
      this.game.players.length < 4
    ) {
      publicRooms.set(this.roomId, {
        code: this.roomId,
        hostName: host.name,
        players: this.game.players.length,
        bots: this.game.players.filter((p) => p.bot).length,
      });
    } else publicRooms.delete(this.roomId);
  }
  private scheduleBot() {
    this.botTimer?.clear();
    if (
      this.game.status !== "playing" ||
      !this.game.players.some((p) => !p.bot && p.connected)
    )
      return;
    const id = this.game.prompt?.actor ?? this.game.order[this.game.turnIndex],
      player = this.game.players.find((p) => p.id === id);
    if (!player?.bot) return;
    this.botTimer = this.clock.setTimeout(
      () => {
        void this.enqueue(async () => {
          const who =
            this.game.prompt?.actor ?? this.game.order[this.game.turnIndex];
          if (who !== id || this.game.status !== "playing") return;
          const view = publicView(this.game, id);
          let next: Game | undefined;
          for (let attempt = 0; attempt < 8 && !next; attempt++) {
            try {
              const action = botAction(
                view,
                attempt ? "easy" : player.bot!,
                this.game.revision * 997 + attempt * 31 + id.charCodeAt(4),
              );
              next = act(this.game, id, action);
            } catch (error) {
              if (attempt === 7) throw error;
            }
          }
          if (next) await this.commit(next);
        }).catch((error) =>
          console.error(
            "Bot could not act",
            error instanceof Error ? error.message : "Unknown error",
          ),
        );
      },
      Math.max(
        650,
        Math.max(
          this.game.roundPauseUntil ?? 0,
          this.game.playPauseUntil ?? 0,
        ) -
          Date.now() +
          100,
      ),
    );
  }
  private sendView(client: Client) {
    const id = this.actors.get(client.sessionId);
    if (id)
      client.send("view", {
        ...publicView(this.game, id),
        visibility: this.game.visibility ?? "private",
        playPauseMs: Math.max(0, (this.game.playPauseUntil ?? 0) - Date.now()),
        roundPauseMs: Math.max(
          0,
          (this.game.roundPauseUntil ?? 0) - Date.now(),
        ),
      });
  }
}
