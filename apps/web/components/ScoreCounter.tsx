"use client";

import { useEffect, useRef, useState } from "react";
import { teamTheme } from "../lib/teamTheme";
import Avatar from "./Avatar";

interface ScoreCounterProps {
  teamId: string;
  label: string;
  value: number;
  /** This team controls the board (or is stealing) right now. */
  active?: boolean;
  strikes?: number;
  members?: { id: string; name: string; captain: boolean }[];
}

const TICK_DURATION_MS = 900;

/** A team's scoreboard: digital-glow total that counts up, a floating "+N" on every gain, and a glow while in control. */
export default function ScoreCounter({ teamId, label, value, active, strikes = 0, members = [] }: ScoreCounterProps) {
  const [displayed, setDisplayed] = useState(value);
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);
  const frame = useRef<number | null>(null);
  const theme = teamTheme(teamId);

  useEffect(() => {
    const start = displayed;
    const delta = value - start;
    if (delta === 0) return;
    if (delta > 0) setGain({ id: Date.now(), amount: delta });
    const startTime = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / TICK_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + delta * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className={`relative flex min-w-[6.5rem] flex-col items-center rounded-xl border-2 bg-gradient-to-b from-navy-800 to-navy-950 px-4 py-3 transition-all duration-500 sm:min-w-[8rem] sm:px-6 ${
        active ? `${theme.border} ${theme.glow} scale-105` : "border-navy-600"
      }`}
    >
      {active && (
        <span className={`absolute -top-3 rounded-full border px-2 py-0.5 font-heading text-[11px] tracking-widest ${theme.chip} bg-navy-950`}>
          IN CONTROL
        </span>
      )}
      <span className={`max-w-[8rem] truncate font-heading text-sm tracking-widest ${theme.text}`}>{label}</span>
      <span className="animate-score-glow font-display text-4xl tabular-nums text-gold-400 sm:text-5xl">{displayed}</span>
      {active && (
        <span className="mt-1 flex gap-1" aria-label={`${strikes} strikes`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 w-4 rounded-full ${i < strikes ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" : "bg-navy-600"}`} />
          ))}
        </span>
      )}
      {members.length > 0 && (
        <span className="mt-2 flex -space-x-2">
          {members.map((m) => (
            <Avatar key={m.id} playerId={m.id} name={m.captain ? `${m.name} (captain)` : m.name} teamId={teamId} size="sm" className={m.captain ? "z-10 ring-gold-400" : ""} />
          ))}
        </span>
      )}
      {gain && (
        <span key={gain.id} className="pointer-events-none absolute -top-2 right-1 animate-float-up font-display text-2xl text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
          +{gain.amount}
        </span>
      )}
    </div>
  );
}
