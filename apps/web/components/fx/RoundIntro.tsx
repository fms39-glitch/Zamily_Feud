"use client";

import type { RoomSession } from "@zamily-feud/shared";
import { useCountdown } from "../../hooks/useCountdown";

/**
 * Full-screen title card while a new question's intro runs (AI rooms): "ROUND 3 OF 5" / "FINAL ROUND",
 * the question, and a countdown to the buzzer opening. It ends exactly when the server opens the buzzer.
 */
export default function RoundIntro({ room }: { room: RoomSession }) {
  const remainingMs = useCountdown(room.timer);
  if (room.timer.kind !== "QUESTION_INTRO") return null;
  const final = room.totalRounds !== null && room.roundNumber >= room.totalRounds;
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const pct = room.timer.durationMs > 0 ? (remainingMs / room.timer.durationMs) * 100 : 0;

  return (
    <div key={room.currentQuestionId} className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-navy-950/90 px-6 backdrop-blur-sm">
      <div className="egg-crate-texture absolute inset-0 opacity-30" aria-hidden />
      <div className="pointer-events-none absolute inset-0 animate-lens-sweep bg-gradient-to-r from-transparent via-white/15 to-transparent" aria-hidden />
      <div className="relative flex max-w-3xl flex-col items-center gap-5 text-center">
        <span className="animate-slam-in font-heading text-lg tracking-[0.5em] text-slate-300">
          {final ? "LAST ONE · DOUBLE THE DRAMA" : "GET READY"}
        </span>
        <h2 className={`animate-stamp-in font-display text-6xl tracking-wide sm:text-8xl ${final ? "text-metal-gold" : "text-white"}`}>
          {final ? "FINAL ROUND" : `ROUND ${room.roundNumber}`}
          {!final && room.totalRounds !== null && <span className="ml-3 align-middle text-3xl text-slate-400 sm:text-4xl">of {room.totalRounds}</span>}
        </h2>
        <div className="animate-rise-in rounded-2xl border-2 border-gold-500 bg-gradient-to-b from-white to-slate-200 px-6 py-4 shadow-[0_6px_0_#0a1730,0_0_40px_rgba(244,196,48,0.35)] [animation-delay:400ms]">
          <span className="block font-heading text-xs tracking-[0.35em] text-navy-600">WE ASKED 100 PEOPLE</span>
          <p className="font-heading text-2xl leading-tight text-navy-900 sm:text-4xl">{room.questionText}</p>
        </div>
        <div className="flex items-center gap-4 animate-rise-in [animation-delay:700ms]">
          <span className="font-heading text-lg tracking-[0.3em] text-gold-400">BUZZERS OPEN IN</span>
          <span className="relative flex h-16 w-16 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="16" fill="none" stroke="#173a7a" strokeWidth="3" />
              <circle cx="18" cy="18" r="16" fill="none" stroke="#f4c430" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 100.5} 100.5`} />
            </svg>
            <span key={seconds} className="animate-badge-pop font-display text-3xl text-white">
              {seconds}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
