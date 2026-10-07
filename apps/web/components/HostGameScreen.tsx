"use client";

import type { HostBoardState, RoomSession } from "@zamily-feud/shared";
import { TEAM_IDS } from "@zamily-feud/shared";
import HostFlipCard from "./HostFlipCard";
import GameBoard from "./GameBoard";
import GameHeader from "./GameHeader";
import FinalResults from "./FinalResults";
import TimerBar from "./TimerBar";
import SubmissionBannerView from "./SubmissionBannerView";
import StrikePopup from "./StrikePopup";

interface HostGameScreenProps {
  room: RoomSession;
  hostBoard: HostBoardState | null;
  showStrike: boolean;
  error: string | null;
  onStartQuestion: () => void;
  onReveal: (slotIndex: number) => void;
  onWrong: () => void;
  onReopenBuzz: () => void;
  onAssignControl: (teamId: string) => void;
  onAdvanceSteal: () => void;
  onNextRound: () => void;
  onEndGame: () => void;
  onExit: () => void;
}

const BTN = "rounded-xl px-5 py-2.5 font-heading text-lg tracking-wide transition hover:brightness-110 active:translate-y-0.5";
const PRIMARY = `${BTN} bg-gradient-to-b from-gold-400 to-gold-600 text-navy-950 shadow-[0_4px_0_#8a6a05] active:shadow-[0_1px_0_#8a6a05]`;
const DANGER = `${BTN} bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_4px_0_#6b0f26] active:shadow-[0_1px_0_#6b0f26]`;
const SECONDARY = `${BTN} bg-gradient-to-b from-navy-600 to-navy-800 text-white shadow-[0_4px_0_#050b1f] active:shadow-[0_1px_0_#050b1f]`;

/** The host manages — never plays. They see every answer blurred and are the only one who can reveal a slot or call a strike. */
export default function HostGameScreen({
  room,
  hostBoard,
  showStrike,
  error,
  onStartQuestion,
  onReveal,
  onWrong,
  onReopenBuzz,
  onAssignControl,
  onAdvanceSteal,
  onNextRound,
  onEndGame,
  onExit,
}: HostGameScreenProps) {
  const suggestedSlot = room.lastSubmission?.suggestion.slotIndex ?? null;
  const buzzerDeadlocked = room.phase === "FACE_OFF" && room.activePlayerId === null && room.timer.kind === null && room.currentQuestionId !== null;
  const canMarkWrong =
    (room.phase === "FACE_OFF" && room.controllingTeamId !== null) || room.phase === "PLAYING_BOARD" || room.phase === "STEAL_ATTEMPT";
  const gameOver = room.phase === "GAME_RESULT";

  return (
    <main className="egg-crate-texture relative min-h-screen overflow-x-hidden">
      <div className="stage-lights animate-spotlight-drift" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-5 p-3 sm:p-6">
        <GameHeader
          room={room}
          badge={<span className="text-gold-400">HOST VIEW · you run the board, you don&apos;t play</span>}
          onExit={onExit}
          exitWarning="You're the host: leaving ends the game for everyone."
        />

        {gameOver ? (
          <FinalResults room={room} selfId={null} />
        ) : (
          <GameBoard room={room} idleQuestion="No question active — start one below">
            {hostBoard?.slots.map((slot, i) => (
              <HostFlipCard
                key={slot.answerId}
                number={i + 1}
                answerText={slot.answerText}
                points={slot.points}
                rank={slot.rank}
                revealed={slot.revealed}
                missed={slot.missed}
                suggested={suggestedSlot === i}
                onReveal={() => onReveal(i)}
              />
            ))}
          </GameBoard>
        )}

        {!gameOver && (
          <>
            <TimerBar
              timer={room.timer}
              label={room.timer.kind === "BUZZ" ? "Buzzer open" : room.timer.kind === "ANSWER" ? "Answer window" : "Steal huddle"}
            />

            <SubmissionBannerView
              submission={room.lastSubmission}
              teamName={room.lastSubmission ? room.teams[room.lastSubmission.teamId].name : ""}
            />
            {room.lastSubmission && (
              <p className="text-xs text-slate-400">
                {suggestedSlot !== null ? "The matcher's guess is outlined in green — click any tile to reveal it, or mark it wrong." : "No close match found — click a tile to reveal, or mark it wrong."}
              </p>
            )}

            {error && <p className="rounded-full bg-red-950/70 px-4 py-1 text-center text-sm text-red-300">{error}</p>}

            <div className="glass flex w-full max-w-3xl flex-wrap items-center justify-center gap-3 rounded-2xl px-4 py-3">
              <span className="w-full text-center font-heading text-xs tracking-[0.3em] text-slate-400">HOST CONTROLS</span>

              {room.currentQuestionId === null && (room.phase === "FACE_OFF" || room.phase === "NEXT_ROUND") && (
                <button onClick={onStartQuestion} className={PRIMARY}>
                  Start Question
                </button>
              )}

              {canMarkWrong && (
                <button onClick={onWrong} className={DANGER}>
                  ✕ Wrong
                </button>
              )}

              {buzzerDeadlocked && (
                <>
                  <button onClick={onReopenBuzz} className={SECONDARY}>
                    Reopen Buzzer
                  </button>
                  {TEAM_IDS.map((id) => (
                    <button key={id} onClick={() => onAssignControl(id)} className={SECONDARY}>
                      Control → {room.teams[id].name}
                    </button>
                  ))}
                </>
              )}

              {room.phase === "CONTROL_DECISION" && room.controllingTeamId && (
                <p className="text-slate-300">
                  Waiting for <span className="text-gold-400">{room.teams[room.controllingTeamId].name}</span>&apos;s captain to choose Play or Pass…
                </p>
              )}

              {room.phase === "STEAL_CONFERENCE" && (
                <button onClick={onAdvanceSteal} className={SECONDARY}>
                  End Huddle — Start Steal
                </button>
              )}

              {room.phase === "ROUND_RESULT" && (
                <>
                  <button onClick={onNextRound} className={PRIMARY}>
                    Next Round
                  </button>
                  <button onClick={onEndGame} className={SECONDARY}>
                    End Game
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <StrikePopup visible={showStrike} />
    </main>
  );
}
