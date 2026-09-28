"use client";

import type { TimerState } from "@zamily-feud/shared";
import { useCountdown } from "../hooks/useCountdown";

interface TimerBarProps {
  timer: TimerState;
  label: string;
}

/** A shrinking countdown bar driven by the server's timer snapshot, never a local-only clock. */
export default function TimerBar({ timer, label }: TimerBarProps) {
  const remainingMs = useCountdown(timer);
  if (!timer.kind) return null;

  const pct = timer.durationMs > 0 ? Math.max(0, Math.min(100, (remainingMs / timer.durationMs) * 100)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="w-full max-w-md">
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span className="font-heading text-lg text-gold-400">{seconds}s</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-navy-800">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${pct < 25 ? "bg-red-500" : "bg-gold-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
