"use client";

import type { HostBoardState, RoomSession } from "@zamily-feud/shared";
import { TEAM_IDS } from "@zamily-feud/shared";
import HostFlipCard from "./HostFlipCard";
import ScoreCounter from "./ScoreCounter";
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
}

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
}: HostGameScreenProps) {
  const suggestedSlot = room.lastSubmission?.suggestion.slotIndex ?? null;
  const buzzerDeadlocked = room.phase === "FACE_OFF" && room.activePlayerId === null && room.timer.kind === null && room.currentQuestionId !== null;
  const canMarkWrong =
    (room.phase === "FACE_OFF" && room.controllingTeamId !== null) ||
    room.phase === "PLAYING_BOARD" ||
    room.phase === "STEAL_ATTEMPT";

  return (
    <main className="egg-crate-texture min-h-screen p-4 sm:p-8 flex flex-col items-center gap-6">
      <div className="w-full max-w-4xl flex items-center justify-between">
        <span className="rounded bg-navy-800 px-3 py-1 text-xs text-gold-400 border border-gold-500">
          HOST VIEW — you manage the game, you don't play
        </span>
        <span className="font-heading text-sm text-slate-400">
          Room code: <span className="text-gold-400 tracking-widest">{room.roomCode}</span>
        </span>
      </div>

      <div className="flex w-full max-w-5xl items-center justify-center gap-4">
        <ScoreCounter label={room.teams["team-1"].name} value={room.teams["team-1"].score} />

        <div className="board-oval egg-crate-texture relative flex-1 px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto mb-4 max-w-xl rounded-md bg-slate-100 px-4 py-3 text-center">
            <p className="font-heading text-lg text-navy-900">
              {room.questionText ?? "No question active — start one below"}
            </p>
          </div>

          {hostBoard && (
            <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
              {hostBoard.slots.map((slot, i) => (
                <HostFlipCard
                  key={slot.answerId}
                  number={i + 1}
                  answerText={slot.answerText}
                  points={slot.points}
                  revealed={slot.revealed}
                  suggested={suggestedSlot === i}
                  onReveal={() => onReveal(i)}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="rounded-lg border-2 border-gold-500 bg-navy-950 px-5 py-2 text-center">
              <span className="block text-xs text-slate-400">BOARD</span>
              <span className="font-display text-3xl text-gold-400">{room.board.currentTotal}</span>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => {
                const strikes = room.controllingTeamId ? room.teams[room.controllingTeamId].strikes : 0;
                return (
                  <span
                    key={i}
                    className={`flex h-9 w-9 items-center justify-center rounded border-2 font-display text-xl ${
                      i < strikes ? "border-red-500 bg-red-600 text-white" : "border-navy-600 text-navy-600"
                    }`}
                  >
                    X
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <ScoreCounter label={room.teams["team-2"].name} value={room.teams["team-2"].score} />
      </div>

      <TimerBar
        timer={room.timer}
        label={room.timer.kind === "BUZZ" ? "Buzzer open" : room.timer.kind === "ANSWER" ? "Answer window" : "Steal conference"}
      />

      <SubmissionBannerView
        submission={room.lastSubmission}
        teamName={room.lastSubmission ? room.teams[room.lastSubmission.teamId].name : ""}
      />

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {room.currentQuestionId === null && (room.phase === "FACE_OFF" || room.phase === "NEXT_ROUND") && (
          <button onClick={onStartQuestion} className="rounded bg-gold-500 px-6 py-2 font-heading text-navy-950 hover:bg-gold-400">
            Start Question
          </button>
        )}

        {canMarkWrong && (
          <button onClick={onWrong} className="rounded bg-red-600 px-4 py-2 font-heading hover:bg-red-500">
            Wrong ✗
          </button>
        )}

        {buzzerDeadlocked && (
          <>
            <button onClick={onReopenBuzz} className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600">
              Reopen Buzzer
            </button>
            {TEAM_IDS.map((id) => (
              <button
                key={id}
                onClick={() => onAssignControl(id)}
                className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600"
              >
                Award control to {room.teams[id].name}
              </button>
            ))}
          </>
        )}

        {room.phase === "CONTROL_DECISION" && room.controllingTeamId && (
          <p className="text-slate-300">
            Waiting for <span className="text-gold-400">{room.teams[room.controllingTeamId].name}</span>'s captain to choose Play or Pass…
          </p>
        )}

        {room.phase === "STEAL_CONFERENCE" && (
          <button onClick={onAdvanceSteal} className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600">
            End Conference — Start Steal Attempt
          </button>
        )}

        {room.phase === "ROUND_RESULT" && (
          <>
            <button onClick={onNextRound} className="rounded bg-gold-500 px-6 py-2 font-heading text-navy-950 hover:bg-gold-400">
              Next Round
            </button>
            <button onClick={onEndGame} className="rounded border border-navy-600 px-4 py-2 font-heading hover:border-gold-500">
              End Game
            </button>
          </>
        )}
      </div>

      {room.phase === "GAME_RESULT" && (
        <div className="text-center">
          <h2 className="font-display text-3xl text-gold-500">Final Score</h2>
          <p className="mt-2 text-xl">
            {room.teams["team-1"].name}: {room.teams["team-1"].score} — {room.teams["team-2"].name}: {room.teams["team-2"].score}
          </p>
        </div>
      )}

      <StrikePopup visible={showStrike} />
    </main>
  );
}
