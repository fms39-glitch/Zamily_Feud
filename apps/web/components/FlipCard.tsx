"use client";

interface FlipCardProps {
  number: number;
  answer: string;
  points: number;
  revealed: boolean;
  onClick?: () => void;
}

/** A classic Family Feud board slot: blank numbered face until it flips to reveal the answer + points. */
export default function FlipCard({ number, answer, points, revealed, onClick }: FlipCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={revealed}
      className="perspective-1000 h-16 w-full text-left disabled:cursor-default"
      aria-label={revealed ? answer : `Slot ${number}, hidden`}
    >
      <div
        className={`preserve-3d relative h-full w-full transition-transform duration-[600ms] ${
          revealed ? "rotate-y-180" : ""
        }`}
      >
        <div className="tile-face backface-hidden absolute inset-0 flex items-center rounded-md px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-950 font-heading text-lg text-white">
            {number}
          </span>
        </div>
        <div className="tile-face rotate-y-180 backface-hidden absolute inset-0 flex items-center justify-between rounded-md px-4">
          <span className="font-heading text-lg uppercase tracking-wide text-white">{answer}</span>
          <span className="rounded-full bg-gold-500 px-3 py-1 font-display text-navy-950">{points}</span>
        </div>
      </div>
    </button>
  );
}
