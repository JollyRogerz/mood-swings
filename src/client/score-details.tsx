import React, { useState } from "react";
import { X, ArrowUpRight, Calculator } from "lucide-react";
import type { ScoreBreakdown, View } from "../game/types";
import { catalog } from "../game/catalog";

export interface ScoreSheet {
  selected: string;
  players: View["players"];
  details?: Record<string, ScoreBreakdown>;
  totals: Record<string, number>;
  round: number;
  phase: "live" | "scoring" | "final";
}
export function ScoreDetails({
  sheet,
  close,
  inspect,
}: {
  sheet: ScoreSheet;
  close: () => void;
  inspect: (id: string) => void;
}) {
  const [player, setPlayer] = useState(sheet.selected);
  const who = sheet.players.find((p) => p.id === player)!;
  const breakdown = sheet.details?.[player];
  return (
    <div className="modal-backdrop score-details-backdrop" onClick={close}>
      <section
        className="score-details"
        role="dialog"
        aria-modal="true"
        aria-label="Score breakdown"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-modal"
          data-dialog-close
          onClick={close}
          aria-label="Close score breakdown"
        >
          <X />
        </button>
        <span className="eyebrow">
          <Calculator size={15} /> ROUND {sheet.round} ·{" "}
          {sheet.phase === "live"
            ? "CURRENT TABLE"
            : sheet.phase === "scoring"
              ? "SCORING"
              : "COUNTED POINTS"}
        </span>
        <h2>Every point has a story.</h2>
        <div className="score-player-tabs" aria-label="Choose a player">
          {sheet.players.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlayer(p.id)}
              aria-pressed={player === p.id}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="score-details-total">
          <span>{who.name}</span>
          <strong>
            {breakdown?.total ?? sheet.totals[player] ?? 0}
            <small>POINTS</small>
          </strong>
        </div>
        {breakdown ? (
          <div className="score-lines">
            {breakdown.lines.map((line, i) => {
              const card = catalog.find((c) => c.id === line.def);
              return (
                <div className={`score-line score-line-${line.kind}`} key={i}>
                  {card ? (
                    <button
                      className="score-line-card"
                      aria-label={`Read ${card.name}`}
                      onClick={(event) => {
                        // Safari doesn't focus buttons on touch by default. Preserve
                        // this exact trigger when returning from the card inspector.
                        event.currentTarget.focus({ preventScroll: true });
                        inspect(card.id);
                      }}
                      data-card-image={`/${card.images[0].path}`}
                      data-card-name={card.name}
                    >
                      <img src={`/${card.images[0].path}`} alt="" />
                      <ArrowUpRight size={12} />
                    </button>
                  ) : (
                    <Calculator size={20} />
                  )}
                  <div>
                    <strong>
                      {line.label}
                      {line.kind === "bonus" && <small> EXTRA POINTS</small>}
                    </strong>
                    <p>{line.detail}</p>
                  </div>
                  <b>
                    {line.kind !== "mood" && line.points > 0 ? "+" : ""}
                    {line.points}
                  </b>
                </div>
              );
            })}
            {!breakdown.lines.length && (
              <p className="score-empty">
                No moods in play yet. The first mood starts the score.
              </p>
            )}
          </div>
        ) : (
          <p>
            This saved round has its final total, but no detailed breakdown.
          </p>
        )}
        <p className="score-details-note">
          {sheet.phase === "live"
            ? "This is the score right now. Scoring effects and score swaps can change the round’s result."
            : "These points were recorded during scoring. Later card movements do not change points already counted."}
        </p>
      </section>
    </div>
  );
}
