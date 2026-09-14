import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Client, type Room } from "@colyseus/sdk";
import {
  Bot,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Crown,
  ExternalLink,
  Flag,
  HelpCircle,
  HeartCrack,
  Layers,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
  BookOpen,
  RotateCcw,
  Wifi,
  WifiOff,
  MessageSquare,
} from "lucide-react";
import { catalog } from "../game/catalog";
import {
  PRESENCES,
  REACTIONS,
  type PlannedChoice,
  type Presence,
  type Reaction,
} from "../game/types";
import type { Preview, PromptView } from "../game/plan";
import type {
  Action,
  Difficulty,
  PublicCard,
  PublicRoom,
  View,
} from "../game/types";
import "./style.css";
import "./scrapbook.css";
import "./polish.css";
import { PACING, pacing } from "../game/pacing";
import {
  Score,
  TableSettings,
  sound,
  usePreferences,
  usePresentedTable,
  useTableMotion,
  useTurnSound,
} from "./polish";
import { Targeting, TableFrame, type Targets } from "./targeting";
const botLabel = (d: Difficulty) =>
  d === "fly" ? "fly brain bot" : `${d} bot`;
const colorNames: Record<string, string> = {
  white: "Clarity",
  blue: "Thought",
  black: "Ambition",
  red: "Impulse",
  green: "Connection",
};
const token =
  localStorage.getItem("mood-session") ??
  crypto.randomUUID() + crypto.randomUUID();
localStorage.setItem("mood-session", token);
const serverURL = import.meta.env.DEV
  ? `${location.protocol}//${location.hostname}:3000`
  : location.origin;
async function post(url: string, body: unknown) {
  const response = await fetch(serverURL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not reach the table.");
  return data;
}
const startingCode =
  location.pathname.match(/^\/room\/([A-Z2-9]{8})$/i)?.[1].toUpperCase() ?? "";
function App() {
  const { preferences, update, reduced } = usePreferences();
  const [targets, setTargets] = useState<Targets>();
  const [name, setName] = useState(localStorage.getItem("mood-name") ?? ""),
    [code, setCode] = useState(startingCode),
    [roomCode, setRoomCode] = useState(startingCode),
    [view, setView] = useState<View>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [catalogOpen, setCatalogOpen] = useState(false),
    [help, setHelp] = useState(false),
    [inspect, setInspect] = useState<string>(),
    [activity, setActivity] = useState(false),
    [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [reactions, setReactions] = useState<
    { id: number; player: string; emoji: Reaction }[]
  >([]);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [holding, setHolding] = useState(false);
  const [plan, setPlan] = useState<Preview>();
  const [hidden, setHidden] = useState(document.hidden);
  const [roundDeadline, setRoundDeadline] = useState(0);
  const [playDeadline, setPlayDeadline] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const playPaused = playDeadline > clockNow;
  const roundPaused = roundDeadline > clockNow && !playPaused;
  const interactionPaused = roundPaused || playPaused;
  const table = usePresentedTable(view, playPaused && !roundPaused, connected);
  useTableMotion(table, reduced, connected);
  useTurnSound(view, interactionPaused, connected);
  useEffect(() => {
    if (!interactionPaused) return;
    const timer = setInterval(() => setClockNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [interactionPaused]);
  const [botDifficulty, setBotDifficulty] = useState<Difficulty>("normal");
  const room = useRef<Room | null>(null),
    keepConnected = useRef(false),
    retries = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    viewRef = useRef<View | undefined>(undefined);
  viewRef.current = view;
  async function connect(target: string) {
    await post(`/api/rooms/${target}/connect`, { token });
    const client = new Client(serverURL);
    const joined = await client.joinById(target, {
      token,
      name: localStorage.getItem("mood-name") ?? name,
    });
    room.current = joined;
    joined.reconnection.enabled = false;
    joined.onMessage("view", (v: View) => {
      setView(v);
      if (v.presence) setPresence(v.presence);
      setClockNow(Date.now());
      setRoundDeadline(v.roundPauseMs ? Date.now() + v.roundPauseMs : 0);
      setPlayDeadline(v.playPauseMs ? Date.now() + v.playPauseMs : 0);
      setError("");
      setBusy(false);
      setConnected(true);
      retries.current = 0;
    });
    joined.onMessage("error", (message: string) => {
      setError(message);
      setBusy(false);
    });
    joined.onMessage(
      "reaction",
      (r: { id: number; player: string; emoji: Reaction }) => {
        setReactions((old) => [...old.slice(-11), r]);
        setTimeout(
          () => setReactions((old) => old.filter((x) => x.id !== r.id)),
          3200,
        );
      },
    );
    joined.onMessage("presence", (p: Record<string, Presence>) =>
      setPresence(p),
    );
    joined.onMessage("preview", (p: Preview) => setPlan(p));
    joined.onError((_code, message) =>
      setError(message ?? "Connection interrupted."),
    );
    joined.onLeave((exitCode) => {
      setConnected(false);
      room.current = null;
      if (exitCode === 4001) {
        keepConnected.current = false;
        setError("This table was opened in another tab.");
        return;
      }
      scheduleReconnect(target);
    });
    joined.send("sync");
    setRoomCode(target);
    history.replaceState({}, "", `/room/${target}`);
    keepConnected.current = true;
  }
  function scheduleReconnect(target: string) {
    if (!keepConnected.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        connect(target).catch(() => {
          setError("Reconnecting to your table…");
          scheduleReconnect(target);
        });
      },
      Math.min(1000 * 2 ** retries.current++, 10000),
    );
  }
  async function enter(create: boolean, selectedCode?: string) {
    if (!name.trim()) {
      setError("What should we call you at the table?");
      return;
    }
    setBusy(true);
    setError("");
    localStorage.setItem("mood-name", name.trim());
    try {
      const target = create
        ? (await post("/api/rooms", { name, token, visibility })).code
        : (selectedCode ?? code).trim().toUpperCase();
      await connect(target);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    if (startingCode && localStorage.getItem("mood-name")) {
      setBusy(true);
      connect(startingCode).catch((e) => {
        setError(e.message);
        setBusy(false);
      });
    }
    return () => {
      keepConnected.current = false;
      clearTimeout(timer.current);
      room.current?.leave();
    };
  }, []);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  // Tell the table what you are up to while others wait. Purely cosmetic.
  const myPresence: Presence = hidden
    ? "away"
    : inspect
      ? "reading"
      : catalogOpen || help
        ? "rules"
        : holding
          ? "holding"
          : "idle";
  useEffect(() => {
    if (connected && view?.status === "playing")
      room.current?.send("presence", { state: myPresence });
  }, [myPresence, connected, view?.status]);
  function react(emoji: Reaction) {
    if (connected) room.current?.send("react", { emoji });
  }
  const requestPlan = useCallback(
    (card: string, grant: string, choices: PlannedChoice[]) => {
      if (connected) room.current?.send("preview", { card, grant, choices });
    },
    [connected],
  );
  function send(action: Action) {
    if (!connected || !viewRef.current || busy || interactionPaused) return;
    setBusy(true);
    setError("");
    room.current?.send("action", {
      revision: viewRef.current.revision,
      action,
    });
  }
  async function invite() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/room/${roomCode}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(`Share this link: ${location.origin}/room/${roomCode}`);
    }
  }
  function leave() {
    keepConnected.current = false;
    clearTimeout(timer.current);
    room.current?.leave();
    room.current = null;
    setView(undefined);
    setRoomCode("");
    setCode("");
    setConnected(false);
    setError("");
    history.replaceState({}, "", "/");
  }
  const inspected = catalog.find((c) => c.id === inspect);
  // The table ends a turn by itself once its player has no legal play left.
  const outOfPlays =
    !!view &&
    view.status === "playing" &&
    view.active === view.you &&
    !view.prompt &&
    !view.scoring &&
    Object.keys(view.playable).length === 0;
  return (
    <TableFrame
      targets={targets}
      className={view ? "app game-app" : "app"}
      reduced={reduced}
    >
      <header className="site-header">
        <button
          className="brand"
          onClick={() =>
            view
              ? setHelp(true)
              : window.scrollTo({ top: 0, behavior: "smooth" })
          }
          aria-label="Mood Swings home"
        >
          <span className="brand-symbol">
            m<span>✳</span>
          </span>
          <span>
            mood swings
            <span className="brand-small">THE UNOFFICIAL ONLINE TABLE</span>
          </span>
        </button>
        <nav>
          <TableSettings preferences={preferences} update={update} />
          <button onClick={() => setCatalogOpen(true)}>
            <Layers size={16} />
            <span>The cards</span>
          </button>
          <button onClick={() => setHelp(true)}>
            <BookOpen size={16} />
            <span>How to play</span>
          </button>
          {view ? (
            <span className={`connection ${connected ? "" : "offline"}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{connected ? "Connected" : "Reconnecting"}</span>
            </span>
          ) : (
            <span className="private-label">
              <span className="status-dot" />
              Made for a night with friends
            </span>
          )}
        </nav>
      </header>
      {error && (
        <div className="toast" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {!view ? (
        <main className="landing">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="tiny-star">✳</span> GOOD COMPANY. UNPREDICTABLE
                CARDS.
              </div>
              <h1>
                A little strategy.
                <br />A lot of <em>feelings.</em>
              </h1>
              <p className="hero-description">
                Bring your friends. Play your moods.
                <br />
                One shared deck. A wonderfully unpredictable table.
              </p>
              <div className="entry-panel">
                <label htmlFor="name">YOUR NAME AT THE TABLE</label>
                <input
                  id="name"
                  autoComplete="nickname"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Something your friends call you"
                  onKeyDown={(e) => e.key === "Enter" && enter(!code)}
                />
                <label className="visibility-choice">
                  Table visibility
                  <select
                    aria-label="Table visibility"
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as "private" | "public")
                    }
                  >
                    <option value="private">Private · invite friends</option>
                    <option value="public">Public · welcome everyone</option>
                  </select>
                </label>
                <div className="entry-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => enter(true)}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Plus size={18} />
                    )}
                    Create a table
                    <ArrowRight size={18} />
                  </button>
                  <div className="join-row">
                    <input
                      aria-label="Room code"
                      value={code}
                      maxLength={8}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="ROOM CODE"
                      onKeyDown={(e) => e.key === "Enter" && enter(false)}
                    />
                    <button
                      disabled={busy || code.length !== 8}
                      onClick={() => enter(false)}
                    >
                      Join <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="game-facts">
                <span>
                  <Users size={16} /> 2–4 friends
                </span>
                <span>
                  <RotateCcw size={15} /> 5–10 minutes
                </span>
                <span>
                  <Crown size={16} /> First to 3 wins
                </span>
              </div>
            </div>
            <div className="hero-art" aria-label="Mood Swings card collection">
              <div className="collage-paper" aria-hidden="true" />
              <div className="collage-title" aria-hidden="true">
                <span>MOOD</span>
                <span>SWINGS</span>
              </div>
              <div className="collage-sticker" aria-hidden="true">
                REAL CARDS.
                <br />
                BIG FEELINGS.
              </div>
              <span className="art-caption">THE WHOLE TABLE IS A MOOD.</span>
              <div className="art-star">✳</div>
              <img
                className="hero-card card-left"
                src="/assets/cards/curiosity.webp"
                alt="Curiosity card"
              />
              <img
                className="hero-card card-right"
                src="/assets/cards/chaos.webp"
                alt="Chaos card"
              />
              <img
                className="hero-card card-front"
                src="/assets/cards/love.webp"
                alt="Love card"
              />
              <div className="art-note">
                <Sparkles size={18} />
                <span>
                  No two games
                  <br />
                  <strong>feel quite the same.</strong>
                </span>
              </div>
              <span className="art-coordinate">
                133 CARDS. EVERY FEELING INCLUDED.
              </span>
            </div>
          </section>
          <section className="color-strip">
            {Object.entries(colorNames).map(([c, n]) => (
              <div key={c}>
                <span className={`color-dot ${c}`} />
                <span>{n}</span>
              </div>
            ))}
            <button onClick={() => setCatalogOpen(true)}>
              Meet all 133 moods <ArrowUpRight size={17} />
            </button>
          </section>
          <PublicTables busy={busy} onJoin={(target) => enter(false, target)} />
          <section className="intro">
            <div>
              <span className="eyebrow">SIMPLE TO START. HARD TO PREDICT.</span>
              <h2>
                Your next game night,
                <br />a little more emotional.
              </h2>
            </div>
            <div className="steps">
              {[
                [
                  "01",
                  "Play a mood",
                  "Add a card to your side of the table. Its effect might change everything.",
                ],
                [
                  "02",
                  "Feel the shift",
                  "Your moods stay in play. Build your score, or turn someone else’s plans upside down.",
                ],
                [
                  "03",
                  "Win three rounds",
                  "The highest score takes the round. Keep your friends guessing until the last card.",
                ],
              ].map(([n, h, t]) => (
                <article key={n}>
                  <span>{n}</span>
                  <h3>{h}</h3>
                  <p>{t}</p>
                </article>
              ))}
            </div>
          </section>
          <DonationPanel />
          <footer>
            <span>A fan-made table for Mood Swings.</span>
            <span>
              Original game, card art & text © Wizards of the Coast. Not
              affiliated or endorsed.
            </span>
            <a
              href="https://magic.wizards.com/en/news/feature/mood-swings-extended-rules"
              target="_blank"
              rel="noreferrer"
            >
              Official rules <ExternalLink size={12} />
            </a>
          </footer>
        </main>
      ) : view.status === "lobby" ? (
        <main className="lobby">
          <div className="eyebrow">YOUR TABLE IS READY</div>
          <h1>
            Good company
            <br />
            is on its way.
          </h1>
          <p>Pull up a chair. Pick your company. Bring all your feelings.</p>
          <button className="invite-code" onClick={invite}>
            <span>
              <small>
                {view.visibility === "public" ? "PUBLIC ROOM" : "PRIVATE ROOM"}
              </small>
              {roomCode}
            </span>
            {copied ? <Check /> : <Copy />}
          </button>
          {view.you === view.host && (
            <label className="visibility-choice">
              Table visibility
              <select
                aria-label="Lobby visibility"
                value={view.visibility ?? "private"}
                disabled={!connected}
                onChange={(e) =>
                  room.current?.send("visibility", {
                    visibility: e.target.value,
                  })
                }
              >
                <option value="private">Private · invite friends</option>
                <option value="public">Public · listed on the home page</option>
              </select>
            </label>
          )}
          <label className="pace-choice">
            Table pace
            <select
              aria-label="Table pace"
              value={view.pace ?? "standard"}
              disabled={!connected || view.you !== view.host}
              onChange={(e) =>
                room.current?.send("pace", { pace: e.target.value })
              }
            >
              {Object.entries(PACING).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
            <small>
              {pacing(view.pace).reveal / 1000}s to read each card · everyone
              can ready up early
            </small>
          </label>
          <div className="lobby-seats">
            {[0, 1, 2, 3].map((i) => {
              const p = view.players[i];
              return (
                <div className={`lobby-seat ${p ? "occupied" : ""}`} key={i}>
                  {p ? (
                    <>
                      <Avatar name={p.name} index={i} />
                      <strong>
                        {p.name}
                        {p.id === view.you ? " (you)" : ""}
                      </strong>
                      <small>
                        {p.bot
                          ? botLabel(p.bot)
                          : p.id === view.host
                            ? "Host"
                            : "Ready to play"}
                      </small>
                      {p.bot && view.you === view.host && (
                        <button
                          className="remove-bot"
                          aria-label={`Remove ${p.name}`}
                          onClick={() =>
                            room.current?.send("remove-bot", { id: p.id })
                          }
                        >
                          <X size={13} />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="empty-avatar">
                        <Plus />
                      </span>
                      <strong>Open seat</strong>
                      <small>Waiting for a friend</small>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lobby-bottom">
            {view.you === view.host && view.players.length < 4 && (
              <div className="bot-controls">
                <Bot size={17} />
                <span>Solo or one seat short?</span>
                <select
                  aria-label="Bot difficulty"
                  value={botDifficulty}
                  onChange={(e) =>
                    setBotDifficulty(e.target.value as Difficulty)
                  }
                >
                  <option value="easy">Easy bot</option>
                  <option value="normal">Normal bot</option>
                  <option value="hard">Hard bot</option>
                  <option value="fly">Fly brain bot</option>
                </select>
                <button
                  onClick={() =>
                    room.current?.send("add-bot", {
                      difficulty: botDifficulty,
                    })
                  }
                  disabled={!connected}
                >
                  <Plus size={14} />
                  Add bot
                </button>
              </div>
            )}
            {view.you === view.host ? (
              <button
                className={`primary ${view.players.length >= 2 && !busy && connected ? "attention" : ""}`}
                disabled={view.players.length < 2 || busy || !connected}
                onClick={() => {
                  setBusy(true);
                  room.current?.send("start", { mode: "retail" });
                }}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
                Start the game <ArrowRight size={18} />
              </button>
            ) : (
              <p>Your host will start when everyone’s here.</p>
            )}
            <span>45 cards · A fresh deck every game · First to 3 wins</span>
          </div>
          <button className="text-button" onClick={leave}>
            <LogOut size={14} /> Leave table
          </button>
        </main>
      ) : (
        <main className="table-layout">
          <div className="table-topline">
            <div className="table-title">
              <span className="eyebrow">THE SHARED TABLE</span>
              <h2>Make yourself felt.</h2>
            </div>
            <div className="table-tools">
              <button onClick={invite}>
                <span className="room-code">{roomCode}</span>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                onClick={() => setActivity(!activity)}
                aria-label="Game activity"
              >
                <MessageSquare size={18} />
              </button>
              <button onClick={leave} aria-label="Leave table">
                <LogOut size={17} />
              </button>
            </div>
          </div>
          <div className="table-feedback" role="status" aria-live="polite">
            <span className="feedback-label">
              {interactionPaused
                ? "AT THE TABLE"
                : view.waitingFor
                  ? "CHOOSING"
                  : "LATEST MOVE"}
            </span>
            <span>
              {interactionPaused
                ? "A moment for everyone to take it in."
                : (view.log.at(-1)?.text ?? "Your table is ready.")}
            </span>
            {view.lastPlayed && (
              <button onClick={() => setInspect(view.lastPlayed!.def)}>
                Last played <ArrowUpRight size={14} />
              </button>
            )}
          </div>
          <section className={`board players-${view.players.length}`}>
            <div className="board-watermark">
              mood swings<span>EVERY CARD CHANGES THE FEELING</span>
            </div>
            <div className="opponent-row">
              {table!.players
                .filter((p) => p.id !== view.you)
                .map((p) => (
                  <PlayerZone
                    key={p.id}
                    player={p}
                    index={view.players.findIndex((x) => x.id === p.id)}
                    moods={table!.moods.filter((c) => c.owner === p.id)}
                    active={view.active === p.id}
                    inspect={setInspect}
                    doing={describeActivity(
                      p,
                      view,
                      presence,
                      playPaused,
                      roundPaused,
                    )}
                    reactions={reactions
                      .filter((r) => r.player === p.id)
                      .map((r) => ({ id: r.id, emoji: r.emoji }))}
                  />
                ))}
            </div>
            <div className="table-center">
              <div className="deck-stack">
                <CardBack />
                <span>{table!.deckCount} in deck</span>
              </div>
              <div className="round-marker">
                <span>ROUND</span>
                <strong>{String(view.round).padStart(2, "0")}</strong>
                <small>FIRST TO THREE</small>
              </div>
              <button
                className="discard-stack"
                onClick={() => setActivity(true)}
              >
                {table!.discard.length ? (
                  <img
                    src={table!.discard[table!.discard.length - 1].image}
                    alt="Top of discard pile"
                  />
                ) : (
                  <span className="empty-discard">
                    <Layers size={24} />
                  </span>
                )}
                <span>{table!.discard.length} discarded</span>
              </button>
            </div>
            <div className="your-moods">
              <div className="zone-label">
                <span>YOUR MOODS</span>
                <div
                  className="your-score"
                  aria-label="Your current points"
                  aria-live="polite"
                >
                  <Score
                    value={
                      table!.players.find((p) => p.id === view.you)?.score ?? 0
                    }
                  />
                  <span>YOUR POINTS</span>
                </div>
              </div>
              <div className="mood-row">
                {table!.moods
                  .filter((c) => c.owner === view.you)
                  .map((c) => (
                    <MoodCard
                      key={c.uid}
                      c={c}
                      onClick={() => setInspect(c.copy ?? c.def)}
                    />
                  ))}
                {!table!.moods.some((c) => c.owner === view.you) && (
                  <span className="empty-zone">
                    Every feeling starts somewhere. Play your first mood.
                  </span>
                )}
              </div>
            </div>
          </section>
          <section className="hand-section">
            <div className="hand-heading">
              <div className="you-label">
                <Avatar
                  name={view.players.find((p) => p.id === view.you)?.name ?? ""}
                  index={view.players.findIndex((p) => p.id === view.you)}
                  reactions={reactions
                    .filter((r) => r.player === view.you)
                    .map((r) => ({ id: r.id, emoji: r.emoji }))}
                />
                <div>
                  <strong>
                    {view.players.find((p) => p.id === view.you)?.name}{" "}
                    <small>YOU</small>
                  </strong>
                  <WinDots
                    wins={
                      view.players.find((p) => p.id === view.you)?.wins ?? 0
                    }
                  />
                </div>
              </div>
              <div
                className={`turn-status ${view.active === view.you ? "your-turn" : ""}`}
              >
                <span className="status-dot" />
                {playPaused
                  ? "Reading the played mood"
                  : roundPaused
                    ? "Round results"
                    : view.scoring
                      ? "Scoring the round"
                      : view.waitingFor
                        ? `${view.players.find((p) => p.id === view.waitingFor)?.name} is choosing`
                        : view.active === view.you
                          ? outOfPlays
                            ? "Nothing left to play. Moving on…"
                            : "Your turn. How are you feeling?"
                          : `${view.players.find((p) => p.id === view.active)?.name}’s turn`}
              </div>
              <div className="reaction-bar" aria-label="Send a reaction">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => react(emoji)}
                    disabled={!connected}
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button
                className={`end-turn ${
                  view.active === view.you &&
                  !view.waitingFor &&
                  !view.scoring &&
                  !interactionPaused &&
                  !busy &&
                  connected &&
                  !outOfPlays
                    ? "attention"
                    : ""
                }`}
                disabled={
                  view.active !== view.you ||
                  !!view.waitingFor ||
                  view.scoring ||
                  interactionPaused ||
                  busy ||
                  !connected ||
                  outOfPlays
                }
                onClick={() => send({ type: "pass" })}
              >
                {outOfPlays
                  ? "Moving on"
                  : view.grants.length
                    ? "End turn"
                    : "Continue"}
                <ArrowRight size={16} />
              </button>
            </div>
            <Hand
              view={table!}
              setTargets={setTargets}
              send={send}
              inspect={setInspect}
              disabled={busy || !connected || interactionPaused}
              onHold={setHolding}
              plan={plan}
              requestPlan={requestPlan}
            />
          </section>
          {view.prompt && !interactionPaused && (
            <ChoicePanel
              setTargets={setTargets}
              key={view.prompt.id}
              view={view}
              send={send}
              disabled={busy || !connected || interactionPaused}
            />
          )}
          {activity && (
            <aside className="activity-panel">
              <div className="panel-heading">
                <h3>At the table</h3>
                <button
                  onClick={() => setActivity(false)}
                  aria-label="Close activity"
                >
                  <X size={20} />
                </button>
              </div>
              <h4>DISCARD PILE</h4>
              <div className="discard-list">
                {view.discard.map((c) => (
                  <button key={c.uid} onClick={() => setInspect(c.def)}>
                    <span className={`color-dot ${c.color}`} />
                    {c.name}
                    {view.playable[c.uid] && (
                      <span className="available-tag">Playable</span>
                    )}
                  </button>
                ))}
                {!view.discard.length && <p>No discarded cards yet.</p>}
              </div>
              <h4>RECENT ACTIVITY</h4>
              <ol>
                {[...view.log].reverse().map((e) => (
                  <li key={e.id}>{e.text}</li>
                ))}
              </ol>
            </aside>
          )}
          {playPaused && !roundPaused && view.lastPlayed && (
            <PlayedCardReveal
              view={view}
              remaining={playDeadline - clockNow}
              ready={() =>
                room.current?.send("reveal-ready", {
                  playId: view.lastPlayed!.id,
                })
              }
            />
          )}
          {roundPaused && view.lastRound && (
            <RoundResults view={view} remaining={roundDeadline - clockNow} />
          )}
          {view.status === "finished" && !roundPaused && (
            <div className="modal-backdrop">
              <div className="winner-modal">
                <span className="winner-flower">✳</span>
                <span className="eyebrow">THAT’S A LOT OF FEELINGS</span>
                <h1>
                  {view.players.find((p) => p.id === view.winner)?.name}
                  <br />
                  <em>takes the table.</em>
                </h1>
                <p>Three rounds. One very good game.</p>
                <div className="final-scores">
                  {view.players.map((p) => (
                    <div key={p.id}>
                      <strong>{p.name}</strong>
                      <WinDots wins={p.wins} />
                    </div>
                  ))}
                </div>
                {view.you === view.host ? (
                  <button
                    className="primary attention"
                    onClick={() => room.current?.send("rematch")}
                  >
                    Another round of feelings <RotateCcw size={17} />
                  </button>
                ) : (
                  <p>Waiting for your host to start a rematch.</p>
                )}
                <button className="text-button" onClick={leave}>
                  Back to the beginning
                </button>
              </div>
            </div>
          )}
        </main>
      )}
      <CardZoom />
      {catalogOpen && (
        <Catalog close={() => setCatalogOpen(false)} inspect={setInspect} />
      )}
      {inspected && (
        <div className="modal-backdrop" onClick={() => setInspect(undefined)}>
          <div className="inspect-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-modal"
              onClick={() => setInspect(undefined)}
              aria-label="Close card"
            >
              <X />
            </button>
            <img src={"/" + inspected.images[0].path} alt={inspected.name} />
            <div>
              <span className="eyebrow">
                {inspected.color} · {inspected.rarity}
              </span>
              <h2>{inspected.name}</h2>
              <p>
                {inspected.rules_text || "A simple mood. No special effect."}
              </p>
              <details>
                <summary>
                  Card notes <ChevronDown size={15} />
                </summary>
                <ul>
                  {inspected.rulings.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-modal"
              onClick={() => setHelp(false)}
              aria-label="Close rules"
            >
              <X />
            </button>
            <span className="eyebrow">A QUICK FEEL FOR THE GAME</span>
            <h2>
              Play a mood.
              <br />
              Change the table.
            </h2>
            <ol>
              <li>
                <strong>Start with five cards.</strong> Everyone shares the deck
                and discard pile.
              </li>
              <li>
                <strong>Play one card on your turn, or pass.</strong> Follow its
                effect. Some cards grant extra plays. Choose “End turn” when
                you’re ready.
              </li>
              <li>
                <strong>Your moods stay in play.</strong> Their values can
                change as the table changes.
              </li>
              <li>
                <strong>After everyone’s turn, score.</strong> Highest score
                wins the round. Ties favor whoever went earlier.
              </li>
              <li>
                <strong>The winner starts next round.</strong> Each loser draws
                a card. With three or four players, the lowest scorer gets an
                extra play next turn: Hurt Feelings.
              </li>
              <li>
                <strong>Win three rounds to win the game.</strong> Card effects
                can change the usual rules!
              </li>
            </ol>
            <p>
              Click any mood to inspect it. Your hand is visible only to you.
              You can rejoin this table from the same browser after a
              disconnect.
            </p>
            <a
              href="https://magic.wizards.com/en/news/feature/mood-swings-extended-rules"
              target="_blank"
              rel="noreferrer"
            >
              Read the full official rules <ExternalLink size={15} />
            </a>
          </div>
        </div>
      )}
    </TableFrame>
  );
}
function Avatar({
  name,
  index,
  reactions = [],
}: {
  name: string;
  index: number;
  reactions?: { id: number; emoji: Reaction }[];
}) {
  return (
    <span className={`avatar avatar-${index}`}>
      {name.slice(0, 1).toUpperCase()}
      {reactions.map((r) => (
        <span className="reaction-bubble" key={r.id} role="img">
          {r.emoji}
        </span>
      ))}
    </span>
  );
}
// A line about what an opponent is doing while you wait for them.
function describeActivity(
  p: View["players"][number],
  view: View,
  presence: Record<string, Presence>,
  playPaused: boolean,
  roundPaused: boolean,
): string | undefined {
  if (!p.connected) return "Away from the table";
  if (roundPaused || view.status !== "playing") return undefined;
  if (playPaused) return "Reading the played mood";
  const doing = presence[p.id];
  if (doing === "away") return "Stepped away for a moment";
  if (view.waitingFor === p.id) return "Deciding on a card effect…";
  if (doing === "reading") return "Reading a card";
  if (doing === "rules") return "Checking the rules";
  if (doing === "holding") return "Holding a card…";
  if (view.active === p.id && !view.scoring)
    return p.bot
      ? p.bot === "fly"
        ? "Sniffing the table…"
        : "Thinking…"
      : !view.grants.length && !p.handCount
        ? "Out of plays, moving on…"
        : "Choosing a mood…";
  return undefined;
}
function WinDots({ wins }: { wins: number }) {
  return (
    <span className="win-dots" aria-label={`${wins} round wins`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < wins ? "won" : ""}>
          {i < wins ? <Crown size={10} /> : null}
        </span>
      ))}
      <small>{wins}/3 rounds</small>
    </span>
  );
}
function CardBack({ mini = false }: { mini?: boolean }) {
  return (
    <span className={`card-back ${mini ? "mini" : ""}`}>
      <span className="back-frame">
        <span className="back-flower">✳</span>
        <span>
          mood
          <br />
          swings
        </span>
      </span>
    </span>
  );
}
function PlayedCardReveal({
  view,
  remaining,
  ready,
}: {
  view: View;
  remaining: number;
  ready: () => void;
}) {
  const played = view.lastPlayed!;
  const card = catalog.find((c) => c.id === played.def)!;
  const original = catalog.find((c) => c.id === played.originalDef)!;
  const player =
    view.players.find((p) => p.id === played.actor)?.name ?? "A player";
  return (
    <div className="modal-backdrop played-card-backdrop">
      <section
        className="played-card-reveal"
        data-play-id={played.id}
        role="dialog"
        aria-modal="true"
        aria-label={`${player} played ${card.name}`}
      >
        <span className="eyebrow">
          {played.actor === view.you ? "YOU PLAYED" : `${player} PLAYED`}
        </span>
        <h2>{card.name}</h2>
        {played.originalDef !== played.def && (
          <p className="played-copy-note">
            {original.name} copying {card.name}
          </p>
        )}
        <img
          className="played-card-art"
          src={"/" + card.images[0].path}
          alt={card.name}
        />
        <div className="played-card-timer">
          <span
            style={{
              width: `${Math.max(0, Math.min(100, 100 * (1 - remaining / pacing(view.pace).reveal)))}%`,
            }}
          />
        </div>
        <button
          className="reveal-ready"
          disabled={view.revealReady?.includes(view.you)}
          onClick={ready}
        >
          {view.revealReady?.includes(view.you)
            ? "Ready · waiting for the table"
            : "I’m ready"}{" "}
          <Check size={16} />
        </button>
        <p className="played-card-countdown">
          A moment to read · Play resumes in{" "}
          {Math.max(1, Math.ceil(remaining / 1000))}s
        </p>
      </section>
    </div>
  );
}
function RoundResults({ view, remaining }: { view: View; remaining: number }) {
  const result = view.lastRound!;
  const elapsed = Math.max(
    0,
    9000 * (1 - remaining / pacing(view.pace).results),
  );
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const maxScore = Math.max(1, ...Object.values(result.scores));
  const name = (id?: string) =>
    view.players.find((p) => p.id === id)?.name ?? "Nobody";
  const stage =
    elapsed < 2000 ? 0 : elapsed < 4000 ? 1 : elapsed < 6000 ? 2 : 3;
  const order = result.order ?? view.players.map((p) => p.id);
  const tied =
    result.winner &&
    Object.values(result.scores).filter(
      (n) => n === result.scores[result.winner!],
    ).length > 1;
  return (
    <div className="modal-backdrop round-results-backdrop">
      <section
        className="round-results"
        role="dialog"
        aria-modal="true"
        aria-label={`Round ${result.round} results`}
      >
        <div className="round-result-emblem">
          <Sparkles size={22} />
        </div>
        <span className="eyebrow">
          ROUND {String(result.round).padStart(2, "0")} · RESULTS
        </span>
        <h2 aria-live="polite">
          {stage === 0
            ? result.winner
              ? "Counting the points…"
              : "A quiet round."
            : result.winner
              ? `${name(result.winner)} wins the round!`
              : "No scoring this round."}
        </h2>
        {result.winner ? (
          <div className="round-score-list">
            {order.map((id, i) => {
              const progress = reducedMotion
                ? 1
                : Math.min(1, Math.max(0, (elapsed - i * 120) / 1200));
              const displayedScore = Math.round(
                (result.scores[id] ?? 0) * (1 - Math.pow(1 - progress, 3)),
              );
              return (
                <div
                  key={id}
                  className={
                    stage > 0 && id === result.winner
                      ? "round-score-winner"
                      : ""
                  }
                  style={{ animationDelay: `${i * 180}ms` }}
                >
                  <span
                    className="round-score-fill"
                    aria-hidden="true"
                    style={{
                      width: `${(Math.max(0, displayedScore) / maxScore) * 100}%`,
                    }}
                  />
                  <span className="round-player-initial" aria-hidden="true">
                    {name(id).slice(0, 1)}
                  </span>
                  <span className="round-player-name">
                    {name(id)}
                    {id === view.you ? " (you)" : ""}
                  </span>
                  <strong aria-label={`${result.scores[id] ?? 0} points`}>
                    {displayedScore}
                  </strong>
                  <span
                    className="round-crown"
                    aria-hidden="true"
                    style={{
                      opacity: stage > 0 && id === result.winner ? 1 : 0,
                    }}
                  >
                    <Crown size={19} />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p>Scoring was skipped. No round win or Hurt Feelings is awarded.</p>
        )}
        <p
          className="round-tie-note"
          style={{ visibility: stage >= 1 && tied ? "visible" : "hidden" }}
        >
          Tied on points — earlier turn order wins the tie.
        </p>
        <div className="round-awards" aria-live="polite">
          <div
            className="round-award feelings-award"
            style={{
              visibility: stage >= 2 ? "visible" : "hidden",
              opacity: stage >= 2 ? 1 : 0,
            }}
          >
            <HeartCrack size={21} aria-hidden="true" />
            <span>HURT FEELINGS</span>
            <strong>
              {result.hurtFeelings ? name(result.hurtFeelings) : "Not awarded"}
            </strong>
            <p>
              {result.hurtFeelings
                ? "One extra play on their next turn. Lowest score; later turn order breaks ties."
                : view.status === "finished"
                  ? "This was the final round."
                  : view.players.length < 3
                    ? "Used in games with three or more players."
                    : "No scoring this round."}
            </p>
          </div>
          <div
            className="round-award"
            style={{
              visibility: stage >= 3 ? "visible" : "hidden",
              opacity: stage >= 3 ? 1 : 0,
            }}
          >
            <ArrowRight size={21} aria-hidden="true" />
            <span>
              {view.status === "finished"
                ? "MATCH COMPLETE"
                : "FIRST NEXT ROUND"}
            </span>
            <strong>
              {view.status === "finished"
                ? `${name(view.winner)} takes the table`
                : name(result.nextFirst)}
            </strong>
            <p>
              {view.status === "finished"
                ? "The final results are coming up."
                : "The next round follows this player in table order."}
            </p>
          </div>
        </div>
        <div className="round-stage-track" aria-label="Round result progress">
          {["Points", "Winner", "Feelings", "Next round"].map((label, i) => (
            <span
              key={label}
              className={stage >= i ? "revealed" : ""}
              aria-current={stage === i ? "step" : undefined}
            >
              <i />
              {label}
            </span>
          ))}
        </div>
        <div className="round-progress">
          <span style={{ width: `${Math.min(100, elapsed / 90)}%` }} />
        </div>
        <small>
          {view.status === "finished" ? "Final results" : "Play resumes"} in{" "}
          {Math.max(1, Math.ceil(remaining / 1000))}s
        </small>
      </section>
    </div>
  );
}
function CardZoom() {
  const [preview, setPreview] = useState<{
    image: string;
    name: string;
    left: number;
    top: number;
    width: number;
  }>();
  useEffect(() => {
    let hovered: HTMLElement | null = null;
    const card = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-card-image]")
        : null;
    const show = (el: HTMLElement | null) => {
      if (!el || el.closest("[inert]")) {
        setPreview(undefined);
        return;
      }
      const rect = el.getBoundingClientRect();
      const width = Math.min(420, innerWidth - 24, (innerHeight - 32) * 0.715);
      const height = width / 0.715;
      const left =
        rect.right + width + 16 <= innerWidth
          ? rect.right + 12
          : Math.max(12, rect.left - width - 12);
      setPreview({
        image: el.dataset.cardImage!,
        name: el.dataset.cardName!,
        width,
        left,
        top: Math.max(16, Math.min(rect.top, innerHeight - height - 16)),
      });
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = card(e.target);
      if (el === hovered) return;
      hovered = el;
      show(el);
    };
    const out = (e: PointerEvent) => {
      if (card(e.relatedTarget) === hovered) return;
      hovered = null;
      show(card(document.activeElement));
    };
    const focus = (e: FocusEvent) => show(card(e.target));
    const blur = () => show(hovered);
    const clear = () => {
      hovered = null;
      setPreview(undefined);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);
  return preview ? (
    <div
      className="card-zoom"
      aria-hidden="true"
      style={{ left: preview.left, top: preview.top, width: preview.width }}
    >
      <img src={preview.image} alt={preview.name} />
    </div>
  ) : null;
}
function MoodCard({ c, onClick }: { c: PublicCard; onClick: () => void }) {
  const targets = useContext(Targeting);
  const option = targets?.options.find((o) => o.card === c.uid);
  const chosen = !!option && !!targets?.selected.includes(option.id);
  const printed = catalog.find(
    (entry) => entry.id === (c.copy ?? c.def),
  )?.printed_values;
  const secondary =
    !c.suppressed &&
    c.zone === "play" &&
    printed?.length === 2 &&
    c.value === printed[1];
  return (
    <button
      className={`mood-card ${option ? "target-eligible" : ""} ${chosen ? "target-selected" : ""} ${c.suppressed ? "suppressed" : secondary ? "secondary-value" : ""}`}
      onClick={() => (option ? targets!.toggle(option.id) : onClick())}
      data-motion-card={c.uid}
      data-motion-zone={`play:${c.owner}`}
      aria-pressed={option ? chosen : undefined}
      data-card-image={c.image}
      data-card-name={c.name}
      aria-label={`${option ? "Choose" : "Inspect"} ${c.name}, value ${c.value}${c.suppressed ? ", suppressed" : secondary ? ", bottom-left value" : ""}`}
    >
      <img src={c.image} alt={c.name} />
      <span className="value-badge">{c.value}</span>
      {c.suppressed && <span className="suppressed-label">SUPPRESSED</span>}
    </button>
  );
}
function PlayerZone({
  player,
  index,
  moods,
  active,
  inspect,
  doing,
  reactions,
}: {
  player: View["players"][number];
  index: number;
  moods: PublicCard[];
  active: boolean;
  inspect: (id: string) => void;
  doing?: string;
  reactions: { id: number; emoji: Reaction }[];
}) {
  return (
    <div className={`player-zone ${active ? "active-player" : ""}`}>
      <div className="player-head">
        <Avatar name={player.name} index={index} reactions={reactions} />
        <div>
          <strong>
            {player.name}
            {player.bot && (
              <small className="bot-label"> · {botLabel(player.bot)}</small>
            )}
            {!player.connected && <small className="away"> · away</small>}
          </strong>
          <WinDots wins={player.wins} />
          {doing && (
            <span className="player-doing" aria-live="polite">
              {doing.endsWith("…") ? (
                <>
                  {doing.slice(0, -1)}
                  <span className="ellipsis">
                    <i>.</i>
                    <i>.</i>
                    <i>.</i>
                  </span>
                </>
              ) : (
                doing
              )}
            </span>
          )}
        </div>
        <div className="opponent-score">
          <Score value={player.score} />
          <small>POINTS</small>
        </div>
        <span
          className="hand-fan"
          aria-label={`${player.handCount} cards in hand`}
          title={`${player.handCount} cards in hand`}
        >
          {Array.from({ length: Math.min(player.handCount, 8) }, (_, i) => (
            <CardBack key={i} mini />
          ))}
          <b>{player.handCount}</b>
        </span>
      </div>
      <div className="mood-row">
        {moods.map((c) => (
          <MoodCard
            key={c.uid}
            c={c}
            onClick={() => inspect(c.copy ?? c.def)}
          />
        ))}
        {!moods.length && (
          <span className="empty-zone">A little room for feelings.</span>
        )}
      </div>
    </div>
  );
}
function Hand({
  view,
  send,
  inspect,
  disabled,
  onHold,
  plan,
  requestPlan,
  setTargets,
}: {
  view: View;
  send: (a: Action) => void;
  inspect: (id: string) => void;
  disabled: boolean;
  onHold: (holding: boolean) => void;
  plan?: Preview;
  requestPlan: (card: string, grant: string, choices: PlannedChoice[]) => void;
  setTargets: (targets: Targets | undefined) => void;
}) {
  const [selected, setSelected] = useState<string>(),
    [grant, setGrant] = useState(""),
    [choices, setChoices] = useState<PlannedChoice[]>([]),
    [picked, setPicked] = useState<string[]>([]);
  const card = [...view.hand, ...view.discard].find((c) => c.uid === selected);
  useEffect(() => onHold(!!card), [!!card, onHold]);
  const options = card
    ? (view.playable[card.uid] ?? []).map((id) =>
        view.grants.find((g) => g.id === id)!,
      )
    : [];
  const activeGrant = grant || options[0]?.id || "";
  useEffect(() => {
    setSelected(undefined);
    setGrant("");
    setChoices([]);
  }, [view.revision]);
  // Ask the table which decision this play would raise, given the answers so far.
  useEffect(() => {
    setPicked([]);
    if (card && activeGrant) requestPlan(card.uid, activeGrant, choices);
  }, [card?.uid, activeGrant, choices, requestPlan]);
  const current =
    plan && card && plan.card === card.uid && plan.grant === activeGrant
      ? plan
      : undefined;
  useEffect(() => {
    if (current && current.applied < choices.length)
      setChoices(choices.slice(0, current.applied));
  }, [current?.applied]);
  const step = current?.prompt;
  useEffect(() => {
    if (!step || disabled) return;
    setTargets({
      options: step.options,
      selected: picked,
      toggle: (id) => setPicked((old) => togglePick(old, id, step)),
    });
    return () => setTargets(undefined);
  }, [step, picked, disabled, setTargets]);
  const targets = useContext(Targeting);

  const visible = [...view.hand, ...view.moods, ...view.discard];
  function decide(selectedIds: string[]) {
    if (step)
      setChoices([...choices, { title: step.title, selected: selectedIds }]);
  }
  const stepOk =
    !!step &&
    picked.length >= step.min &&
    picked.length <= step.max &&
    (!step.constraints?.allowedCounts ||
      step.constraints.allowedCounts.includes(picked.length));
  const playableDiscard = view.discard.filter((c) => view.playable[c.uid]);
  return (
    <>
      <div className="hand-cards">
        {view.hand.map((c, i) => (
          <button
            key={c.uid}
            data-motion-card={c.uid}
            data-motion-zone="hand"
            className={`hand-card ${targets?.options.some((o) => o.card === c.uid) ? "target-eligible" : ""} ${targets?.options.some((o) => o.card === c.uid && targets.selected.includes(o.id)) ? "target-selected" : ""} ${view.playable[c.uid] ? "playable" : ""} ${selected === c.uid ? "selected" : ""}`}
            style={
              {
                "--tilt": `${(i - (view.hand.length - 1) / 2) * 1.5}deg`,
              } as React.CSSProperties
            }
            onClick={() => {
              const option = targets?.options.find((o) => o.card === c.uid);
              if (option) {
                targets!.toggle(option.id);
                return;
              }
              sound("lift");
              setSelected(c.uid);
              setGrant(view.playable[c.uid]?.[0] ?? "");
            }}
            data-card-image={c.image}
            data-card-name={c.name}
            aria-label={`Select ${c.name}`}
          >
            <img src={c.image} alt={c.name} />
            <span>{c.name}</span>
            {view.playable[c.uid] && <span className="play-dot" />}
          </button>
        ))}
        {!view.hand.length && (
          <p className="empty-hand">
            An empty hand. Your moods still have something to say.
          </p>
        )}
      </div>
      {playableDiscard.length > 0 && (
        <div className="discard-plays">
          <Layers size={14} />
          <span>Play from discard:</span>
          {playableDiscard.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                setSelected(c.uid);
                setGrant(view.playable[c.uid][0]);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {card && (
        <div className="card-action">
          <div className="card-action-row">
            <div>
              <strong>{card.name}</strong>
              <span>{card.rules || "No special effect."}</span>
            </div>
            <button
              className="inspect-button"
              onClick={() => inspect(card.copy ?? card.def)}
            >
              Inspect
            </button>
            {options.length > 1 && (
              <select
                aria-label="Extra play permission"
                value={grant}
                onChange={(e) => setGrant(e.target.value)}
              >
                {options.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`primary ${!disabled && options.length && !step ? "attention" : ""}`}
              disabled={disabled || !options.length}
              onClick={() =>
                send({
                  type: "play",
                  card: card.uid,
                  grant: activeGrant,
                  choices,
                })
              }
            >
              Play mood <ArrowUpRight size={16} />
            </button>
            <button
              onClick={() => setSelected(undefined)}
              aria-label="Deselect card"
            >
              <X size={18} />
            </button>
          </div>
          {(choices.length > 0 || step) && (
            <div className="card-plan" data-plan-step={choices.length + 1}>
              {choices.map((c, i) => (
                <div className="plan-decided" key={i}>
                  <Check size={13} />
                  <span>
                    <b>{c.title}</b>
                    {": "}
                    {c.selected.length
                      ? c.selected
                          .map((id) => {
                            const m = visible.find((x) => x.uid === id);
                            return m ? m.name : id;
                          })
                          .join(", ")
                      : "skipped"}
                  </span>
                  {i === choices.length - 1 && (
                    <button
                      className="text-button"
                      onClick={() => setChoices(choices.slice(0, i))}
                    >
                      Change
                    </button>
                  )}
                </div>
              ))}
              {step && (
                <div className="plan-step">
                  <div className="choice-eyebrow">
                    <Sparkles size={13} /> DECIDE BEFORE YOU PLAY
                  </div>
                  <h4>{step.title}</h4>
                  <p>{choiceHint(step)}</p>
                  <ChoiceOptions
                    q={step}
                    visible={visible}
                    selected={picked}
                    onToggle={(id) => setPicked(togglePick(picked, id, step))}
                  />
                  <div className="choice-actions">
                    {step.min === 0 && (
                      <button
                        className={`text-button ${!picked.length ? "attention" : ""}`}
                        onClick={() => decide([])}
                      >
                        Skip effect
                      </button>
                    )}
                    <button
                      className={`primary ${stepOk && picked.length ? "attention" : ""}`}
                      disabled={!stepOk}
                      onClick={() => decide(picked)}
                    >
                      Choose{picked.length ? ` (${picked.length})` : ""}
                      <Check size={15} />
                    </button>
                  </div>
                </div>
              )}
              {!step && current?.done && (
                <p className="plan-ready">
                  <Check size={13} /> Decisions made. Play when ready.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
function ChoicePanel({
  view,
  send,
  disabled,
  setTargets,
}: {
  view: View;
  send: (a: Action) => void;
  disabled: boolean;
  setTargets: (targets: Targets | undefined) => void;
}) {
  const q = view.prompt!;
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (disabled) return;
    setTargets({
      options: q.options,
      selected,
      toggle: (id) => setSelected((old) => togglePick(old, id, q)),
    });
    return () => setTargets(undefined);
  }, [q, selected, disabled, setTargets]);
  const visible = [...view.hand, ...view.moods, ...view.discard];
  const confirmable =
    !disabled &&
    selected.length >= q.min &&
    selected.length <= q.max &&
    (!q.constraints?.allowedCounts ||
      q.constraints.allowedCounts.includes(selected.length));
  return (
    <aside
      className="choice-panel"
      aria-label="Card effect choice"
      data-prompt-id={q.id}
    >
      <div className="choice-eyebrow">
        <Sparkles size={15} /> A FEELING NEEDS YOUR ATTENTION
      </div>
      <h3>{q.title}</h3>
      <p>{choiceHint(q)}</p>
      <ChoiceOptions
        q={q}
        visible={visible}
        selected={selected}
        onToggle={(id) => setSelected((old) => togglePick(old, id, q))}
      />
      <div className="choice-actions">
        {q.min === 0 && (
          <button
            className={`text-button ${!disabled && !selected.length ? "attention" : ""}`}
            disabled={disabled}
            onClick={() => send({ type: "choose", prompt: q.id, selected: [] })}
          >
            Skip effect
          </button>
        )}
        <button
          className={`primary ${confirmable && selected.length ? "attention" : ""}`}
          disabled={!confirmable}
          onClick={() => send({ type: "choose", prompt: q.id, selected })}
        >
          Confirm{selected.length ? ` (${selected.length})` : ""}
          <Check size={16} />
        </button>
      </div>
    </aside>
  );
}
function choiceHint(q: PromptView) {
  return (
    (q.min === q.max
      ? `Choose ${q.min}`
      : `Choose ${q.min ? `${q.min}–${q.max}` : `up to ${q.max}`}`) +
    (q.constraints?.maxValue !== undefined
      ? ` · Total value ≤ ${q.constraints.maxValue}`
      : "") +
    (q.constraints?.differentPlayers ? " · One per player" : "")
  );
}
function togglePick(old: string[], id: string, q: PromptView) {
  return old.includes(id)
    ? old.filter((x) => x !== id)
    : q.max === 1
      ? [id]
      : old.length < q.max
        ? [...old, id]
        : old;
}
function ChoiceOptions({
  q,
  visible,
  selected,
  onToggle,
}: {
  q: PromptView;
  visible: PublicCard[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="choice-options">
      {q.options.map((o) => {
        const c = visible.find((c) => c.uid === o.card);
        return (
          <button
            key={o.id}
            className={selected.includes(o.id) ? "chosen" : ""}
            onClick={() => onToggle(o.id)}
          >
            {c && <img src={c.image} alt="" />}
            <span>{o.label}</span>
            <span className="choice-check">
              {selected.includes(o.id) && <Check size={14} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
function Catalog({
  close,
  inspect,
}: {
  close: () => void;
  inspect: (id: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const cards = catalog.filter(
    (c) =>
      (filter === "all" || c.color === filter) &&
      (c.name + " " + c.rules_text)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="catalog-overlay">
      <header>
        <div>
          <span className="eyebrow">THE WHOLE SPECTRUM</span>
          <h2>133 ways to feel.</h2>
        </div>
        <button onClick={close} aria-label="Close catalog">
          <X size={24} />
        </button>
      </header>
      <div className="catalog-toolbar">
        <label>
          <Search size={18} />
          <input
            aria-label="Search cards"
            placeholder="Find a mood or an effect…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div>
          {["all", ...Object.keys(colorNames)].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={filter === c ? "selected" : ""}
            >
              {c !== "all" && <span className={`color-dot ${c}`} />} {c}
            </button>
          ))}
        </div>
        <span>{cards.length} cards</span>
      </div>
      <div className="catalog-grid">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => inspect(c.id)}
            data-card-image={"/" + c.images[0].path}
            data-card-name={c.name}
          >
            <img loading="lazy" src={"/" + c.images[0].path} alt={c.name} />
            <strong>{c.name}</strong>
            <span>
              {c.color} · {c.rarity}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

function PublicTables({
  busy,
  onJoin,
}: {
  busy: boolean;
  onJoin: (code: string) => void;
}) {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [status, setStatus] = useState("Finding open tables…");
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(serverURL + "/api/rooms", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        setRooms(data.rooms);
        setStatus("");
      } catch {
        if (!controller.signal.aborted) {
          setRooms([]);
          setStatus("Couldn’t load tables. Retrying shortly…");
        }
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="public-tables">
      <div className="eyebrow">THERE’S ROOM FOR ONE MORE</div>
      <h2>Find your next table.</h2>
      <p>
        Meet other players. Public tables appear here while their host is online
        and seats are open.
      </p>
      {status ? (
        <p role="status">{status}</p>
      ) : rooms.length === 0 ? (
        <p className="empty-tables">
          No open tables yet. Create a public table and welcome the first guest.
        </p>
      ) : (
        <div className="public-room-grid">
          {rooms.map((r) => (
            <article key={r.code}>
              <div>
                <h3>{r.hostName}’s table</h3>
                <span>
                  {r.players}/4 seats filled
                  {r.bots
                    ? ` · ${r.bots} ${r.bots === 1 ? "bot" : "bots"}`
                    : ""}
                </span>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => onJoin(r.code)}
              >
                Join table <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
const donationAddress = "0x5e61495C929fC93355f245e5D6A31Bf142e73E69";
function DonationPanel() {
  const [notice, setNotice] = useState("");
  return (
    <details className="donation-panel">
      <summary>Enjoying the table? Support the maintainer ♡</summary>
      <p>
        Optional USDC donations go directly to JollyRogerz. Every card, bot and
        game stays free. Donations are not payments to Wizards of the Coast.
      </p>
      <p>USDC donation address:</p>
      <code>{donationAddress}</code>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(donationAddress);
            setNotice("Address copied.");
          } catch {
            setNotice("Please select and copy the address above.");
          }
        }}
      >
        <Copy size={15} /> Copy address
      </button>
      <p role="status">{notice}</p>
      <small>No wallet connection is required.</small>
    </details>
  );
}
