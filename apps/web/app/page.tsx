"use client";

import { useEffect, useState } from "react";
import type { RoomSession } from "@zamily-feud/shared";
import { getSocket } from "../lib/socket";

export default function HomePage() {
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on("ROOM_UPDATED", ({ room }) => setRoom(room));
    socket.on("ERROR", ({ message }) => setError(message));
    return () => {
      socket.off("ROOM_UPDATED");
      socket.off("ERROR");
    };
  }, []);

  function handleCreate() {
    if (!displayName.trim()) return;
    setError(null);
    getSocket().emit("ROOM_CREATE", { displayName }, (result) => {
      if ("code" in result) {
        setError(result.message);
        return;
      }
      setPlayerId(result.playerId);
    });
  }

  function handleJoin() {
    if (!displayName.trim() || !joinCode.trim()) return;
    setError(null);
    getSocket().emit("ROOM_JOIN", { roomCode: joinCode, displayName }, (result) => {
      if ("code" in result) {
        setError(result.message);
        return;
      }
      setPlayerId(result.playerId);
    });
  }

  function toggleReady() {
    if (!room || !playerId) return;
    const ready = !room.players[playerId]?.ready;
    getSocket().emit("PLAYER_READY", { ready });
  }

  if (room && playerId) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-2xl font-bold mb-2">Room {room.roomCode}</h1>
        <p className="mb-6 text-slate-400">Phase: {room.phase}</p>
        <div className="grid grid-cols-2 gap-8">
          {Object.values(room.teams).map((team) => (
            <div key={team.id} className="rounded-lg border border-slate-700 p-4">
              <h2 className="font-semibold mb-2">
                {team.name} — {team.score} pts
              </h2>
              <ul className="space-y-1">
                {team.playerIds.map((id) => {
                  const player = room.players[id];
                  return (
                    <li key={id} className="flex items-center gap-2">
                      <span className={player.connected ? "text-emerald-400" : "text-slate-500"}>●</span>
                      <span>{player.displayName}</span>
                      {player.isHost && <span className="text-xs text-amber-400">HOST</span>}
                      {player.ready && <span className="text-xs text-emerald-400">READY</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <button
          onClick={toggleReady}
          className="mt-6 rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
        >
          {room.players[playerId]?.ready ? "Not ready" : "I'm ready"}
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-bold text-center">Zamily Feud</h1>
        <input
          className="w-full rounded bg-slate-800 px-3 py-2 outline-none"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button
          onClick={handleCreate}
          className="w-full rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
        >
          Create room
        </button>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded bg-slate-800 px-3 py-2 outline-none uppercase"
            placeholder="Room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button onClick={handleJoin} className="rounded bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600">
            Join
          </button>
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    </main>
  );
}
