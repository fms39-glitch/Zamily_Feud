"use client";

import { useEffect, useState } from "react";
import type { TimerState } from "@zamily-feud/shared";

/** Renders a server-authoritative timer locally: recomputes from startedAt+durationMs, never trusts a client-side interval alone. */
export function useCountdown(timer: TimerState): number {
  const [remainingMs, setRemainingMs] = useState(timer.remainingMs);

  useEffect(() => {
    if (!timer.kind || timer.startedAt === null) {
      setRemainingMs(0);
      return;
    }
    const startedAt = timer.startedAt;
    const durationMs = timer.durationMs;

    function tick() {
      setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAt)));
    }
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [timer.id, timer.kind, timer.startedAt, timer.durationMs]);

  return remainingMs;
}
