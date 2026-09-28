"use client";

interface HostFlipCardProps {
  number: number;
  answerText: string;
  points: number;
  revealed: boolean;
  /** The matching engine's best guess for the most recent submission — highlighted, never auto-revealed. */
  suggested?: boolean;
  onReveal: () => void;
}

/**
 * The host-only board tile: the answer is always here (so the host knows
 * what to look for), rendered blurred until the host actually reveals it.
 * Clicking is the only thing that reveals — matching just suggests.
 */
export default function HostFlipCard({ number, answerText, points, revealed, suggested, onReveal }: HostFlipCardProps) {
  return (
    <button
      onClick={onReveal}
      disabled={revealed}
      className={`tile-face flex h-16 w-full items-center justify-between rounded-md px-4 text-left transition disabled:cursor-default ${
        suggested && !revealed ? "ring-4 ring-emerald-400" : ""
      } ${revealed ? "animate-match-glow" : ""}`}
    >
      <span className="flex items-center gap-3 overflow-hidden">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-navy-950 font-heading text-lg text-white">
          {number}
        </span>
        <span
          className={`truncate font-heading text-lg uppercase tracking-wide text-white transition ${
            revealed ? "" : "select-none blur-[5px]"
          }`}
        >
          {answerText}
        </span>
      </span>
      <span className="flex-shrink-0 rounded-full bg-gold-500 px-3 py-1 font-display text-navy-950">{points}</span>
    </button>
  );
}
