import React, { useEffect, useRef, useState } from "react";
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
import type { Action, Difficulty, PublicCard, View } from "../game/types";
import "./style.css";
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
      setError("");
      setBusy(false);
      setConnected(true);
      retries.current = 0;
    });
    joined.onMessage("error", (message: string) => {
      setError(message);
      setBusy(false);
    });
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
  async function enter(create: boolean) {
    if (!name.trim()) {
      setError("What should we call you at the table?");
      return;
    }
    setBusy(true);
    setError("");
    localStorage.setItem("mood-name", name.trim());
    try {
      const target = create
        ? (await post("/api/rooms", { name, token })).code
        : code.trim().toUpperCase();
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
  function send(action: Action) {
    if (!connected || !viewRef.current || busy) return;
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
  return (
    <div className={view ? "app game-app" : "app"}>
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
            mood swings<span className="brand-small">THE ONLINE TABLE</span>
          </span>
        </button>
        <nav>
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
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="art-caption">
                A HAND FULL
                <br />
                OF POSSIBILITIES.
              </span>
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
                133 MOODS / ENDLESS POSSIBILITIES
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
          <p>Invite a friend or three. The feelings can wait.</p>
          <button className="invite-code" onClick={invite}>
            <span>
              <small>PRIVATE ROOM</small>
              {roomCode}
            </span>
            {copied ? <Check /> : <Copy />}
          </button>
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
                          ? `${p.bot} bot`
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
                </select>
                <button
                  onClick={() =>
                    room.current?.send("add-bot", { difficulty: botDifficulty })
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
                className="primary"
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
          <section className={`board players-${view.players.length}`}>
            <div className="board-watermark">
              mood swings<span>EVERY CARD CHANGES THE FEELING</span>
            </div>
            <div className="opponent-row">
              {view.players
                .filter((p) => p.id !== view.you)
                .map((p) => (
                  <PlayerZone
                    key={p.id}
                    player={p}
                    index={view.players.findIndex((x) => x.id === p.id)}
                    moods={view.moods.filter((c) => c.owner === p.id)}
                    active={view.active === p.id}
                    inspect={setInspect}
                  />
                ))}
            </div>
            <div className="table-center">
              <div className="deck-stack">
                <CardBack />
                <span>{view.deckCount} in deck</span>
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
                {view.discard.length ? (
                  <img
                    src={view.discard[view.discard.length - 1].image}
                    alt="Top of discard pile"
                  />
                ) : (
                  <span className="empty-discard">
                    <Layers size={24} />
                  </span>
                )}
                <span>{view.discard.length} discarded</span>
              </button>
            </div>
            <div className="your-moods">
              <div className="zone-label">
                <span>YOUR MOODS</span>
                <span>
                  {view.players.find((p) => p.id === view.you)?.score} points
                </span>
              </div>
              <div className="mood-row">
                {view.moods
                  .filter((c) => c.owner === view.you)
                  .map((c) => (
                    <MoodCard
                      key={c.uid}
                      c={c}
                      onClick={() => setInspect(c.copy ?? c.def)}
                    />
                  ))}
                {!view.moods.some((c) => c.owner === view.you) && (
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
                {view.scoring
                  ? "Scoring the round"
                  : view.waitingFor
                    ? `${view.players.find((p) => p.id === view.waitingFor)?.name} is choosing`
                    : view.active === view.you
                      ? "Your turn. How are you feeling?"
                      : `${view.players.find((p) => p.id === view.active)?.name}’s turn`}
              </div>
              <button
                className="end-turn"
                disabled={
                  view.active !== view.you ||
                  !!view.waitingFor ||
                  view.scoring ||
                  busy ||
                  !connected
                }
                onClick={() => send({ type: "pass" })}
              >
                {view.grants.length ? "End turn" : "Continue"}
                <ArrowRight size={16} />
              </button>
            </div>
            <Hand
              view={view}
              send={send}
              inspect={setInspect}
              disabled={busy || !connected}
            />
          </section>
          {view.prompt && (
            <ChoicePanel
              key={view.prompt.id}
              view={view}
              send={send}
              disabled={busy || !connected}
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
          {view.status === "finished" && (
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
                    className="primary"
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
    </div>
  );
}
function Avatar({ name, index }: { name: string; index: number }) {
  return (
    <span className={`avatar avatar-${index}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
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
function CardBack() {
  return (
    <span className="card-back">
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
function MoodCard({ c, onClick }: { c: PublicCard; onClick: () => void }) {
  return (
    <button
      className={`mood-card ${c.suppressed ? "suppressed" : ""}`}
      onClick={onClick}
      aria-label={`Inspect ${c.name}, value ${c.value}`}
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
}: {
  player: View["players"][number];
  index: number;
  moods: PublicCard[];
  active: boolean;
  inspect: (id: string) => void;
}) {
  return (
    <div className={`player-zone ${active ? "active-player" : ""}`}>
      <div className="player-head">
        <Avatar name={player.name} index={index} />
        <div>
          <strong>
            {player.name}
            {player.bot && (
              <small className="bot-label"> · {player.bot} bot</small>
            )}
            {!player.connected && <small className="away"> · away</small>}
          </strong>
          <WinDots wins={player.wins} />
        </div>
        <div className="opponent-score">
          <strong>{player.score}</strong>
          <small>POINTS</small>
        </div>
        <span className="hand-count">
          <Layers size={14} />
          {player.handCount}
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
}: {
  view: View;
  send: (a: Action) => void;
  inspect: (id: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string>(),
    [grant, setGrant] = useState("");
  const card = [...view.hand, ...view.discard].find((c) => c.uid === selected);
  const options = card
    ? (view.playable[card.uid] ?? []).map((id) =>
        view.grants.find((g) => g.id === id)!,
      )
    : [];
  useEffect(() => {
    setSelected(undefined);
    setGrant("");
  }, [view.revision]);
  const playableDiscard = view.discard.filter((c) => view.playable[c.uid]);
  return (
    <>
      <div className="hand-cards">
        {view.hand.map((c, i) => (
          <button
            key={c.uid}
            className={`hand-card ${view.playable[c.uid] ? "playable" : ""} ${selected === c.uid ? "selected" : ""}`}
            style={
              {
                "--tilt": `${(i - (view.hand.length - 1) / 2) * 1.5}deg`,
              } as React.CSSProperties
            }
            onClick={() => {
              setSelected(c.uid);
              setGrant(view.playable[c.uid]?.[0] ?? "");
            }}
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
            className="primary"
            disabled={disabled || !options.length}
            onClick={() =>
              send({
                type: "play",
                card: card.uid,
                grant: grant || options[0]?.id,
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
      )}
    </>
  );
}
function ChoicePanel({
  view,
  send,
  disabled,
}: {
  view: View;
  send: (a: Action) => void;
  disabled: boolean;
}) {
  const q = view.prompt!;
  const [selected, setSelected] = useState<string[]>([]);
  const visible = [...view.hand, ...view.moods, ...view.discard];
  function toggle(id: string) {
    setSelected((old) =>
      old.includes(id)
        ? old.filter((x) => x !== id)
        : q.max === 1
          ? [id]
          : old.length < q.max
            ? [...old, id]
            : old,
    );
  }
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
      <p>
        {q.min === q.max
          ? `Choose ${q.min}`
          : `Choose ${q.min ? `${q.min}–${q.max}` : `up to ${q.max}`}`}
        {q.constraints?.maxValue !== undefined
          ? ` · Total value ≤ ${q.constraints.maxValue}`
          : ""}
        {q.constraints?.differentPlayers ? " · One per player" : ""}
      </p>
      <div className="choice-options">
        {q.options.map((o) => {
          const c = visible.find((c) => c.uid === o.card);
          return (
            <button
              key={o.id}
              className={selected.includes(o.id) ? "chosen" : ""}
              onClick={() => toggle(o.id)}
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
      <div className="choice-actions">
        {q.min === 0 && (
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => send({ type: "choose", prompt: q.id, selected: [] })}
          >
            Skip effect
          </button>
        )}
        <button
          className="primary"
          disabled={
            disabled ||
            selected.length < q.min ||
            selected.length > q.max ||
            (!!q.constraints?.allowedCounts &&
              !q.constraints.allowedCounts.includes(selected.length))
          }
          onClick={() => send({ type: "choose", prompt: q.id, selected })}
        >
          Confirm{selected.length ? ` (${selected.length})` : ""}
          <Check size={16} />
        </button>
      </div>
    </aside>
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
          <button key={c.id} onClick={() => inspect(c.id)}>
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
