"use client";

import type { RoomSession } from "@zamily-feud/shared";
import FlipCard from "./FlipCard";
import ScoreCounter from "./ScoreCounter";
import TimerBar from "./TimerBar";
import BuzzerButton from "./BuzzerButton";
import AnswerInput from "./AnswerInput";
import SubmissionBannerView from "./SubmissionBannerView";
import StrikePopup from "./StrikePopup";

interface PlayerGameScreenProps {
  room: RoomSession;
  selfId: string;
  justRevealedIndex: number | null;
  showStrike: boolean;
  error: string | null;
  onBuzz: () => void;
  onSubmitAnswer: (text: string) => void;
  onChoosePlay: () => void;
  onChoosePass: () => void;
}

export default function PlayerGameScreen({
  room,
  selfId,
  justRevealedIndex,
  showStrike,
  error,
  onBuzz,
  onSubmitAnswer,
  onChoosePlay,
  onChoosePass,
}: PlayerGameScreenProps) {
  const self = room.players[selfId];
  const myTeam = self.teamId ? room.teams[self.teamId] : null;
  const isCaptain = myTeam?.captainId === selfId;
  const controllingTeam = room.controllingTeamId ? room.teams[room.controllingTeamId] : null;

  const canBuzz = room.phase === "FACE_OFF" && room.timer.kind === "BUZZ" && Boolean(isCaptain);
  const canAnswerFaceOff = room.phase === "FACE_OFF" && room.activePlayerId === selfId && room.timer.kind === "ANSWER";
  const canPlayBoard = room.phase === "PLAYING_BOARD" && myTeam?.id === room.controllingTeamId;
  const canSteal = room.phase === "STEAL_ATTEMPT" && myTeam?.id === room.controllingTeamId;
  const canChoose = room.phase === "CONTROL_DECISION" && Boolean(isCaptain) && myTeam?.id === room.controllingTeamId;
  const answerEnabled = canAnswerFaceOff || canPlayBoard || canSteal;

  let statusMessage: string | null = null;
  if (room.phase === "FACE_OFF") {
    if (room.currentQuestionId === null) {
      statusMessage = "Waiting for the host to start the question…";
    } else if (room.activePlayerId && room.activePlayerId !== selfId) {
      statusMessage = `${room.players[room.activePlayerId].displayName} is answering…`;
    } else if (room.timer.kind === "BUZZ" && !isCaptain) {
      statusMessage = "Waiting for a face-off captain to buzz in…";
    }
  } else if (room.phase === "CONTROL_DECISION" && !canChoose && controllingTeam) {
    statusMessage = `Waiting for ${controllingTeam.name}'s captain to choose Play or Pass…`;
  } else if (room.phase === "PLAYING_BOARD" && !canPlayBoard && controllingTeam) {
    statusMessage = `${controllingTeam.name} is playing the board…`;
  } else if (room.phase === "STEAL_CONFERENCE" && controllingTeam) {
    statusMessage = `${controllingTeam.name} is conferring for the steal…`;
  } else if (room.phase === "STEAL_ATTEMPT" && !canSteal && controllingTeam) {
    statusMessage = `${controllingTeam.name} is attempting to steal!`;
  } else if (room.phase === "ROUND_RESULT") {
    statusMessage = "Round over — waiting for the host to continue…";
  }

  return (
    <main className="egg-crate-texture min-h-screen p-4 sm:p-8 flex flex-col items-center gap-6">
      <div className="w-full max-w-4xl flex items-center justify-between">
        <span className="font-heading text-sm text-slate-400">
          {myTeam ? `${myTeam.name}${isCaptain ? " — you're the face-off captain" : ""}` : "Spectating"}
        </span>
        <span className="font-heading text-sm text-slate-400">
          Room code: <span className="text-gold-400 tracking-widest">{room.roomCode}</span>
        </span>
      </div>

      <div className="flex w-full max-w-5xl items-center justify-center gap-4">
        <ScoreCounter label={room.teams["team-1"].name} value={room.teams["team-1"].score} />

        <div className="board-oval egg-crate-texture relative flex-1 px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto mb-4 max-w-xl rounded-md bg-slate-100 px-4 py-3 text-center">
            <p className="font-heading text-lg text-navy-900">{room.questionText ?? "Get ready…"}</p>
          </div>

          <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
            {room.board.slots.map((slot, i) => (
              <FlipCard
                key={slot.answerId}
                number={i + 1}
                answer={slot.answerText ?? ""}
                points={slot.points}
                revealed={slot.revealed}
                celebrate={justRevealedIndex === i}
              />
            ))}
          </div>

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
        label={room.timer.kind === "BUZZ" ? "Buzz in!" : room.timer.kind === "ANSWER" ? "Your answer" : "Steal conference"}
      />

      <SubmissionBannerView
        submission={room.lastSubmission}
        teamName={room.lastSubmission ? room.teams[room.lastSubmission.teamId].name : ""}
      />

      {statusMessage && <p className="text-center text-slate-300">{statusMessage}</p>}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <div className="flex flex-col items-center gap-4">
        {canBuzz && <BuzzerButton enabled onBuzz={onBuzz} />}

        {answerEnabled && (
          <AnswerInput
            enabled
            placeholder={canSteal ? "Your team's one steal guess…" : "Type your answer…"}
            onSubmit={onSubmitAnswer}
          />
        )}

        {canChoose && (
          <div className="flex gap-3">
            <button onClick={onChoosePlay} className="rounded bg-gold-500 px-6 py-2 font-heading text-navy-950 hover:bg-gold-400">
              Play
            </button>
            <button onClick={onChoosePass} className="rounded bg-navy-700 px-6 py-2 font-heading hover:bg-navy-600">
              Pass
            </button>
          </div>
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
