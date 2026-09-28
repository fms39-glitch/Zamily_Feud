"use client";

interface BuzzerButtonProps {
  enabled: boolean;
  onBuzz: () => void;
}

/** The contestant's buzzer: pulses gold to invite a press while the buzzer is open, first press wins. */
export default function BuzzerButton({ enabled, onBuzz }: BuzzerButtonProps) {
  return (
    <button
      onClick={onBuzz}
      disabled={!enabled}
      className={`h-32 w-32 rounded-full font-display text-2xl tracking-wide text-navy-950 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
        enabled ? "bg-gold-500 hover:bg-gold-400 animate-buzzer-ready" : "bg-navy-700"
      }`}
    >
      BUZZ
    </button>
  );
}
