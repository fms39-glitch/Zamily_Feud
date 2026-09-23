"use client";

import { useEffect, useState } from "react";

interface CinematicIntroProps {
  onDone: () => void;
}

const AUTO_DISMISS_MS = 3200;

/** Full-screen title reveal played once when the lobby transitions into the board. */
export default function CinematicIntro({ onDone }: CinematicIntroProps) {
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const dismissTimer = setTimeout(() => setDismissing(true), AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimer);
  }, []);

  useEffect(() => {
    if (!dismissing) return;
    const doneTimer = setTimeout(onDone, 650);
    return () => clearTimeout(doneTimer);
  }, [dismissing, onDone]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-navy-950 ${
        dismissing ? "animate-fade-out" : ""
      }`}
      role="button"
      aria-label="Skip intro"
      onClick={() => setDismissing(true)}
    >
      <div className="egg-crate-texture absolute inset-0 opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-navy-900/60 to-navy-950" />

      <div className="pointer-events-none absolute inset-0 animate-lens-sweep bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <div className="relative flex flex-col items-center gap-4 animate-title-reveal">
        <span className="font-heading text-2xl tracking-[0.4em] text-gold-400">PRESENTING</span>
        <h1 className="font-display text-7xl sm:text-8xl md:text-9xl text-outline-navy text-gold-500 drop-shadow-[0_0_35px_rgba(244,196,48,0.65)] tracking-wide">
          ZAMILY FEUD
        </h1>
        <span className="font-heading text-xl tracking-[0.3em] text-slate-300">click anywhere to skip</span>
      </div>
    </div>
  );
}
