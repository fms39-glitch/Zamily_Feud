"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgeCategory, ChatMessage, HostBoardState, HostCommentary, HostMode, RoomSession } from "@zamily-feud/shared";
import { getSocket } from "../lib/socket";
import { useTeamMic } from "../hooks/useTeamMic";
import JoinScreen from "../components/JoinScreen";
import LobbyScreen from "../components/LobbyScreen";
import RulesModal from "../components/RulesModal";
import CinematicIntro from "../components/CinematicIntro";
import HostGameScreen from "../components/HostGameScreen";
import PlayerGameScreen from "../components/PlayerGameScreen";
import RevealCelebration, { type Celebration } from "../components/fx/RevealCelebration";
import EventBanner, { type Banner } from "../components/fx/EventBanner";
import RoundIntro from "../components/fx/RoundIntro";
import { AvatarContext } from "../components/Avatar";
import { sfx } from "../lib/sfx";
import { teamTheme } from "../lib/teamTheme";

const STRIKE_POPUP_MS = 1400;
const CELEBRATE_MS = 900;
/** How long each reveal celebration stays up, by rank (the #1 jackpot gets the longest beat). */
const CELEBRATION_MS: Record<number, number> = { 1: 3400, 2: 3000, 3: 3000 };
const BANNER_MS = 2600;

export default function HomePage() {
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [hostBoard, setHostBoard] = useState<HostBoardState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showStrike, setShowStrike] = useState(false);
  const [justRevealedIndex, setJustRevealedIndex] = useState<number | null>(null);
  const [hostLine, setHostLine] = useState<HostCommentary | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [teamChat, setTeamChat] = useState<ChatMessage[]>([]);
  const prevTimerKind = useRef<string | null>(null);
  const prevQuestionId = useRef<string | null>(null);
  const prevPhase = useRef<string | null>(null);
  const prevScores = useRef<Record<string, number>>({});
  const roomRef = useRef<RoomSession | null>(null);
  roomRef.current = room;
  // Lives at page level so live mic audio survives the lobby -> game screen switch.
  const mic = useTeamMic(room, playerId);

  useEffect(() => {
    const socket = getSocket();
    socket.on("ROOM_UPDATED", ({ room }) => setRoom(room));
    socket.on("HOST_BOARD_STATE", ({ board }) => setHostBoard(board));
    socket.on("ERROR", ({ message }) => setError(message));
    socket.on("HOST_COMMENTARY", (line) => setHostLine(line));
    socket.on("PLAYER_AVATARS", ({ avatars }) => setAvatars(avatars));
    socket.on("TEAM_CHAT_MESSAGE", (m) => setTeamChat((prev) => [...prev, m]));
    socket.on("STRIKE", () => {
      sfx.buzzer();
      setShowStrike(true);
      setTimeout(() => setShowStrike(false), STRIKE_POPUP_MS);
    });
    socket.on("SLOT_REVEALED", ({ slotIndex, rank, answerText, points, teamId, playerId: answeredBy }) => {
      setJustRevealedIndex(slotIndex);
      setTimeout(() => setJustRevealedIndex((current) => (current === slotIndex ? null : current)), CELEBRATE_MS);
      // Each of the top three answers gets its own show; everything else gets a ding and a sparkle.
      if (rank === 1) sfx.fanfare();
      else if (rank === 2) sfx.shimmer();
      else if (rank === 3) sfx.pops();
      else sfx.ding();
      const id = Date.now();
      const teamName = teamId ? roomRef.current?.teams[teamId]?.name ?? null : null;
      const playerName = answeredBy ? roomRef.current?.players[answeredBy]?.displayName ?? null : null;
      setCelebration({ id, rank, answerText, points, teamName, playerId: answeredBy, playerName, teamId });
      setTimeout(() => setCelebration((c) => (c?.id === id ? null : c)), CELEBRATION_MS[rank] ?? 1500);
    });
    socket.on("BUZZ_LOCKED", ({ playerId: buzzerId, teamId }) => {
      sfx.buzzIn();
      const name = roomRef.current?.players[buzzerId]?.displayName ?? "Someone";
      showBanner({
        title: `${name.toUpperCase()} BUZZED IN!`,
        subtitle: roomRef.current?.teams[teamId]?.name,
        tone: teamTheme(teamId).tone,
        playerId: buzzerId,
        playerName: name,
        teamId,
      });
    });
    socket.on("connect_error", (err) => {
      setError(`Can't reach the game server (${err.message}). Is it running?`);
    });
    socket.io.on("reconnect_failed", () => {
      setError("Lost connection to the game server.");
    });
    return () => {
      socket.off("ROOM_UPDATED");
      socket.off("HOST_BOARD_STATE");
      socket.off("ERROR");
      socket.off("HOST_COMMENTARY");
      socket.off("PLAYER_AVATARS");
      socket.off("TEAM_CHAT_MESSAGE");
      socket.off("STRIKE");
      socket.off("SLOT_REVEALED");
      socket.off("BUZZ_LOCKED");
      socket.off("connect_error");
      socket.io.off("reconnect_failed");
    };
  }, []);

  function showBanner(b: Omit<Banner, "id">) {
    const id = Date.now();
    setBanner({ ...b, id });
    setTimeout(() => setBanner((cur) => (cur?.id === id ? null : cur)), BANNER_MS);
  }

  // Phase-change moments: the intro, steals, round results, and the final whistle.
  useEffect(() => {
    if (!room) return;
    const was = prevPhase.current;
    if (was === "LOBBY" && room.phase !== "LOBBY") {
      setShowIntro(true);
    }
    if (was !== null && was !== room.phase) {
      if (room.phase === "STEAL_CONFERENCE" && room.controllingTeamId) {
        sfx.steal();
        showBanner({
          title: "STEAL!",
          subtitle: `${room.teams[room.controllingTeamId].name} gets one guess for ${room.board.currentTotal} points`,
          tone: "red",
        });
      } else if (room.phase === "ROUND_RESULT") {
        const winner = Object.values(room.teams).find((t) => t.score > (prevScores.current[t.id] ?? t.score));
        if (winner) {
          sfx.roundWin();
          showBanner({
            title: `ROUND TO ${winner.name.toUpperCase()}`,
            subtitle: `+${winner.score - (prevScores.current[winner.id] ?? 0)} points`,
            tone: teamTheme(winner.id).tone,
          });
        } else {
          showBanner({ title: "NO POINTS THIS ROUND", tone: "gold" });
        }
      } else if (room.phase === "GAME_RESULT") {
        sfx.fanfare();
      }
    }
    // The question intro just ended: the buzzer is live.
    if (prevTimerKind.current === "QUESTION_INTRO" && room.timer.kind === "BUZZ") {
      sfx.go();
      showBanner({ title: "BUZZERS OPEN!", subtitle: "Captains, hit it!", tone: "gold" });
    }
    prevTimerKind.current = room.timer.kind;
    // A new question wipes the previous steal huddle's private messages.
    if (room.currentQuestionId !== prevQuestionId.current) {
      prevQuestionId.current = room.currentQuestionId;
      setTeamChat([]);
    }
    // Scores at the start of each round, so a round result can show what was banked.
    if (room.phase !== "ROUND_RESULT") {
      prevScores.current = Object.fromEntries(Object.values(room.teams).map((t) => [t.id, t.score]));
    }
    prevPhase.current = room.phase;
  }, [room]);

  function ack(result: { ok: true } | { code: string; message: string }) {
    if ("code" in result) setError(result.message);
    else setError(null);
  }

  function handleCreate(displayName: string, hostMode: HostMode, hostPersona: AgeCategory) {
    setError(null);
    getSocket().emit("ROOM_CREATE", { displayName, hostMode, hostPersona }, (result) => {
      if ("code" in result) {
        setError(result.message);
        return;
      }
      setPlayerId(result.playerId);
    });
  }

  function handleJoin(displayName: string, roomCode: string) {
    setError(null);
    getSocket().emit("ROOM_JOIN", { roomCode, displayName }, (result) => {
      if ("code" in result) {
        setError(result.message);
        return;
      }
      setPlayerId(result.playerId);
    });
  }

  function handleAutoBalance() {
    setError(null);
    getSocket().emit("TEAM_AUTO_BALANCE", {}, ack);
  }

  function handleAssign(targetPlayerId: string, teamId: string | null) {
    setError(null);
    getSocket().emit("TEAM_ASSIGN", { playerId: targetPlayerId, teamId }, ack);
  }

  function handleRenameTeam(teamId: string, name: string) {
    setError(null);
    getSocket().emit("TEAM_RENAME", { teamId, name }, ack);
  }

  function handleLockTeams() {
    setError(null);
    getSocket().emit("LOCK_TEAMS", {}, ack);
  }

  function handleToggleReady() {
    if (!room || !playerId) return;
    const ready = !room.players[playerId]?.ready;
    getSocket().emit("PLAYER_READY", { ready });
  }

  function handleStartQuestion() {
    setError(null);
    getSocket().emit("HOST_START_QUESTION", {}, ack);
  }

  function handleReveal(slotIndex: number) {
    setError(null);
    getSocket().emit("HOST_REVEAL", { slotIndex }, ack);
  }

  function handleWrong() {
    setError(null);
    getSocket().emit("HOST_WRONG", {}, ack);
  }

  function handleReopenBuzz() {
    setError(null);
    getSocket().emit("HOST_REOPEN_BUZZ", {}, ack);
  }

  function handleAssignControl(teamId: string) {
    setError(null);
    getSocket().emit("HOST_ASSIGN_CONTROL", { teamId }, ack);
  }

  function handleAdvanceSteal() {
    setError(null);
    getSocket().emit("HOST_ADVANCE_STEAL", {}, ack);
  }

  function handleNextRound() {
    setError(null);
    getSocket().emit("HOST_NEXT_ROUND", {}, ack);
  }

  function handleEndGame() {
    setError(null);
    getSocket().emit("HOST_END_GAME", {}, ack);
  }

  function handleBuzz() {
    setError(null);
    getSocket().emit("BUZZ", { clientTimestamp: Date.now() }, ack);
  }

  function handleSubmitAnswer(answer: string, alternatives: string[]) {
    setError(null);
    getSocket().emit("SUBMIT_ANSWER", { answer, alternatives }, ack);
  }

  function handleSendChat(text: string) {
    setError(null);
    getSocket().emit("CHAT_SEND", { text, via: "TEXT" }, ack);
  }

  function handleSetAvatar(image: string | null) {
    setError(null);
    getSocket().emit("PLAYER_SET_AVATAR", { image }, ack);
  }

  function handleStealReady() {
    setError(null);
    getSocket().emit("STEAL_READY", {}, ack);
  }

  function handleSendTeamChat(text: string) {
    setError(null);
    getSocket().emit("TEAM_CHAT_SEND", { text, via: "TEXT" }, ack);
  }

  function handleChoosePlay() {
    setError(null);
    getSocket().emit("CHOOSE_PLAY", {}, ack);
  }

  function handleChoosePass() {
    setError(null);
    getSocket().emit("CHOOSE_PASS", {}, ack);
  }

  // Everyone's pictures, available to any component via <Avatar>.
  const provide = (node: ReactNode) => <AvatarContext.Provider value={avatars}>{node}</AvatarContext.Provider>;

  const rulesModal = showRules && <RulesModal onClose={() => setShowRules(false)} />;

  if (!room || !playerId) {
    return provide(
      <>
        <JoinScreen onCreate={handleCreate} onJoin={handleJoin} onOpenRules={() => setShowRules(true)} serverError={error} />
        {rulesModal}
      </>
    );
  }

  if (room.phase === "LOBBY") {
    return provide(
      <>
        <LobbyScreen
          room={room}
          selfId={playerId}
          onAutoBalance={handleAutoBalance}
          onAssign={handleAssign}
          onRenameTeam={handleRenameTeam}
          onLockTeams={handleLockTeams}
          onToggleReady={handleToggleReady}
          onOpenRules={() => setShowRules(true)}
          error={error}
          mic={mic}
          onSendChat={handleSendChat}
          onSetAvatar={handleSetAvatar}
        />
        {rulesModal}
      </>
    );
  }

  if (showIntro) {
    return <CinematicIntro onDone={() => setShowIntro(false)} />;
  }

  const isHost = room.hostId === playerId;
  const fx = (
    <>
      {celebration && <RevealCelebration celebration={celebration} />}
      {banner && <EventBanner banner={banner} />}
      <RoundIntro room={room} />
    </>
  );

  if (isHost) {
    return provide(
      <>
        <HostGameScreen
          room={room}
          hostBoard={hostBoard}
          showStrike={showStrike}
          error={error}
          onStartQuestion={handleStartQuestion}
          onReveal={handleReveal}
          onWrong={handleWrong}
          onReopenBuzz={handleReopenBuzz}
          onAssignControl={handleAssignControl}
          onAdvanceSteal={handleAdvanceSteal}
          onNextRound={handleNextRound}
          onEndGame={handleEndGame}
        />
        {fx}
      </>
    );
  }

  return provide(
    <>
      <PlayerGameScreen
        room={room}
        selfId={playerId}
        justRevealedIndex={justRevealedIndex}
        showStrike={showStrike}
        error={error}
        hostLine={hostLine}
        mic={mic}
        onSendChat={handleSendChat}
        onBuzz={handleBuzz}
        onSubmitAnswer={handleSubmitAnswer}
        onChoosePlay={handleChoosePlay}
        onChoosePass={handleChoosePass}
        teamChat={teamChat}
        onSendTeamChat={handleSendTeamChat}
        onStealReady={handleStealReady}
      />
      {fx}
    </>
  );
}
