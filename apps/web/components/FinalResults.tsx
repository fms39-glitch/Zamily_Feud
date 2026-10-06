"use client";

import { useMemo } from "react";
import type { RoomSession } from "@zamily-feud/shared";
import { teamTheme } from "../lib/teamTheme";
import Confetti, { FESTIVE, type ConfettiBurst } from "./fx/Confetti";
import Avatar from "./Avatar";

/** End-of-game podium: the winning team rises highest under a trophy and confetti; ties share the top step. */
export default function FinalResults({ room, selfId }: { room: RoomSession; selfId: string | null }) {
  const teams = Object.values(room.teams).sort((a, b) => b.score - a.score);
  const tie = teams.length === 2 && teams[0].score === teams[1].score;
  const winner = tie ? null : teams[0];
  const myTeamId = selfId ? room.players[selfId]?.teamId : null;
  const headline = tie ? "IT'S A TIE!" : myTeamId === winner?.id ? "YOU WIN!" : `${winner?.name.toUpperCase()} WINS!`;

  const bursts = useMemo<ConfettiBurst[]>(
    () => [
      { x: 0.1, y: 1, count: 120, angle: -70, spread: 30, speed: 1350, colors: FESTIVE },
      { x: 0.9, y: 1, count: 120, angle: -110, spread: 30, speed: 1350, colors: FESTIVE },
      { x: 0.5, y: -0.05, count: 80, angle: 90, spread: 170, speed: 300, colors: FESTIVE, delay: 0.8 },
    ],
    [],
  );

  return (
    <section className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-6 py-4 text-center">
      <Confetti bursts={bursts} />
      <span className="animate-crown-bob text-7xl drop-shadow-[0_0_24px_rgba(244,196,48,0.8)]" aria-hidden>
        🏆
      </span>
      <h2 className="text-metal-gold animate-stamp-in font-display text-5xl tracking-wide sm:text-7xl">{headline}</h2>

      <div className="flex items-end justify-center gap-4">
        {teams.map((t, i) => {
          const theme = teamTheme(t.id);
          const top = tie || i === 0;
          return (
            <div key={t.id} className="flex animate-rise-in flex-col items-center gap-2" style={{ animationDelay: `${300 + i * 250}ms` }}>
              <span className="flex -space-x-2">
                {t.playerIds.map((pid) => (
                  <Avatar key={pid} playerId={pid} name={room.players[pid]?.displayName ?? "?"} teamId={t.id} size={top ? "md" : "sm"} />
                ))}
              </span>
              <span className={`font-heading text-xl tracking-widest ${theme.text}`}>{t.name}</span>
              <span className="font-display text-4xl tabular-nums text-gold-400 drop-shadow-[0_0_12px_rgba(244,196,48,0.6)]">{t.score}</span>
              <div
                className={`flex w-32 items-start justify-center rounded-t-xl border-2 border-b-0 pt-3 font-display text-4xl sm:w-40 ${
                  top ? `h-40 ${theme.border} ${theme.glow} bg-gradient-to-b from-gold-500/40 to-navy-900` : "h-24 border-navy-600 bg-gradient-to-b from-navy-700 to-navy-900"
                }`}
              >
                <span className={top ? "text-gold-400" : "text-slate-400"}>{top ? "1" : "2"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-heading tracking-[0.25em] text-slate-400">THANKS FOR PLAYING ZAMILY FEUD</p>
    </section>
  );
}
