"use client";

interface BuzzerButtonProps {
  enabled: boolean;
  onBuzz: () => void;
}

/** A chunky arcade buzzer that physically sinks when pressed, with a pulsing ring while the buzzer is open. Space bar works too. */
export default function BuzzerButton({ enabled, onBuzz }: BuzzerButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`rounded-full p-3 ${enabled ? "animate-buzzer-ready" : ""} bg-gradient-to-b from-slate-300 to-slate-500 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]`}>
        <button
          onClick={onBuzz}
          disabled={!enabled}
          autoFocus={enabled}
          className="arcade-buzzer h-32 w-32 rounded-full font-display text-3xl tracking-widest text-white [text-shadow:0_2px_0_rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:grayscale sm:h-36 sm:w-36"
        >
          BUZZ
        </button>
      </div>
      {enabled && <span className="font-heading text-sm tracking-[0.3em] text-gold-400">FIRST TO BUZZ ANSWERS</span>}
    </div>
  );
}
