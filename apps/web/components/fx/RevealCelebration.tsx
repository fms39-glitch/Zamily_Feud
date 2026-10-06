"use client";

import { useMemo } from "react";
import Confetti, { BRONZE, GOLD, SILVER, type ConfettiBurst } from "./Confetti";
import Avatar from "../Avatar";

export interface Celebration {
  /** Unique per reveal, so back-to-back reveals each replay. */
  id: number;
  rank: number;
  answerText: string;
  points: number;
  teamName: string | null;
  /** Who said it — their picture joins the celebration. */
  playerId: string | null;
  playerName: string | null;
  teamId: string | null;
}

/** Fixed star positions (vw/vh %) for the silver twinkle field: deterministic, so no hydration or re-render jitter. */
const STARS = [
  [12, 18], [24, 62], [33, 12], [41, 78], [58, 20], [66, 70], [74, 14], [83, 48], [90, 76], [8, 44], [50, 88], [62, 40],
] as const;

/** Where the three bronze fireworks go off, and when. */
const FIREWORKS = [
  { x: 0.24, y: 0.3, delay: 0 },
  { x: 0.76, y: 0.26, delay: 0.28 },
  { x: 0.5, y: 0.16, delay: 0.56 },
] as const;

/**
 * Full-screen reveal celebration. The top three answers each get their own concept:
 *  #1 Jackpot: dimmed stage, spinning gold sunburst, stamped headline, twin confetti cannons.
 *  #2 Spotlight: crossing searchlights, twinkling silver stars, a ribbon banner.
 *  #3 Fireworks: three bronze bursts going off in sequence, a medal badge.
 * Everything is pointer-transparent so play continues underneath.
 */
export default function RevealCelebration({ celebration }: { celebration: Celebration }) {
  const { rank, answerText, points, teamName, playerId, playerName, teamId } = celebration;
  const hero = playerId ? <Avatar playerId={playerId} name={playerName ?? ""} teamId={teamId} size="xl" className="animate-badge-pop shadow-[0_0_40px_rgba(244,196,48,0.6)]" /> : null;

  const bursts = useMemo<ConfettiBurst[]>(() => {
    if (rank === 1) {
      return [
        { x: 0, y: 0.85, count: 110, angle: -60, spread: 40, speed: 1250, colors: GOLD },
        { x: 1, y: 0.85, count: 110, angle: -120, spread: 40, speed: 1250, colors: GOLD },
        { x: 0.5, y: 0.45, count: 50, angle: -90, spread: 360, speed: 650, colors: GOLD, shape: "spark", delay: 0.25 },
      ];
    }
    if (rank === 2) {
      return [{ x: 0.5, y: -0.05, count: 90, angle: 90, spread: 160, speed: 380, colors: SILVER, delay: 0.3 }];
    }
    if (rank === 3) {
      return FIREWORKS.flatMap((f) => [
        // A bright core ring and a slower trailing ring per firework.
        { x: f.x, y: f.y, count: 70, angle: 0, spread: 360, speed: 760, colors: BRONZE, shape: "spark" as const, delay: f.delay },
        { x: f.x, y: f.y, count: 30, angle: 0, spread: 360, speed: 380, colors: ["#fff1e6", "#ffd9b8"], shape: "spark" as const, delay: f.delay + 0.05 },
      ]);
    }
    return [{ x: 0.5, y: 0.35, count: 26, angle: -90, spread: 120, speed: 420, colors: GOLD, shape: "spark" }];
    // A new celebration id means a new burst, even for the same rank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration.id]);

  const who = playerName ?? teamName;
  const credit = who ? `${who} · +${points}` : `+${points}`;

  return (
    <div key={celebration.id} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-live="assertive">
      <Confetti bursts={bursts} />

      {rank === 1 && (
        <div className="absolute inset-0 flex animate-fx-fade items-center justify-center bg-navy-950/85 backdrop-blur-[3px]">
          <div className="sunburst absolute h-[130vmax] w-[130vmax] animate-sunburst-spin" />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <span className="animate-crown-bob text-6xl drop-shadow-[0_0_20px_rgba(244,196,48,0.9)]" aria-hidden>
              👑
            </span>
            {hero}
            <h2 className="text-metal-gold animate-stamp-in font-display text-6xl tracking-wide drop-shadow-[0_6px_0_rgba(5,11,31,0.9)] sm:text-8xl">
              NUMBER ONE ANSWER
            </h2>
            <p className="animate-rise-in font-heading text-4xl uppercase tracking-widest text-white [animation-delay:350ms] sm:text-5xl">
              {answerText}
            </p>
            <p className="animate-rise-in rounded-full border-2 border-gold-400 bg-navy-950/80 px-5 py-1 font-display text-2xl text-gold-400 [animation-delay:550ms]">
              {credit}
            </p>
          </div>
        </div>
      )}

      {rank === 2 && (
        <div className="absolute inset-0 animate-fx-fade bg-navy-950/45">
          <div className="searchlight left-[8%] animate-beam-left" />
          <div className="searchlight right-[8%] animate-beam-right" />
          {STARS.map(([x, y], i) => (
            <span
              key={i}
              className="absolute animate-twinkle text-3xl text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 6) * 0.18}s` }}
              aria-hidden
            >
              ✦
            </span>
          ))}
          <div className="absolute inset-x-0 top-[30%] flex justify-center">
            <div className="animate-ribbon-in border-y-4 border-silver-300 bg-gradient-to-r from-slate-700 via-slate-500 to-slate-700 px-10 py-4 shadow-[0_0_40px_rgba(203,213,225,0.5)]">
              <div className="flex skew-x-12 items-center gap-5 text-center">
                {hero}
                <div>
                <p className="text-metal-silver font-display text-4xl tracking-wide sm:text-6xl">#2 ANSWER</p>
                <p className="font-heading text-3xl uppercase tracking-widest text-white">{answerText}</p>
                <p className="font-heading text-xl text-silver-300">{credit}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {rank === 3 && (
        <div className="absolute inset-0 flex animate-fx-fade items-center justify-center bg-navy-950/55 pt-[18vh]">
          <div className="flex animate-badge-pop flex-col items-center gap-1 rounded-3xl border-2 border-bronze-400/70 bg-navy-950/90 px-10 pb-5 pt-2 shadow-[0_0_50px_rgba(224,153,94,0.45)] [animation-delay:600ms] [animation-fill-mode:both]">
            <div className="-mt-14 flex h-28 w-28 items-center justify-center rounded-full border-4 border-bronze-300 bg-gradient-to-b from-bronze-300 via-bronze-400 to-bronze-500 shadow-[0_0_40px_rgba(224,153,94,0.7)]">
              <span className="font-display text-5xl text-navy-950">#3</span>
            </div>
            <p className="text-metal-bronze font-display text-4xl tracking-wide">TOP THREE!</p>
            {hero}
            <p className="font-heading text-3xl uppercase tracking-widest text-white">{answerText}</p>
            <p className="font-heading text-xl text-bronze-300">{credit}</p>
          </div>
        </div>
      )}
    </div>
  );
}
