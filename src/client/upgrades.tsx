import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Undo2, X } from "lucide-react";
import type { View } from "../game/types";
import "./upgrades.css";
// ------------------------------------------------------------------
// 1. "Your turn" that reaches you outside the tab (opt-in).
// ------------------------------------------------------------------
export const notificationsSupported = () => "Notification" in window;
export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
export function useTurnNotifications(
  view: View | undefined,
  enabled: boolean,
  ready: boolean,
) {
  const mine =
    ready &&
    !!view &&
    !view.spectator &&
    view.status === "playing" &&
    (view.prompt
      ? "choice"
      : !view.scoring && view.active === view.you && !view.waitingFor
        ? "turn"
        : "");
  const shown = useRef<Notification | undefined>(undefined);
  useEffect(() => {
    const close = () => {
      shown.current?.close();
      shown.current = undefined;
    };
    if (
      !mine ||
      !enabled ||
      !document.hidden ||
      !notificationsSupported() ||
      Notification.permission !== "granted"
    )
      return close;
    let note: Notification;
    try {
      note = new Notification(
        mine === "choice" ? "A card needs your decision" : "It’s your turn",
        {
          body:
            mine === "choice"
              ? (view!.prompt?.title ?? "Mood Swings")
              : "Your friends are waiting at the Mood Swings table.",
          tag: "mood-swings-turn",
        },
      );
    } catch {
      // Some mobile browsers expose Notification but require a service worker.
      return close;
    }
    note.onclick = () => {
      window.focus();
      note.close();
    };
    shown.current = note;
    const onVisible = () => !document.hidden && close();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      close();
    };
  }, [mine, enabled, view?.prompt?.id]);
}
// ------------------------------------------------------------------
// 5. A recap of what happened while you looked away.
// ------------------------------------------------------------------
export function useAwayRecap(view: View | undefined, hidden: boolean) {
  const seen = useRef(0);
  const [missed, setMissed] = useState<View["log"]>([]);
  const latest = view?.log.at(-1)?.id ?? 0;
  const missedWhileHidden = useRef(false);
  useEffect(() => {
    if (hidden) missedWhileHidden.current = true;
  }, [hidden]);
  useEffect(() => {
    if (!view || view.status !== "playing") {
      seen.current = latest;
      setMissed([]);
      return;
    }
    // A rematch restarts the log numbering.
    if (latest < seen.current) seen.current = 0;
    if (hidden) return;
    const entries = view.log.filter((e) => e.id > seen.current);
    const wasAway = seen.current > 0 && entries.length >= 1;
    seen.current = latest;
    if (wasAway && missedWhileHidden.current) setMissed(entries.slice(-8));
    missedWhileHidden.current = false;
  }, [hidden, latest, view?.status]);
  return { missed, dismiss: () => setMissed([]) };
}
export function AwayRecap({
  missed,
  dismiss,
}: {
  missed: View["log"];
  dismiss: () => void;
}) {
  if (!missed.length) return null;
  return (
    <aside
      className="away-recap"
      role="status"
      aria-label="While you were away"
    >
      <div>
        <strong>While you were away</strong>
        <button onClick={dismiss} aria-label="Dismiss recap">
          <X size={16} />
        </button>
      </div>
      <ol>
        {missed.map((e) => (
          <li key={e.id}>{e.text}</li>
        ))}
      </ol>
    </aside>
  );
}
// ------------------------------------------------------------------
// 6. A short undo window for the two easy misclicks.
// ------------------------------------------------------------------
export const UNDO_MS = 1800;
export function useUndoable(cancelKey: unknown) {
  const [pending, setPending] = useState<{ label: string }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const action = useRef<(() => void) | undefined>(undefined);
  const undo = useCallback(() => {
    clearTimeout(timer.current);
    action.current = undefined;
    setPending(undefined);
  }, []);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const run = action.current;
    action.current = undefined;
    setPending(undefined);
    run?.();
  }, []);
  const run = useCallback(
    (label: string, fn: () => void, immediate = false) => {
      if (immediate) return fn();
      clearTimeout(timer.current);
      action.current = fn;
      setPending({ label });
      timer.current = setTimeout(flush, UNDO_MS);
    },
    [flush],
  );
  // Anything changing at the table cancels a pending action rather than
  // applying it to a situation the player never saw.
  useEffect(() => undo, [cancelKey, undo]);
  return { pending, run, undo, flush };
}
export function UndoToast({
  pending,
  undo,
  flush,
}: {
  pending?: { label: string };
  undo: () => void;
  flush: () => void;
}) {
  if (!pending) return null;
  return (
    <div className="undo-toast" role="status">
      <span>{pending.label}</span>
      <button className="undo-button" onClick={undo}>
        <Undo2 size={15} /> Undo
      </button>
      <button className="text-button" onClick={flush}>
        Do it now
      </button>
      <i style={{ animationDuration: `${UNDO_MS}ms` }} />
    </div>
  );
}
// ------------------------------------------------------------------
// 8. Keyboard shortcuts. They press the same buttons a pointer would, so
// every rule about what is enabled stays in one place.
// ------------------------------------------------------------------
export const SHORTCUTS: [string, string][] = [
  ["1–9", "Select a card in your hand"],
  ["Enter", "Play the selected card, or confirm a decision"],
  ["E", "End your turn"],
  ["Esc", "Put the card back"],
  ["L", "Open the activity log"],
  ["S", "Explain your score"],
  ["?", "Show these shortcuts"],
];
const click = (selector: string) => {
  const el = document.querySelector<HTMLButtonElement>(selector);
  if (!el || el.disabled) return false;
  el.click();
  return true;
};
export function useShortcuts(
  enabled: boolean,
  handlers: { log: () => void; score: () => void; help: () => void },
) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, select, textarea, [contenteditable]") ||
        document.querySelector(".modal-backdrop, .catalog-overlay")
      )
        return;
      const key = e.key;
      let handled = true;
      if (/^[1-9]$/.test(key)) {
        const cards = document.querySelectorAll<HTMLButtonElement>(
          ".hand-cards .hand-card",
        );
        cards[Number(key) - 1]?.click();
        cards[Number(key) - 1]?.focus();
      } else if (key === "Enter") {
        // Leave Enter alone when a control already has focus.
        if (target?.closest("button, a, summary")) return;
        handled =
          click(".choice-panel .choice-actions .primary") ||
          click(".card-plan .choice-actions .primary") ||
          click(".card-action .primary");
      } else if (key === "e" || key === "E") handled = click(".end-turn");
      else if (key === "Escape")
        handled = click('.card-action [aria-label="Deselect card"]');
      else if (key === "l" || key === "L") latest.current.log();
      else if (key === "s" || key === "S") latest.current.score();
      else if (key === "?") latest.current.help();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
export function ShortcutList() {
  return (
    <details className="shortcut-list">
      <summary>Keyboard shortcuts</summary>
      <dl>
        {SHORTCUTS.map(([key, what]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
// ------------------------------------------------------------------
// 10. Watching from the gallery.
// ------------------------------------------------------------------
export function SpectatorBar({
  view,
  takeSeat,
}: {
  view: View;
  takeSeat?: () => void;
}) {
  if (!view.spectator) return null;
  return (
    <div className="spectator-bar" role="status">
      <Eye size={18} />
      <span>
        <strong>You’re watching.</strong> Hands stay hidden; you see what the
        table sees.
      </span>
      {takeSeat && (
        <button className="primary" onClick={takeSeat}>
          Take a seat
        </button>
      )}
    </div>
  );
}
export function GalleryCount({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span
      className="gallery-count"
      title={`${count} ${count === 1 ? "person is" : "people are"} watching`}
      aria-label={`${count} watching`}
    >
      <Eye size={15} /> {count}
    </span>
  );
}
