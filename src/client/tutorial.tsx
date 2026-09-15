import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, Crown, RotateCcw, X } from "lucide-react";
import { publicView } from "../game/engine";
import { advanceLesson, createLessonGame, lesson } from "../game/tutorial";
import { ScoreDetails, type ScoreSheet } from "./score-details";
import { EffectNotice, useEffectFeedback } from "./effects";
import { catalog } from "../game/catalog";
import type { PublicCard } from "../game/types";

export default function Tutorial({
  close,
  inspect,
  complete,
  reading,
}: {
  reading: boolean;
  close: () => void;
  inspect: (id: string) => void;
  complete: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [game, setGame] = useState(createLessonGame);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<ScoreSheet>();
  const view = publicView(game, "you", true);
  const effects = useEffectFeedback(view, true);
  const current = lesson[step];
  const plays = view.active === "you" ? view.grants.length : 0;
  useEffect(() => {
    panel.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const bot = !!current.actor && current.actor !== "you";
  const finished = game.status === "finished";
  function next() {
    try {
      if (step === lesson.length - 1) {
        close();
        return;
      }
      setGame(advanceLesson(game, step));
      setStep((n) => n + 1);
      setSelected("");
      setError("");
    } catch {
      setError(
        "That practice move couldn’t finish. Restart the lesson to try again.",
      );
    }
  }
  useEffect(() => {
    if (!bot || sheet || reading) return;
    const timer = setTimeout(next, 1900);
    return () => clearTimeout(timer);
  }, [step, sheet, reading]);
  useEffect(() => {
    if (finished) complete();
  }, [finished]);
  function showScore(id: string) {
    const result = game.lastRound;
    // At the lesson's scoring checkpoints, show the actual recorded result.
    const counted = [6, 13, 17, 20].includes(step) && result;
    setSheet({
      selected: id,
      players: view.players,
      details: counted ? result.scoreDetails : view.scoreDetails,
      totals: counted
        ? result.scores
        : Object.fromEntries(view.players.map((p) => [p.id, p.score])),
      round: counted ? result.round : view.round,
      phase: counted ? "final" : "live",
    });
  }
  function card(c: PublicCard, hand = false) {
    const expected = hand ? current.play : current.choose;
    const eligible = expected === c.def && !bot;
    const printed = catalog.find((d) => d.id === c.def)?.printed_values;
    const flipped = !hand && printed?.length === 2 && c.value === printed[1];
    return (
      <div
        className={`practice-card ${eligible ? "practice-eligible" : ""} ${selected === c.uid ? "practice-selected" : ""}`}
        key={c.uid}
      >
        <button
          aria-label={`${eligible ? "Choose" : "Read"} ${c.name}`}
          aria-pressed={eligible ? selected === c.uid : undefined}
          onClick={() => (eligible ? setSelected(c.uid) : inspect(c.def))}
          data-card-image={c.image}
          data-card-name={c.name}
        >
          <img
            src={c.image}
            alt={c.name}
            style={{ transform: flipped ? "rotate(180deg)" : undefined }}
          />
          {!hand && <b>{c.value}</b>}
          {selected === c.uid && (
            <span className="practice-check">
              <Check size={20} />
            </span>
          )}
        </button>
        <button className="practice-read" onClick={() => inspect(c.def)}>
          Read {c.name}
        </button>
      </div>
    );
  }
  return (
    <div className="modal-backdrop tutorial-backdrop">
      <section
        ref={panel}
        className="tutorial"
        role="dialog"
        aria-modal="true"
        aria-label="Guided first game"
      >
        <header className="practice-header">
          <span className="eyebrow">
            <BookOpen size={16} /> THE PRACTICE TABLE
          </span>
          <button data-dialog-close onClick={close} aria-label="Close practice">
            <X />
          </button>
        </header>
        <div
          className="practice-progress"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={lesson.length - 1}
          aria-valuenow={step}
        >
          <i style={{ width: `${(step / (lesson.length - 1)) * 100}%` }} />
        </div>
        <div className="practice-coach" aria-live="polite">
          <span className="eyebrow">
            {finished
              ? "LESSON COMPLETE"
              : `ROUND ${view.round} · ${bot ? "BOT TURN" : "YOUR GUIDE"}`}
          </span>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="practice-table" aria-label="Practice table">
          {view.players.map((p) => (
            <section
              className={`practice-seat ${view.active === p.id ? "practice-active" : ""}`}
              key={p.id}
            >
              <div className="practice-seat-head">
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.id === "you"
                      ? `${plays} ${plays === 1 ? "play" : "plays"} available`
                      : "Practice bot"}
                  </small>
                </div>
                <span className="practice-wins">
                  <Crown size={14} /> {p.wins}/3
                </span>
                <button
                  onClick={() => showScore(p.id)}
                  aria-label={
                    p.id === "you"
                      ? "Explain your practice score"
                      : `Explain ${p.name}’s practice score`
                  }
                >
                  <b>{p.score}</b>
                  <small>POINTS ↗</small>
                </button>
              </div>
              <div className="practice-moods">
                {view.moods.filter((c) => c.owner === p.id).map((c) => card(c))}
                {!view.moods.some((c) => c.owner === p.id) && (
                  <p>No moods yet</p>
                )}
              </div>
            </section>
          ))}
        </div>
        <EffectNotice changes={effects.changes} dismiss={effects.dismiss} />
        {!finished && (
          <div className="practice-hand">
            <span className="eyebrow">
              YOUR HAND · {view.hand.length} CARDS
            </span>
            <div>{view.hand.map((c) => card(c, true))}</div>
          </div>
        )}
        <footer className="practice-footer">
          <span>Curated deal · scripted bots · the real game rules</span>
          <button
            onClick={() => {
              setGame(createLessonGame());
              setStep(0);
              setSelected("");
              setError("");
            }}
          >
            <RotateCcw size={14} /> Restart lesson
          </button>
        </footer>
        <div className="practice-actions">
          {" "}
          {bot ? (
            <span className="practice-thinking">
              {view.players.find((p) => p.id === current.actor)?.name} is
              playing…
            </span>
          ) : (
            <button
              className="primary"
              onClick={next}
              disabled={!!(current.play || current.choose) && !selected}
            >
              {current.button ??
                (current.play
                  ? `Play ${catalog.find((c) => c.id === current.play)!.name}`
                  : current.choose
                    ? "Confirm Apathy"
                    : "End turn")}
              <ArrowRight size={17} />
            </button>
          )}
        </div>
      </section>
      {sheet && (
        <ScoreDetails
          sheet={sheet}
          close={() => setSheet(undefined)}
          inspect={inspect}
        />
      )}
    </div>
  );
}
