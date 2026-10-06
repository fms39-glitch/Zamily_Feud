"use client";

import { medalClass } from "../lib/teamTheme";

interface HostFlipCardProps {
  number: number;
  answerText: string;
  points: number;
  rank: number;
  revealed: boolean;
  missed?: boolean;
  /** The matching engine's best guess for the most recent submission — highlighted, never auto-revealed. */
  suggested?: boolean;
  onReveal: () => void;
}

/**
 * The host-only board tile: the answer is always here (so the host knows
 * what to look for), rendered blurred until the host actually reveals it.
 * Clicking is the only thing that reveals — matching just suggests.
 */
export default function HostFlipCard({ number, answerText, points, rank, revealed, missed, suggested, onReveal }: HostFlipCardProps) {
  const medal = revealed && rank <= 3 && !missed;
  return (
    <button
      onClick={onReveal}
      disabled={revealed}
      className={`tile-face group flex h-14 w-full items-center justify-between rounded-md border-2 border-transparent px-3 text-left transition hover:brightness-110 disabled:cursor-default sm:h-16 sm:px-4 ${
        suggested && !revealed ? "ring-4 ring-emerald-400 ring-offset-2 ring-offset-navy-900" : ""
      } ${missed ? "tile-missed" : revealed ? `${medalClass(rank)} animate-match-glow` : ""}`}
      title={revealed ? undefined : "Reveal this answer"}
    >
      <span className="flex items-center gap-3 overflow-hidden">
        <span className="flex h-8 w-10 flex-shrink-0 items-center justify-center rounded-[50%] border-2 border-sky-200/60 bg-gradient-to-b from-navy-700 to-navy-950 font-display text-lg text-white">
          {number}
        </span>
        <span
          className={`truncate font-heading text-lg uppercase tracking-wide transition ${medal ? "text-navy-950" : "text-white"} ${
            revealed ? "" : "select-none blur-[5px] group-hover:blur-[3px]"
          }`}
        >
          {rank === 1 && revealed ? "👑 " : ""}
          {answerText}
        </span>
      </span>
      <span className={`flex-shrink-0 rounded-md px-3 py-1 font-display ${medal ? "bg-navy-950/85 text-gold-400" : "bg-gold-500 text-navy-950"}`}>{points}</span>
    </button>
  );
}
