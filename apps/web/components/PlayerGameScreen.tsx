"use client";

import type { ChatMessage, HostCommentary, RoomSession } from "@zamily-feud/shared";
import StealHuddle from "./StealHuddle";
import AiHostBubble from "./AiHostBubble";
import ChatPanel from "./ChatPanel";
import type { TeamMic } from "../hooks/useTeamMic";
import FlipCard from "./FlipCard";
import GameBoard from "./GameBoard";
import GameHeader from "./GameHeader";
import FinalResults from "./FinalResults";
import TimerBar from "./TimerBar";
import BuzzerButton from "./BuzzerButton";
import AnswerInput from "./AnswerInput";
import SubmissionBannerView from "./SubmissionBannerView";
import StrikePopup from "./StrikePopup";
import { teamTheme } from "../lib/teamTheme";

interface PlayerGameScreenProps {
  room: RoomSession;
  selfId: string;
  justRevealedIndex: number | null;
  showStrike: boolean;
  error: string | null;
  hostLine: HostCommentary | null;
  mic: TeamMic;
  onSendChat: (text: string) => void;
  onBuzz: () => void;
  onSubmitAnswer: (text: string, alternatives: string[]) => void;
  onChoosePlay: () => void;
  onChoosePass: () => void;
  /** The stealing team's private huddle messages (empty for everyone else). */
  teamChat: ChatMessage[];
  onSendTeamChat: (text: string) => void;
  onStealReady: () => void;
  onExit: () => void;
}

export default function PlayerGameScreen({
  room,
  selfId,
  justRevealedIndex,
  showStrike,
  error,
  hostLine,
  mic,
  onSendChat,
  onBuzz,
  onSubmitAnswer,
  onChoosePlay,
  onChoosePass,
  teamChat,
  onSendTeamChat,
  onStealReady,
  onExit,
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
  const gameOver = room.phase === "GAME_RESULT";
  const inHuddle = (room.phase === "STEAL_CONFERENCE" || room.phase === "STEAL_ATTEMPT") && myTeam !== null && myTeam.id === room.controllingTeamId;

  let statusMessage: string | null = null;
  if (room.phase === "FACE_OFF") {
    if (room.currentQuestionId === null) {
      statusMessage = room.hostMode === "AI" ? "The AI host is cueing up the next question…" : "Waiting for the host to start the question…";
    } else if (room.timer.kind === "QUESTION_INTRO") {
      statusMessage = "Read the question… buzzers open in a moment!";
    } else if (room.activePlayerId && room.activePlayerId !== selfId) {
      statusMessage = `${room.players[room.activePlayerId].displayName} is answering…`;
    } else if (room.timer.kind === "BUZZ" && !isCaptain) {
      statusMessage = "Face-off! Waiting for a captain to buzz in…";
    }
  } else if (room.phase === "CONTROL_DECISION" && !canChoose && controllingTeam) {
    statusMessage = `Waiting for ${controllingTeam.name}'s captain to choose Play or Pass…`;
  } else if (room.phase === "PLAYING_BOARD" && !canPlayBoard && controllingTeam) {
    statusMessage = `${controllingTeam.name} is playing the board…`;
  } else if (room.phase === "STEAL_CONFERENCE" && controllingTeam && !inHuddle) {
    statusMessage = `🔒 ${controllingTeam.name} is huddling privately for the steal…`;
  } else if (room.phase === "STEAL_ATTEMPT" && !canSteal && controllingTeam) {
    statusMessage = `${controllingTeam.name} is going for the steal!`;
  } else if (room.phase === "ROUND_RESULT") {
    statusMessage = "Round over! Next question coming up…";
  }

  const myTheme = teamTheme(myTeam?.id);
  const badge = myTeam ? (
    <span className={myTheme.text}>
      {myTeam.name}
      {isCaptain ? " · face-off captain" : ""}
    </span>
  ) : (
    "Spectating"
  );

  return (
    <main className="egg-crate-texture relative min-h-screen overflow-x-hidden">
      <div className="stage-lights animate-spotlight-drift" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-5 p-3 sm:p-6">
        <GameHeader
          room={room}
          badge={badge}
          onExit={onExit}
          exitWarning={myTeam && myTeam.playerIds.length === 1 && !gameOver ? `You're the last one on ${myTeam.name}, so leaving ends the game.` : undefined}
        />

        {room.hostMode === "AI" && <AiHostBubble line={hostLine} />}

        {gameOver ? (
          <FinalResults room={room} selfId={selfId} />
        ) : (
          <GameBoard room={room} idleQuestion="Get ready…">
            {room.board.slots.map((slot, i) => (
              <FlipCard
                key={slot.answerId}
                number={i + 1}
                answer={slot.answerText ?? ""}
                points={slot.points}
                rank={slot.rank}
                revealed={slot.revealed}
                missed={slot.missed}
                celebrate={justRevealedIndex === i}
              />
            ))}
          </GameBoard>
        )}

        {!gameOver && (
          <>
            {/* The huddle panel has its own countdown for the stealing team. */}
            {!inHuddle && <TimerBar
              timer={room.timer}
              label={room.timer.kind === "BUZZ" ? "Buzz in!" : room.timer.kind === "ANSWER" ? "Answer now" : "Steal huddle"}
            />}

            <SubmissionBannerView
              submission={room.lastSubmission}
              teamName={room.lastSubmission ? room.teams[room.lastSubmission.teamId].name : ""}
            />

            {statusMessage && (
              <p key={statusMessage} className="animate-banner-in rounded-full border border-navy-600 bg-navy-950/70 px-4 py-1.5 text-center text-sm text-slate-200">
                {statusMessage}
              </p>
            )}
            {error && <p className="rounded-full bg-red-950/70 px-4 py-1 text-center text-sm text-red-300">{error}</p>}

            <div className="flex w-full flex-col items-center gap-4">
              {inHuddle && (
                <StealHuddle room={room} selfId={selfId} messages={teamChat} onSend={onSendTeamChat} onDone={onStealReady} interim={mic.iHoldMic ? mic.interim : ""} />
              )}
              {canBuzz && <BuzzerButton enabled onBuzz={onBuzz} />}

              {answerEnabled && (
                <AnswerInput enabled placeholder={canSteal ? "Your team's one steal guess…" : undefined} onSubmit={onSubmitAnswer} />
              )}

              {canChoose && (
                <div className="flex animate-slam-in flex-col items-center gap-2">
                  <p className="font-heading tracking-[0.25em] text-gold-400">YOU WON THE FACE-OFF</p>
                  <div className="flex gap-3">
                    <button
                      onClick={onChoosePlay}
                      className="rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 px-8 py-3 font-display text-2xl tracking-wide text-navy-950 shadow-[0_5px_0_#8a6a05] transition hover:brightness-110 active:translate-y-1 active:shadow-[0_1px_0_#8a6a05]"
                    >
                      PLAY
                    </button>
                    <button
                      onClick={onChoosePass}
                      className="rounded-xl bg-gradient-to-b from-navy-600 to-navy-800 px-8 py-3 font-display text-2xl tracking-wide text-white shadow-[0_5px_0_#050b1f] transition hover:brightness-110 active:translate-y-1 active:shadow-[0_1px_0_#050b1f]"
                    >
                      PASS
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {room.hostMode === "AI" && <ChatPanel room={room} selfId={selfId} mic={mic} onSend={onSendChat} />}
      </div>

      <StrikePopup visible={showStrike} />
    </main>
  );
}
