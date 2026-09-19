import { useEffect, useRef, useState } from "react";
import { CLOCKS, type ClockSetting, type ClockView } from "../game/clock";
import { sound } from "./polish";
import "./clock.css";
// The server sends remaining time, not timestamps, so a wrong device clock can
// never make a countdown lie. The browser only counts down from that snapshot.
export function useCountdown(clock?: ClockView) {
  const origin = useRef(performance.now());
  const [, tick] = useState(0);
  useEffect(() => {
    origin.current = performance.now();
    if (clock?.remainingMs === undefined) return;
    const timer = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [clock]);
  if (!clock || clock.remainingMs === undefined) return undefined;
  const elapsed = performance.now() - origin.current,
    waiting = Math.max(0, (clock.startsInMs ?? 0) - elapsed),
    running = Math.max(0, elapsed - (clock.startsInMs ?? 0)),
    remaining = Math.max(0, clock.remainingMs - running);
  return {
    actor: clock.actor!,
    paused: waiting > 0,
    remaining,
    fraction: clock.totalMs ? remaining / clock.totalMs : 0,
    overtime: !!clock.overtime,
    urgent: waiting === 0 && remaining <= 10_000,
  };
}
export const formatClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export function describeClock(setting: ClockSetting) {
  const c = CLOCKS[setting];
  return c.decision
    ? `${c.decision / 1000}s for each decision · ${formatClock(c.bank)} time bank each · pauses while cards are read`
    : "Nobody is timed. Take as long as you like.";
}
// A small countdown for whoever the table is waiting on. For you it also gives
// one warning at ten seconds: a tone (if sound is on) and a short vibration.
export function TurnClock({
  clock,
  you,
  name,
}: {
  clock?: ClockView;
  you: string;
  name?: string;
}) {
  const c = useCountdown(clock);
  const warned = useRef("");
  const mine = c?.actor === you;
  useEffect(() => {
    if (!c || !mine || !c.urgent || c.remaining === 0) return;
    const key = `${clock?.actor}:${clock?.totalMs}:${c.overtime}`;
    if (warned.current === key) return;
    warned.current = key;
    sound("turn");
    navigator.vibrate?.(120);
  }, [c?.urgent, mine]);
  if (!c) return null;
  return (
    <span
      className={`turn-clock ${c.urgent ? "urgent" : ""} ${c.overtime ? "overtime" : ""} ${c.paused ? "paused" : ""}`}
      role="timer"
      aria-label={`${mine ? "Your" : `${name ?? "Their"}`} time${c.overtime ? " bank" : ""}: ${formatClock(c.remaining)}`}
    >
      <span className="turn-clock-label">
        {c.overtime ? "BANK" : c.paused ? "NEXT" : "TIME"}
      </span>
      <strong>{formatClock(c.remaining)}</strong>
      <i style={{ width: `${Math.round(c.fraction * 100)}%` }} />
    </span>
  );
}
export function BankPill({
  clock,
  player,
}: {
  clock?: ClockView;
  player: string;
}) {
  if (!clock || clock.setting === "off" || clock.bank[player] === undefined)
    return null;
  const away = clock.away.includes(player);
  return (
    <small
      className={`bank-pill ${clock.bank[player] === 0 ? "empty" : ""}`}
      title={
        away
          ? "Timed out twice in a row: short clock until they act"
          : "Time bank: used only after the decision time runs out"
      }
    >
      {away ? "short clock" : `bank ${formatClock(clock.bank[player])}`}
    </small>
  );
}
