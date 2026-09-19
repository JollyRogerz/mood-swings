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
import { parsePlannedChoices, playPlanned, previewPlay } from "../game/plan";
import {
  PRESENCES,
  REACTIONS,
  type Action,
  type Difficulty,
  type Game,
  type Presence,
  type PublicRoom,
} from "../game/types";
import { store } from "./store";
import {
  acknowledgeResults,
  acknowledgeReveal,
  isPace,
  pacing,
} from "../game/pacing";
import { reclaimSeat, recordRound, substituteBot } from "../game/seats";
import {
  armClock,
  clockView,
  expireClock,
  isClock,
  setClockScale,
  settleClock,
  waitingOn,
} from "../game/clock";
import { timeoutAction } from "../game/timeout";
setClockScale(Number(process.env.MOOD_CLOCK_SCALE ?? 1));
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
  // Four seats plus a gallery of spectators.
  maxClients = 4 + 60;
  autoDispose = false;
  game!: Game;
  private botTimer?: { clear(): void };
  private clockTimer?: { clear(): void };
  private chain: Promise<unknown> = Promise.resolve();
  private actors = new Map<string, string>();
  private rates = new Map<string, { time: number; count: number }>();
  // What each seated human is doing right now. Never persisted or scored.
  private activity = new Map<string, Presence>();
  // Spectators by connection. They receive the public table and nothing else,
  // and no message they send can change the game.
  private watchers = new Map<string, string>();
  private reactionSerial = 0;
  async onCreate(options: { key: string; code: string; snapshot: Game }) {
    if (options.key !== serverKey)
      throw new ServerError(403, "Create a table from the home screen.");
    this.roomId = options.code;
    this.game = options.snapshot;
    for (const p of this.game.players) p.connected = !!p.bot;
    // A restart should never time someone out the instant they reconnect.
    delete this.game.clockState;
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
    this.onMessage("pace", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        if (
          this.actor(client) !== this.game.host ||
          this.game.status !== "lobby"
        )
          throw new RuleError("Only the host can change pacing in the lobby.");
        if (!isPace(message?.pace)) throw new RuleError("Choose a table pace.");
        const next = structuredClone(this.game);
        next.pace = message.pace;
        next.revision++;
        await this.commit(next);
      }, client),
    );
    this.onMessage("clock", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        if (
          this.actor(client) !== this.game.host ||
          this.game.status !== "lobby"
        )
          throw new RuleError("Only the host can set the timer in the lobby.");
        if (!isClock(message?.clock)) throw new RuleError("Choose a timer.");
        const next = structuredClone(this.game);
        next.clock = message.clock;
        next.revision++;
        await this.commit(next);
      }, client),
    );
    this.onMessage("seat-bot", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        const next = structuredClone(this.game);
        substituteBot(next, this.actor(client), String(message?.id ?? ""));
        await this.commit(next);
      }, client),
    );
    this.onMessage("results-ready", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        const next = structuredClone(this.game);
        if (
          !acknowledgeResults(
            next,
            this.actor(client),
            message?.round,
            Date.now(),
          )
        )
          return;
        await this.commit(next);
      }, client),
    );
    this.onMessage("reveal-ready", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        const next = structuredClone(this.game);
        if (
          !acknowledgeReveal(
            next,
            this.actor(client),
            message?.playId,
            Date.now(),
          )
        )
          return;
        // Readiness changes presentation only, so it must not invalidate a plan.
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
        const action = message.action as Action;
        if (action?.type === "play")
          action.choices = parsePlannedChoices(action.choices);
        const next = playPlanned(this.game, actor, action);
        settleClock(next, this.game, actor, Date.now());
        await this.commit(next);
        if (this.activity.delete(actor)) this.broadcastPresence();
      }, client),
    );
    // Preview a play from the hand: which decision would it ask next?
    this.onMessage("preview", (client, message) => {
      try {
        this.limit(client);
        const actor = this.actor(client);
        if (
          this.game.status !== "playing" ||
          this.game.prompt ||
          this.game.scoring ||
          this.game.order[this.game.turnIndex] !== actor
        )
          return;
        client.send(
          "preview",
          previewPlay(
            this.game,
            actor,
            String(message?.card ?? ""),
            String(message?.grant ?? ""),
            parsePlannedChoices(message?.choices),
          ),
        );
      } catch (error) {
        if (!(error instanceof RuleError) && !(error instanceof ServerError))
          console.error(
            "Preview failed",
            error instanceof Error ? error.message : "Unknown error",
          );
      }
    });
    this.onMessage("react", (client, message) =>
      this.enqueue(async () => {
        this.limit(client);
        const player = this.actor(client);
        if (!REACTIONS.includes(message?.emoji)) return;
        this.broadcast("reaction", {
          id: ++this.reactionSerial,
          player,
          emoji: message.emoji,
        });
      }, client),
    );
    this.onMessage("presence", (client, message) =>
      this.enqueue(async () => {
        if (this.watchers.has(client.sessionId)) return;
        this.limit(client);
        const player = this.actor(client),
          state: Presence = PRESENCES.includes(message?.state)
            ? message.state
            : "idle";
        const before = this.activity.get(player);
        if (state === "idle") this.activity.delete(player);
        else this.activity.set(player, state);
        if (before !== this.activity.get(player)) this.broadcastPresence();
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
        const difficulty: Difficulty = [
          "easy",
          "normal",
          "hard",
          "fly",
        ].includes(message?.difficulty)
          ? message.difficulty
          : "normal";
        const next = structuredClone(this.game),
          names =
            difficulty === "fly"
              ? ["Drosophila", "Fern", "Ember", "Sage"]
              : ["Fern", "Ember", "Sage"];
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
        next.pace = this.game.pace;
        next.clock = this.game.clock;
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
  onAuth(
    _client: Client,
    options: { token?: unknown; name?: unknown; spectate?: unknown },
  ) {
    const id = identity(options.token);
    const existing = this.game.players.find((p) => p.id === id);
    // Anyone without a seat watches: by choice, or because the table is full
    // or already playing. A seated player always returns to their seat.
    const spectator =
      !existing &&
      (options.spectate === true ||
        this.game.status !== "lobby" ||
        this.game.players.length >= 4);
    if (spectator && this.watchers.size >= 60)
      throw new ServerError(403, "The gallery is full. Try again shortly.");
    return { id, name: existing?.name ?? cleanName(options.name), spectator };
  }
  async onJoin(client: Client) {
    const auth = client.auth as {
      id: string;
      name: string;
      spectator: boolean;
    };
    if (auth.spectator) {
      this.watchers.set(client.sessionId, auth.name);
      this.updateListing();
      for (const other of this.clients) this.sendView(other);
      return;
    }
    await this.enqueue(async () => {
      const { id, name } = auth;
      const next = structuredClone(this.game);
      if (!next.players.some((p) => p.id === id)) addPlayer(next, id, name);
      this.actors.set(client.sessionId, id);
      for (const other of this.clients)
        if (other !== client && this.actors.get(other.sessionId) === id)
          other.leave(4001, "Opened in another tab");
      reclaimSeat(next, id);
      next.players.find((p) => p.id === id)!.connected = true;
      next.revision++;
      await this.commit(next);
    });
  }
  async onDrop(client: Client) {
    await this.onLeave(client);
  }
  async onLeave(client: Client) {
    if (this.watchers.delete(client.sessionId)) {
      this.rates.delete(client.sessionId);
      this.updateListing();
      for (const other of this.clients) this.sendView(other);
      return;
    }
    const id = this.actors.get(client.sessionId);
    this.actors.delete(client.sessionId);
    this.rates.delete(client.sessionId);
    if (!id) return;
    if (this.activity.delete(id)) this.broadcastPresence();
    await this.enqueue(async () => {
      const next = structuredClone(this.game);
      const p = next.players.find((p) => p.id === id);
      if (p) p.connected = !!p.bot || [...this.actors.values()].includes(id);
      if (p && !p.connected && next.status === "lobby" && id !== next.host)
        next.players = next.players.filter((player) => player.id !== id);
      next.revision++;
      await this.commit(next);
    });
  }
  private actor(client: Client) {
    const id = this.actors.get(client.sessionId);
    if (!id)
      throw new RuleError(
        this.watchers.has(client.sessionId)
          ? "Spectators can watch, not play."
          : "Your connection is not ready.",
      );
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
    if (next.lastPlayed && next.lastPlayed.id !== this.game.lastPlayed?.id) {
      next.playPauseUntil = Date.now() + pacing(next.pace).reveal;
      next.revealReady = [];
    }
    if (next.lastRound && next.lastRound.round !== this.game.lastRound?.round) {
      next.roundPauseUntil =
        Math.max(Date.now(), next.playPauseUntil ?? 0) +
        pacing(next.pace).results;
      next.resultsReady = [];
    }
    recordRound(next, this.game);
    const waiting = waitingOn(next);
    armClock(next, Date.now(), {
      humanConnected: next.players.some((p) => !p.bot && p.connected),
      nothingToDecide:
        !!waiting &&
        !next.prompt &&
        Object.keys(publicView(next, waiting).playable).length === 0,
    });
    await store.save(this.roomId, next);
    this.game = next;
    this.updateListing();
    for (const client of this.clients) this.sendView(client);
    this.scheduleBot();
    this.scheduleClock();
  }
  // When a human's allowance ends: first their bank starts to drain, then the
  // table acts for them. Every step re-validates against the live game.
  private scheduleClock() {
    this.clockTimer?.clear();
    const state = this.game.clockState;
    if (!state) return;
    this.clockTimer = this.clock.setTimeout(
      () => {
        void this.enqueue(async () => {
          const next = structuredClone(this.game);
          const outcome = expireClock(next, Date.now());
          if (outcome === "none") return this.scheduleClock();
          if (outcome === "overtime") return this.commit(next);
          const actor = state.actor,
            name = next.players.find((p) => p.id === actor)?.name ?? "A player",
            view = publicView(next, actor);
          let acted: Game | undefined;
          for (let attempt = 0; attempt < 8 && !acted; attempt++)
            try {
              acted = act(
                next,
                actor,
                attempt
                  ? botAction(view, "easy", next.revision * 31 + attempt)
                  : timeoutAction(view, next.revision * 997),
              );
            } catch (error) {
              if (attempt === 7) throw error;
            }
          if (!acted) return;
          acted.log.push({
            id: ++acted.serial,
            text: view.prompt
              ? `${name} ran out of time; the table decided for them.`
              : `${name} ran out of time; their turn ended.`,
          });
          if (acted.log.length > 120) acted.log.shift();
          await this.commit(acted);
        }).catch((error) =>
          console.error(
            "Clock could not act",
            error instanceof Error ? error.message : "Unknown error",
          ),
        );
      },
      Math.max(50, state.deadline - Date.now() + 30),
    );
  }
  onDispose() {
    publicRooms.delete(this.roomId);
  }
  private updateListing() {
    const host = this.game.players.find((p) => p.id === this.game.host);
    // Public tables are listed while they can be joined or watched.
    if (
      this.game.visibility === "public" &&
      host?.connected &&
      this.game.status !== "finished"
    ) {
      publicRooms.set(this.roomId, {
        code: this.roomId,
        hostName: host.name,
        players: this.game.players.length,
        bots: this.game.players.filter((p) => p.bot).length,
        status: this.game.status,
        pace: this.game.pace ?? "standard",
        clock: this.game.clock ?? "off",
        spectators: this.watchers.size,
      });
    } else publicRooms.delete(this.roomId);
  }
  // A human with no legal play left has nothing to decide: their turn ends by
  // itself once the table has finished reading.
  private exhausted(id: string) {
    return (
      !this.game.prompt &&
      !this.game.scoring &&
      this.game.order[this.game.turnIndex] === id &&
      Object.keys(publicView(this.game, id).playable).length === 0
    );
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
    if (!player) return;
    if (!player.bot && !this.exhausted(id)) return;
    const revision = this.game.revision;
    this.botTimer = this.clock.setTimeout(
      () => {
        void this.enqueue(async () => {
          const who =
            this.game.prompt?.actor ?? this.game.order[this.game.turnIndex];
          if (who !== id || this.game.status !== "playing") return;
          if (!player.bot) {
            if (this.game.revision !== revision || !this.exhausted(id)) return;
            await this.commit(act(this.game, id, { type: "pass" }));
            return;
          }
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
            player.bot ? "Bot could not act" : "Could not end the turn",
            error instanceof Error ? error.message : "Unknown error",
          ),
        );
      },
      Math.max(
        player.bot ? 650 : 1200,
        Math.max(
          this.game.roundPauseUntil ?? 0,
          this.game.playPauseUntil ?? 0,
        ) -
          Date.now() +
          100,
      ),
    );
  }
  private broadcastPresence() {
    this.broadcast("presence", Object.fromEntries(this.activity));
  }
  private sendView(client: Client) {
    const spectator = this.watchers.has(client.sessionId);
    const id = spectator ? "spectator" : this.actors.get(client.sessionId);
    if (id)
      client.send("view", {
        ...publicView(this.game, id, true),
        spectator,
        spectators: this.watchers.size,
        history: this.game.history ?? [],
        resultsReady: this.game.resultsReady ?? [],
        presence: Object.fromEntries(this.activity),
        pace: this.game.pace ?? "standard",
        clock: clockView(this.game, Date.now()),
        revealReady: this.game.revealReady ?? [],
        visibility: this.game.visibility ?? "private",
        playPauseMs: Math.max(0, (this.game.playPauseUntil ?? 0) - Date.now()),
        roundPauseMs: Math.max(
          0,
          (this.game.roundPauseUntil ?? 0) - Date.now(),
        ),
      });
  }
}
