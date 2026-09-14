import React, { useEffect } from "react";
import type { View } from "../game/types";

// Follow the visible viewport when mobile browser chrome or the keyboard moves.
export function usePortableViewport() {
  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const style = document.documentElement.style;
      style.setProperty("--visible-height", `${height}px`);
      style.setProperty("--visible-top", `${top}px`);
      style.setProperty(
        "--visible-bottom",
        `${Math.max(0, innerHeight - height - top)}px`,
      );
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      for (const name of [
        "--visible-height",
        "--visible-top",
        "--visible-bottom",
      ])
        document.documentElement.style.removeProperty(name);
    };
  }, []);
}
let locks = 0;
let restore: (() => void) | undefined;
// Inspection can sit above the catalog or settings. Keep the page locked until
// the last overlay closes, then restore the exact scroll position.
export function useOverlayScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      const body = document.body,
        y = window.scrollY,
        x = window.scrollX;
      const old = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };
      const gutter = innerWidth - document.documentElement.clientWidth;
      Object.assign(body.style, {
        position: "fixed",
        top: `${-y}px`,
        left: `${-x}px`,
        width: "100%",
        overflow: "hidden",
        paddingRight: `${gutter}px`,
      });
      restore = () => {
        Object.assign(body.style, old);
        window.scrollTo({ left: x, top: y, behavior: "instant" });
      };
    }
    return () => {
      if (--locks === 0) {
        restore?.();
        restore = undefined;
      }
    };
  }, [active]);
}
export function OpponentOverview({
  view,
  reduced,
}: {
  view: View;
  reduced: boolean;
}) {
  return (
    <div className="portable-opponents">
      <div className="portable-caption">
        <span>AROUND THE TABLE</span>
        <span>Swipe to see moods →</span>
      </div>
      <nav aria-label="Opponent scores" className="opponent-overview">
        {view.players
          .filter((p) => p.id !== view.you)
          .map((p) => (
            <button
              key={p.id}
              className={view.active === p.id ? "seat-active" : ""}
              aria-label={`Show ${p.name}’s moods, ${p.score} points`}
              aria-controls={`seat-${p.id}`}
              onClick={() => {
                const seat = document.getElementById(`seat-${p.id}`),
                  rail = seat?.parentElement;
                if (seat && rail)
                  rail.scrollTo({
                    left:
                      rail.scrollLeft +
                      seat.getBoundingClientRect().left -
                      rail.getBoundingClientRect().left -
                      5,
                    behavior: reduced ? "instant" : "smooth",
                  });
              }}
            >
              <span>{p.name}</span>
              <strong>{p.score}</strong>
              <small>
                {view.active === p.id ? "PLAYING" : `${p.wins}/3 rounds`}
              </small>
            </button>
          ))}
      </nav>
    </div>
  );
}
