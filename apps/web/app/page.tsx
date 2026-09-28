"use client";

import { useEffect, useRef, useState } from "react";
import type { HostBoardState, RoomSession } from "@zamily-feud/shared";
import { getSocket } from "../lib/socket";
import JoinScreen from "../components/JoinScreen";
import LobbyScreen from "../components/LobbyScreen";
import RulesModal from "../components/RulesModal";
import CinematicIntro from "../components/CinematicIntro";
import HostGameScreen from "../components/HostGameScreen";
import PlayerGameScreen from "../components/PlayerGameScreen";

const STRIKE_POPUP_MS = 1400;
const CELEBRATE_MS = 900;

export default function HomePage() {
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [hostBoard, setHostBoard] = useState<HostBoardState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showStrike, setShowStrike] = useState(false);
  const [justRevealedIndex, setJustRevealedIndex] = useState<number | null>(null);
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on("ROOM_UPDATED", ({ room }) => setRoom(room));
    socket.on("HOST_BOARD_STATE", ({ board }) => setHostBoard(board));
    socket.on("ERROR", ({ message }) => setError(message));
    socket.on("STRIKE", () => {
      setShowStrike(true);
      setTimeout(() => setShowStrike(false), STRIKE_POPUP_MS);
    });
    socket.on("SLOT_REVEALED", ({ slotIndex }) => {
      setJustRevealedIndex(slotIndex);
      setTimeout(() => setJustRevealedIndex((current) => (current === slotIndex ? null : current)), CELEBRATE_MS);
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
      socket.off("STRIKE");
      socket.off("SLOT_REVEALED");
      socket.off("connect_error");
      socket.io.off("reconnect_failed");
    };
  }, []);

  useEffect(() => {
    if (!room) return;
    if (prevPhase.current === "LOBBY" && room.phase !== "LOBBY") {
      setShowIntro(true);
    }
    prevPhase.current = room.phase;
  }, [room]);

  function ack(result: { ok: true } | { code: string; message: string }) {
    if ("code" in result) setError(result.message);
    else setError(null);
  }

  function handleCreate(displayName: string) {
    setError(null);
    getSocket().emit("ROOM_CREATE", { displayName }, (result) => {
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

  function handleSubmitAnswer(answer: string) {
    setError(null);
    getSocket().emit("SUBMIT_ANSWER", { answer }, ack);
  }

  function handleChoosePlay() {
    setError(null);
    getSocket().emit("CHOOSE_PLAY", {}, ack);
  }

  function handleChoosePass() {
    setError(null);
    getSocket().emit("CHOOSE_PASS", {}, ack);
  }

  const rulesModal = showRules && <RulesModal onClose={() => setShowRules(false)} />;

  if (!room || !playerId) {
    return (
      <>
        <JoinScreen onCreate={handleCreate} onJoin={handleJoin} onOpenRules={() => setShowRules(true)} serverError={error} />
        {rulesModal}
      </>
    );
  }

  if (room.phase === "LOBBY") {
    return (
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
        />
        {rulesModal}
      </>
    );
  }

  if (showIntro) {
    return <CinematicIntro onDone={() => setShowIntro(false)} />;
  }

  const isHost = room.hostId === playerId;

  if (isHost) {
    return (
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
    );
  }

  return (
    <PlayerGameScreen
      room={room}
      selfId={playerId}
      justRevealedIndex={justRevealedIndex}
      showStrike={showStrike}
      error={error}
      onBuzz={handleBuzz}
      onSubmitAnswer={handleSubmitAnswer}
      onChoosePlay={handleChoosePlay}
      onChoosePass={handleChoosePass}
    />
  );
}
