"use client";

import { medalClass } from "../lib/teamTheme";

interface FlipCardProps {
  number: number;
  answer: string;
  points: number;
  /** 1 = the number-one answer; the top three get medal finishes once revealed. */
  rank: number;
  revealed: boolean;
  /** Flipped at round end because nobody got it: shown greyed out, no medal. */
  missed?: boolean;
  /** True for a moment right after this slot flips — plays the gold match glow. */
  celebrate?: boolean;
  onClick?: () => void;
}

/** A classic Family Feud board slot: glossy numbered face until it flips; top-three answers flip to gold, silver, bronze. */
export default function FlipCard({ number, answer, points, rank, revealed, missed, celebrate, onClick }: FlipCardProps) {
  const medal = rank <= 3 && !missed;
  const textColor = medal ? "text-navy-950" : "text-white";
  return (
    <button
      onClick={onClick}
      disabled={revealed || !onClick}
      className="perspective-1000 h-14 w-full text-left disabled:cursor-default sm:h-16"
      aria-label={revealed ? `${answer}, ${points} points` : `Slot ${number}, hidden`}
    >
      <div
        className={`preserve-3d relative h-full w-full rounded-md transition-transform duration-[650ms] [transition-timing-function:cubic-bezier(0.34,1.4,0.64,1)] ${
          revealed ? "rotate-y-180" : ""
        } ${celebrate ? "animate-match-glow" : ""}`}
      >
        {/* Hidden face */}
        <div className="tile-face backface-hidden absolute inset-0 flex items-center justify-center overflow-hidden rounded-md">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-tile-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <span className="relative flex h-9 w-12 items-center justify-center rounded-[50%] border-2 border-sky-200/60 bg-gradient-to-b from-navy-700 to-navy-950 font-display text-xl text-white shadow-[inset_0_2px_4px_rgba(255,255,255,0.25)]">
            {number}
          </span>
        </div>

        {/* Revealed face */}
        <div
          className={`tile-face rotate-y-180 backface-hidden absolute inset-0 flex items-center justify-between gap-2 rounded-md border-2 px-3 sm:px-4 ${
            missed ? "tile-missed" : medalClass(rank)
          }`}
        >
          <span className={`flex min-w-0 items-center gap-2 font-heading text-lg uppercase tracking-wide sm:text-xl ${textColor}`}>
            {missed && <span className="rounded bg-navy-950/60 px-1.5 font-heading text-[10px] tracking-widest text-slate-400">MISSED</span>}
            {rank === 1 && !missed && (
              <span className="animate-crown-bob text-base" aria-hidden>
                👑
              </span>
            )}
            <span className="truncate">{answer}</span>
          </span>
          <span
            className={`flex h-9 min-w-[2.75rem] flex-shrink-0 items-center justify-center rounded-md px-2 font-display text-xl ${
              missed ? "bg-navy-950/60 text-slate-400" : medal ? "bg-navy-950/85 text-gold-400" : "bg-gold-500 text-navy-950"
            } shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]`}
          >
            {points}
          </span>
        </div>
      </div>
    </button>
  );
}

/** An empty board slot: shown between questions so the board keeps its shape instead of collapsing. */
export function BlankTile() {
  return <div className="tile-face h-14 w-full rounded-md opacity-50 saturate-50 sm:h-16" aria-hidden />;
}
