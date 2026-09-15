import React, { createContext, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { View } from "../game/types";

export interface EffectChange {
  card: string;
  name: string;
  image: string;
  description: string;
  badge: string;
  valueChanged: boolean;
}
export const EffectContext = createContext<EffectChange[]>([]);

// Compare only the viewer's public table, never hidden hands or preview states.
export function tableChanges(before: View, after: View): EffectChange[] {
  const changes: EffectChange[] = [];
  const name = (id: string) =>
    after.players.find((p) => p.id === id)?.name ?? "another player";
  for (const old of before.moods) {
    const next = after.moods.find((c) => c.uid === old.uid);
    const descriptions: string[] = [];
    let badge = "Changed";
    if (!next) {
      badge = after.discard.some((c) => c.uid === old.uid)
        ? "Discarded"
        : after.hand.some((c) => c.uid === old.uid)
          ? "To your hand"
          : "Left play";
      descriptions.push(badge);
    } else {
      if (old.owner !== next.owner) {
        descriptions.push(`Moved to ${name(next.owner)}`);
        badge = "Moved";
      }
      if (old.copy !== next.copy) {
        descriptions.push(`Now ${next.name}`);
        badge = "Copied";
      }
      if (old.color !== next.color) {
        descriptions.push(`${old.color} → ${next.color}`);
        badge = "Color changed";
      }
      if (old.suppressed !== next.suppressed) {
        badge = next.suppressed ? "Suppressed" : "Restored";
        descriptions.push(next.suppressed ? "Suppressed" : "Suppression ended");
      }
      if (old.value !== next.value) {
        descriptions.push(`${old.value} → ${next.value} points`);
        if (old.suppressed === next.suppressed)
          badge = `${next.value > old.value ? "+" : ""}${next.value - old.value}`;
      }
    }
    if (descriptions.length)
      changes.push({
        card: old.uid,
        name: next?.name ?? old.name,
        image: next?.image ?? old.image,
        description: descriptions.join(" · "),
        badge,
        valueChanged: !!next && old.value !== next.value,
      });
  }
  return changes;
}

export function useEffectFeedback(view: View | undefined, connected: boolean) {
  const previous = useRef<View | undefined>(undefined);
  const [changes, setChanges] = useState<EffectChange[]>([]);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = connected ? view : undefined;
    if (!connected || !view || view.status === "lobby") {
      clearTimeout(expiry.current);
      setChanges([]);
      return;
    }
    if (!before || before.you !== view.you || before.status === "lobby") return;
    const next = tableChanges(before, view);
    if (!next.length) return;
    clearTimeout(expiry.current);
    setChanges(next);
    expiry.current = setTimeout(() => setChanges([]), 6500);
  }, [view?.moods, view?.hand, view?.discard, view?.status, connected]);
  useEffect(() => () => clearTimeout(expiry.current), []);
  return {
    changes,
    dismiss: () => {
      clearTimeout(expiry.current);
      setChanges([]);
    },
  };
}

export function EffectNotice({
  changes,
  dismiss,
}: {
  changes: EffectChange[];
  dismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [changes]);
  if (!changes.length) return null;
  return (
    <aside className="effect-notice" aria-label="What changed at the table">
      <div className="effect-notice-heading">
        <Sparkles size={16} />
        <strong>Feel the shift</strong>
        <span role="status" className="sr-only">
          {changes.map((c) => `${c.name}: ${c.description}`).join(". ")}
        </span>
        <button onClick={dismiss} aria-label="Dismiss effect summary">
          <X size={16} />
        </button>
      </div>
      <div className="effect-notice-items">
        {(expanded ? changes : changes.slice(0, 3)).map((c) => (
          <div key={c.card}>
            <img
              src={c.image}
              alt=""
              data-card-image={c.image}
              data-card-name={c.name}
            />
            <span>
              <strong>{c.name}</strong>
              <small>{c.description}</small>
            </span>
          </div>
        ))}
      </div>
      {changes.length > 3 && (
        <button className="text-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show all ${changes.length} changes`}
        </button>
      )}
    </aside>
  );
}
