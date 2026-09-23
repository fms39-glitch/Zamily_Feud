"use client";

import { useEffect, useRef, useState } from "react";

interface ScoreCounterProps {
  label: string;
  value: number;
}

const TICK_DURATION_MS = 700;

/** Digital-glow scoreboard readout that counts up (never jumps) when its value increases. */
export default function ScoreCounter({ label, value }: ScoreCounterProps) {
  const [displayed, setDisplayed] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = displayed;
    const delta = value - start;
    if (delta === 0) return;
    const startTime = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / TICK_DURATION_MS);
      setDisplayed(Math.round(start + delta * progress));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    }
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex flex-col items-center rounded-lg border-2 border-gold-500 bg-navy-950 px-6 py-3">
      <span className="font-heading text-sm text-slate-400 tracking-wide">{label}</span>
      <span className="animate-score-glow font-display text-5xl text-gold-400">{displayed}</span>
    </div>
  );
}
