"use client";

import { useState } from "react";
import FlipCard from "./FlipCard";
import ScoreCounter from "./ScoreCounter";
import StrikePopup from "./StrikePopup";

interface GameBoardPreviewProps {
  team1Name: string;
  team2Name: string;
  onExit: () => void;
}

/**
 * Real answers from the dataset (Phase 2), but this component's interactions
 * are local-only demo state — buzzing, turns, and real scoring are the
 * Phase 4/5 game engine, not built yet. This showcases the board's look and
 * animations ahead of that wiring.
 */
const SAMPLE_QUESTION = "Name something you associate with Egypt";
const SAMPLE_ANSWERS = [
  { answer: "Pyramids", points: 77 },
  { answer: "Sphinx", points: 7 },
  { answer: "Camels", points: 4 },
  { answer: "Nile River", points: 3 },
  { answer: "Desert", points: 3 },
  { answer: "Cleopatra", points: 2 },
  { answer: "Pharaoh", points: 2 },
  { answer: "Mummies", points: 1 },
];

export default function GameBoardPreview({ team1Name, team2Name, onExit }: GameBoardPreviewProps) {
  const [revealed, setRevealed] = useState<boolean[]>(() => SAMPLE_ANSWERS.map(() => false));
  const [boardTotal, setBoardTotal] = useState(0);
  const [scores, setScores] = useState({ team1: 0, team2: 0 });
  const [strikes, setStrikes] = useState(0);
  const [showStrike, setShowStrike] = useState(false);

  function revealSlot(index: number) {
    if (revealed[index]) return;
    setRevealed((prev) => prev.map((r, i) => (i === index ? true : r)));
    setBoardTotal((total) => total + SAMPLE_ANSWERS[index].points);
  }

  function triggerStrike() {
    if (strikes >= 3) return;
    setStrikes((s) => s + 1);
    setShowStrike(true);
    setTimeout(() => setShowStrike(false), 1400);
  }

  function bankTo(team: "team1" | "team2") {
    setScores((prev) => ({ ...prev, [team]: prev[team] + boardTotal }));
    setBoardTotal(0);
    setStrikes(0);
    setRevealed(SAMPLE_ANSWERS.map(() => false));
  }

  return (
    <main className="egg-crate-texture min-h-screen p-4 sm:p-8 flex flex-col items-center gap-6">
      <div className="w-full max-w-4xl flex items-center justify-between">
        <span className="rounded bg-navy-800 px-3 py-1 text-xs text-gold-400 border border-gold-500">PREVIEW MODE — visuals only, not wired to live gameplay yet</span>
        <button onClick={onExit} className="rounded border border-navy-600 px-3 py-1 text-sm hover:border-gold-500">
          Back to lobby
        </button>
      </div>

      <div className="flex w-full max-w-5xl items-center justify-center gap-4">
        <ScoreCounter label={team1Name} value={scores.team1} />

        <div className="board-oval egg-crate-texture relative flex-1 px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto mb-4 max-w-xl rounded-md bg-slate-100 px-4 py-3 text-center">
            <p className="font-heading text-lg text-navy-900">{SAMPLE_QUESTION}</p>
          </div>

          <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
            {SAMPLE_ANSWERS.map((a, i) => (
              <FlipCard
                key={a.answer}
                number={i + 1}
                answer={a.answer}
                points={a.points}
                revealed={revealed[i]}
                onClick={() => revealSlot(i)}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="rounded-lg border-2 border-gold-500 bg-navy-950 px-5 py-2 text-center">
              <span className="block text-xs text-slate-400">BOARD</span>
              <span className="font-display text-3xl text-gold-400">{boardTotal}</span>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`flex h-9 w-9 items-center justify-center rounded border-2 font-display text-xl ${
                    i < strikes ? "border-red-500 bg-red-600 text-white" : "border-navy-600 text-navy-600"
                  }`}
                >
                  X
                </span>
              ))}
            </div>
          </div>
        </div>

        <ScoreCounter label={team2Name} value={scores.team2} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={triggerStrike} className="rounded bg-red-600 px-4 py-2 font-heading hover:bg-red-500">
          Strike!
        </button>
        <button onClick={() => bankTo("team1")} className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600">
          Bank to {team1Name}
        </button>
        <button onClick={() => bankTo("team2")} className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600">
          Bank to {team2Name}
        </button>
      </div>

      <StrikePopup visible={showStrike} />
    </main>
  );
}
