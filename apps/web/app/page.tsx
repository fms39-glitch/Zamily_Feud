"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomSession } from "@zamily-feud/shared";
import { TEAM_IDS } from "@zamily-feud/shared";
import { getSocket } from "../lib/socket";
import JoinScreen from "../components/JoinScreen";
import LobbyScreen from "../components/LobbyScreen";
import RulesModal from "../components/RulesModal";
import CinematicIntro from "../components/CinematicIntro";
import GameBoardPreview from "../components/GameBoardPreview";

function WaitingRoom({ room, onViewBoard }: { room: RoomSession; onViewBoard: () => void }) {
  return (
    <main className="egg-crate-texture min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="font-display text-4xl text-gold-500 tracking-wide">Teams locked!</h1>
      <div className="flex gap-8">
        {TEAM_IDS.map((id) => (
          <div key={id} className="rounded-lg border border-navy-600 bg-navy-900/60 p-4">
            <h2 className="font-heading text-xl mb-2">{room.teams[id].name}</h2>
            <ul>
              {room.teams[id].playerIds.map((pid) => (
                <li key={pid}>{room.players[pid].displayName}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button onClick={onViewBoard} className="rounded bg-gold-500 px-6 py-2 font-heading text-navy-950 hover:bg-gold-400">
        View board
      </button>
    </main>
  );
}

export default function HomePage() {
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on("ROOM_UPDATED", ({ room }) => setRoom(room));
    socket.on("ERROR", ({ message }) => setError(message));
    return () => {
      socket.off("ROOM_UPDATED");
      socket.off("ERROR");
    };
  }, []);

  useEffect(() => {
    if (!room) return;
    if (prevPhase.current === "LOBBY" && room.phase !== "LOBBY") {
      setShowIntro(true);
    }
    prevPhase.current = room.phase;
  }, [room]);

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
    getSocket().emit("TEAM_AUTO_BALANCE", {}, (result) => {
      if ("code" in result) setError(result.message);
    });
  }

  function handleAssign(targetPlayerId: string, teamId: string | null) {
    setError(null);
    getSocket().emit("TEAM_ASSIGN", { playerId: targetPlayerId, teamId }, (result) => {
      if ("code" in result) setError(result.message);
    });
  }

  function handleRenameTeam(teamId: string, name: string) {
    setError(null);
    getSocket().emit("TEAM_RENAME", { teamId, name }, (result) => {
      if ("code" in result) setError(result.message);
    });
  }

  function handleLockTeams() {
    setError(null);
    getSocket().emit("LOCK_TEAMS", {}, (result) => {
      if ("code" in result) setError(result.message);
    });
  }

  function handleToggleReady() {
    if (!room || !playerId) return;
    const ready = !room.players[playerId]?.ready;
    getSocket().emit("PLAYER_READY", { ready });
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
    return <CinematicIntro onDone={() => { setShowIntro(false); setShowBoard(true); }} />;
  }

  if (showBoard) {
    return (
      <GameBoardPreview
        team1Name={room.teams["team-1"].name}
        team2Name={room.teams["team-2"].name}
        onExit={() => setShowBoard(false)}
      />
    );
  }

  return <WaitingRoom room={room} onViewBoard={() => setShowBoard(true)} />;
}
