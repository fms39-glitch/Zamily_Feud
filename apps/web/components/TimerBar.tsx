"use client";

import { useEffect, useRef } from "react";
import type { TimerState } from "@zamily-feud/shared";
import { useCountdown } from "../hooks/useCountdown";
import { sfx } from "../lib/sfx";

interface TimerBarProps {
  timer: TimerState;
  label: string;
}

const URGENT_MS = 3_000;

/** A shrinking countdown bar driven by the server's timer snapshot; turns red, pulses, and ticks in the last seconds. */
export default function TimerBar({ timer, label }: TimerBarProps) {
  const remainingMs = useCountdown(timer);
  const lastTick = useRef<number | null>(null);
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = timer.kind !== null && timer.kind !== "QUESTION_INTRO" && remainingMs > 0 && remainingMs <= URGENT_MS;

  useEffect(() => {
    if (urgent && lastTick.current !== seconds) {
      lastTick.current = seconds;
      sfx.tick();
    }
    if (!urgent) lastTick.current = null;
  }, [urgent, seconds]);

  // The question intro has its own full-screen countdown.
  if (!timer.kind || timer.kind === "QUESTION_INTRO") return null;
  const pct = timer.durationMs > 0 ? Math.max(0, Math.min(100, (remainingMs / timer.durationMs) * 100)) : 0;

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-1 flex items-center justify-between font-heading text-sm uppercase tracking-[0.2em] text-slate-300">
        <span>{label}</span>
        <span className={`font-display text-2xl tabular-nums ${urgent ? "text-red-400" : "text-gold-400"}`}>{seconds}</span>
      </div>
      <div className={`h-3 w-full overflow-hidden rounded-full border border-navy-600 bg-navy-950 ${urgent ? "animate-urgent-pulse" : ""}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-100 ease-linear ${
            urgent ? "from-red-600 to-red-400" : "from-gold-600 via-gold-400 to-gold-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
