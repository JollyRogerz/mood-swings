import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings2, Volume2, VolumeX, X } from "lucide-react";
import type { View } from "../game/types";
import { useOverlayScrollLock } from "./portable";

export interface Preferences {
  sound: boolean;
  volume: number;
  motion: "system" | "reduced";
}
const defaults: Preferences = { sound: false, volume: 0.35, motion: "system" };
function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem("mood-preferences") ?? "{}");
    return {
      sound: saved.sound === true,
      volume:
        typeof saved.volume === "number"
          ? Math.max(0, Math.min(1, saved.volume))
          : defaults.volume,
      motion: saved.motion === "reduced" ? "reduced" : "system",
    };
  } catch {
    return defaults;
  }
}
let audio: AudioContext | undefined;
let soundPreferences = defaults;
export function unlockSound() {
  if (!soundPreferences.sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    /* Audio is optional on browsers that do not support Web Audio. */
  }
}
export function sound(cue: "lift" | "card" | "turn" | "score" | "win") {
  if (
    !soundPreferences.sound ||
    !audio ||
    audio.state !== "running" ||
    document.hidden
  )
    return;
  const context = audio,
    time = context.currentTime;
  const notes =
    cue === "win"
      ? [523, 659, 784]
      : cue === "turn"
        ? [440, 660]
        : cue === "score"
          ? [620]
          : cue === "lift"
            ? [320]
            : [180, 120];
  notes.forEach((frequency, i) => {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = cue === "card" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, time + i * 0.08);
    const start = time + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      soundPreferences.volume * 0.14,
      start + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.17);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  });
}
export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    soundPreferences = preferences;
    try {
      localStorage.setItem("mood-preferences", JSON.stringify(preferences));
    } catch {}
  }, [preferences]);
  useEffect(() => {
    document.addEventListener("pointerdown", unlockSound);
    document.addEventListener("keydown", unlockSound);
    return () => {
      document.removeEventListener("pointerdown", unlockSound);
      document.removeEventListener("keydown", unlockSound);
    };
  }, []);
  const update = (next: Preferences) => {
    soundPreferences = next;
    setPreferences(next);
    if (next.sound) {
      unlockSound();
      sound("lift");
    }
  };
  return {
    preferences,
    update,
    reduced: systemReduced || preferences.motion === "reduced",
  };
}
export function TableSettings({
  preferences,
  update,
}: {
  preferences: Preferences;
  update: (p: Preferences) => void;
}) {
  const [open, setOpen] = useState(false);
  useOverlayScrollLock(open);
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const items = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            "button, input, select",
          ) ?? []),
        ];
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        onClick={() => setOpen(true)}
        aria-label="Table settings"
      >
        <Settings2 size={18} />
      </button>
      {open && (
        <div
          className="modal-backdrop preferences-backdrop"
          onClick={() => setOpen(false)}
        >
          <div
            className="preferences-panel"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Table settings"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              aria-label="Close settings"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <span className="eyebrow">MAKE YOURSELF COMFORTABLE</span>
            <h2>Your table. Your feel.</h2>
            <label className="preference-toggle">
              {preferences.sound ? (
                <Volume2 size={20} />
              ) : (
                <VolumeX size={20} />
              )}{" "}
              Sound effects{" "}
              <input
                type="checkbox"
                checked={preferences.sound}
                onChange={(e) =>
                  update({ ...preferences, sound: e.target.checked })
                }
              />
            </label>
            <label>
              Effects volume{" "}
              <input
                aria-label="Effects volume"
                type="range"
                min="0"
                max="100"
                value={Math.round(preferences.volume * 100)}
                onChange={(e) =>
                  update({
                    ...preferences,
                    volume: Number(e.target.value) / 100,
                  })
                }
              />
            </label>
            <label>
              Card motion{" "}
              <select
                aria-label="Card motion"
                value={preferences.motion}
                onChange={(e) =>
                  update({
                    ...preferences,
                    motion: e.target.value as Preferences["motion"],
                  })
                }
              >
                <option value="system">Follow device preference</option>
                <option value="reduced">Reduce motion</option>
              </select>
            </label>
            <p>
              Saved on this device. Room pacing is chosen by the host before a
              game.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// Hold only the visual table during a reveal. Actions and prompts always use
// the newest server view. A reconnect establishes a fresh baseline.
export function usePresentedTable(
  view: View | undefined,
  revealing: boolean,
  connected: boolean,
) {
  const previous = useRef<View | undefined>(undefined);
  if (!view || !connected) previous.current = undefined;
  const before = previous.current;
  if (
    !revealing ||
    !before ||
    before.you !== view?.you ||
    before.status === "lobby"
  )
    previous.current = view;
  if (
    !view ||
    !revealing ||
    !before ||
    before.you !== view.you ||
    before.status === "lobby"
  )
    return view;
  return {
    ...view,
    hand: before.hand,
    moods: before.moods,
    discard: before.discard,
    deckCount: before.deckCount,
    players: view.players.map((p) => {
      const old = before.players.find((x) => x.id === p.id);
      return old
        ? { ...p, score: old.score, handCount: old.handCount, wins: old.wins }
        : p;
    }),
  };
}

type Position = {
  rect: DOMRect;
  image: string;
  rotation: string;
  zone: string;
};
export function useTableMotion(
  view: View | undefined,
  reduced: boolean,
  connected: boolean,
) {
  const previous = useRef<Map<string, Position>>(new Map());
  const baseline = useRef<string | undefined>(undefined);
  const running = useRef(new Map<string, () => void>());
  useEffect(() => {
    const clear = () => {
      for (const cleanup of running.current.values()) cleanup();
    };
    const resize = () => {
      clear();
      baseline.current = undefined;
    };
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", clear, true);
    return () => {
      clear();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", clear, true);
    };
  }, []);
  useLayoutEffect(() => {
    const nodes = [
      ...document.querySelectorAll<HTMLElement>("[data-motion-card]"),
    ];
    const positions = new Map<string, Position>();
    for (const node of nodes) {
      const img = node.querySelector("img");
      positions.set(node.dataset.motionCard!, {
        rect: node.getBoundingClientRect(),
        image: img?.src ?? "",
        rotation: node.classList.contains("suppressed")
          ? "rotate(90deg)"
          : node.classList.contains("secondary-value")
            ? "rotate(180deg)"
            : "rotate(0deg)",
        zone: node.dataset.motionZone ?? "",
      });
    }
    const old = previous.current;
    previous.current = positions;
    const identity =
      connected && view ? `${view.you}:${view.status}` : undefined;
    const starting =
      !!view &&
      baseline.current === `${view.you}:lobby` &&
      view.status === "playing";
    const animate =
      (baseline.current === identity || starting) &&
      !!identity &&
      !reduced &&
      !document.hidden;
    baseline.current = identity;
    if (!animate) {
      for (const cleanup of running.current.values()) cleanup();
      return;
    }
    // Ordinary server snapshots must not cut a flight short. Only replace an
    // animation when that same card moves again, or when its flight finishes.
    const travel = (
      id: string,
      from: DOMRect,
      to: DOMRect,
      image: string,
      rotation: string,
      destination?: HTMLElement,
    ) => {
      if (!image || !from.width || !to.width) return;
      running.current.get(id)?.();
      const ghost = document.createElement("div");
      ghost.className = "travelling-card";
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
      });
      const img = document.createElement("img");
      img.src = image;
      img.style.transform = `translate(-50%, -50%) ${rotation}`;
      Object.assign(img.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: rotation === "rotate(90deg)" ? `${to.height}px` : "100%",
        height: rotation === "rotate(90deg)" ? `${to.width}px` : "100%",
      });
      ghost.append(img);
      document.body.append(ghost);
      if (destination) destination.style.visibility = "hidden";
      const animation = ghost.animate(
        [
          {
            transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            opacity: 0.8,
          },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ],
        { duration: 440, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      const cleanup = () => {
        animation.cancel();
        ghost.remove();
        if (destination) destination.style.visibility = "";
        running.current.delete(id);
      };
      animation.onfinish = cleanup;
      running.current.set(id, cleanup);
    };
    const deck = document.querySelector(".deck-stack")?.getBoundingClientRect();
    const discard = document
      .querySelector(".discard-stack")
      ?.getBoundingClientRect();
    let moved = false;
    for (const node of nodes) {
      const id = node.dataset.motionCard!,
        to = positions.get(id)!,
        from = old.get(id);
      if (from && from.zone === to.zone) {
        if (
          Math.abs(from.rect.left - to.rect.left) +
            Math.abs(from.rect.top - to.rect.top) >
          3
        ) {
          running.current.get(id)?.();
          const anim = node.animate(
            [
              {
                translate: `${from.rect.left - to.rect.left}px ${from.rect.top - to.rect.top}px`,
              },
              { translate: "0 0" },
            ],
            { duration: 350, easing: "ease-out" },
          );
          const cleanup = () => {
            anim.cancel();
            running.current.delete(id);
          };
          anim.onfinish = cleanup;
          running.current.set(id, cleanup);
        }
      } else {
        const origin =
          from?.rect ??
          (to.zone === "hand"
            ? deck
            : document.querySelector(".table-center")?.getBoundingClientRect());
        if (origin) {
          travel(id, origin, to.rect, to.image, to.rotation, node);
          moved = true;
        }
      }
    }
    for (const [id, from] of old) {
      if (positions.has(id) || from.zone === "hand") continue;
      // Animate only cards known in this player's public view. Never infer an
      // opponent's hidden hand from a disappearing card.
      if (view?.discard.some((c) => c.uid === id) && discard) {
        travel(id, from.rect, discard, from.image, from.rotation);
        moved = true;
      }
    }
    if (moved) sound("card");
  }, [
    view?.hand,
    view?.moods,
    view?.discard,
    view?.status,
    view?.you,
    connected,
    reduced,
  ]);
}
export function Score({ value }: { value: number }) {
  const old = useRef(value);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const difference = value - old.current;
    old.current = value;
    if (!difference) return;
    setDelta(difference);
    const timer = setTimeout(() => setDelta(0), 1700);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <>
      <strong key={value} className="score-number">
        {value}
      </strong>
      {delta !== 0 && (
        <span
          className={`score-delta ${delta < 0 ? "loss" : "gain"}`}
          aria-hidden="true"
          key={`${value}:${delta}`}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </>
  );
}
export function useTurnSound(
  view: View | undefined,
  paused: boolean,
  connected: boolean,
) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    const state =
      connected && view
        ? `${view.you}:${view.active}:${view.winner ?? ""}`
        : undefined;
    if (paused) return;
    if (last.current && state !== last.current && view && !document.hidden) {
      if (view.winner === view.you) sound("win");
      else if (view.active === view.you) sound("turn");
    }
    last.current = state;
  }, [view?.active, view?.winner, view?.you, paused, connected]);
}
