"use client";

import { Children, type ReactNode } from "react";
import { BOARD_SIZE } from "@zamily-feud/shared";
import type { RoomSession } from "@zamily-feud/shared";
import ScoreCounter from "./ScoreCounter";
import { BlankTile } from "./FlipCard";

interface GameBoardProps {
  room: RoomSession;
  /** Placeholder shown in the question card when no question is up. */
  idleQuestion: string;
  /** The answer tiles (FlipCard for players, HostFlipCard for a human host). */
  children: ReactNode;
}

/** The stage: both team scoreboards flanking the marquee-lit oval board with the question, tiles, bank, and strikes. */
export default function GameBoard({ room, idleQuestion, children }: GameBoardProps) {
  const controlling = room.controllingTeamId;
  // During a steal the controlling team is the stealer; the board still shows the three strikes that caused it.
  const stealing = room.phase === "STEAL_CONFERENCE" || room.phase === "STEAL_ATTEMPT";
  const strikes = stealing ? 3 : controlling ? room.teams[controlling].strikes : 0;
  const team = (id: string) => (
    <ScoreCounter
      teamId={id}
      label={room.teams[id].name}
      value={room.teams[id].score}
      active={controlling === id}
      strikes={room.teams[id].strikes}
      members={room.teams[id].playerIds.map((pid) => ({ id: pid, name: room.players[pid]?.displayName ?? "?", captain: pid === room.teams[id].captainId }))}
    />
  );

  return (
    <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="order-2 flex w-full justify-between gap-3 sm:contents">
        <div className="sm:order-1">{team("team-1")}</div>
        <div className="sm:order-3">{team("team-2")}</div>
      </div>

      <div className="marquee-frame order-1 w-full flex-1 rounded-[50%] sm:order-2">
        <div className="board-oval egg-crate-texture relative px-6 pb-10 pt-12 sm:px-14 sm:pb-14 sm:pt-16">
          <div className="mx-auto mb-4 max-w-xl rounded-lg border-2 border-gold-500/70 bg-gradient-to-b from-white to-slate-200 px-4 py-3 text-center shadow-[0_4px_0_#0a1730,0_0_24px_rgba(244,196,48,0.25)]">
            {room.roundNumber > 0 && (
              <span className="mb-1 block font-heading text-xs tracking-[0.3em] text-navy-600">ROUND {room.roundNumber}</span>
            )}
            <p key={room.questionText ?? "idle"} className="animate-banner-in font-heading text-lg leading-tight text-navy-900 sm:text-2xl">
              {room.questionText ?? idleQuestion}
            </p>
          </div>

          <div className="mx-auto grid max-w-xl grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {Children.count(children) > 0
              ? // A fresh question cascades its tiles in one by one.
                Children.map(children, (tile, i) => (
                  <div key={`${room.currentQuestionId}-${i}`} className="animate-rise-in" style={{ animationDelay: `${i * 70}ms` }}>
                    {tile}
                  </div>
                ))
              : Array.from({ length: BOARD_SIZE }, (_, i) => <BlankTile key={i} />)}
          </div>

          <div className="mt-5 flex items-center justify-center gap-5">
            <div className="rounded-xl border-2 border-gold-500 bg-gradient-to-b from-navy-800 to-navy-950 px-5 py-1.5 text-center shadow-[0_0_18px_rgba(244,196,48,0.3)]">
              <span className="block font-heading text-[11px] tracking-[0.3em] text-slate-400">BANK</span>
              <span className="font-display text-3xl tabular-nums text-gold-400">{room.board.currentTotal}</span>
            </div>
            <div className="flex gap-2" aria-label={`${strikes} strikes`}>
              {[0, 1, 2].map((i) => (
                <span
                  key={`${i}-${i < strikes}`}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 font-display text-2xl transition ${
                    i < strikes
                      ? "animate-badge-pop border-red-400 bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_0_16px_rgba(239,68,68,0.8)]"
                      : "border-navy-600 bg-navy-950/60 text-navy-600"
                  }`}
                >
                  ✕
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
