"use client";

import { useState } from "react";
import type { RoomSession } from "@zamily-feud/shared";
import { MAX_PLAYERS_PER_TEAM, TEAM_IDS } from "@zamily-feud/shared";

interface LobbyScreenProps {
  room: RoomSession;
  selfId: string;
  onAutoBalance: () => void;
  onAssign: (playerId: string, teamId: string | null) => void;
  onRenameTeam: (teamId: string, name: string) => void;
  onLockTeams: () => void;
  onToggleReady: () => void;
  onOpenRules: () => void;
  error: string | null;
}

function PlayerChip({
  playerId,
  room,
  isHost,
  onAssign,
  currentColumn,
}: {
  playerId: string;
  room: RoomSession;
  isHost: boolean;
  onAssign: (playerId: string, teamId: string | null) => void;
  currentColumn: string | null;
}) {
  const player = room.players[playerId];
  const destinations: { label: string; teamId: string | null }[] = [
    { label: "Unassigned", teamId: null },
    ...TEAM_IDS.map((id) => ({ label: room.teams[id].name, teamId: id })),
  ].filter((d) => d.teamId !== currentColumn);

  return (
    <div
      draggable={isHost}
      onDragStart={(e) => e.dataTransfer.setData("text/player-id", playerId)}
      className={`rounded-lg border px-3 py-2 ${
        isHost ? "cursor-grab active:cursor-grabbing" : ""
      } ${player.connected ? "border-navy-600 bg-navy-800/80" : "border-navy-700 bg-navy-900/50 opacity-60"}`}
    >
      <div className="flex items-center gap-2">
        <span className={player.connected ? "text-emerald-400" : "text-slate-500"}>●</span>
        <span className="font-heading text-lg leading-none">{player.displayName}</span>
        {player.isHost && <span className="text-[10px] text-gold-400 font-bold">HOST</span>}
        {player.ready && <span className="text-[10px] text-emerald-400 font-bold">READY</span>}
      </div>
      {isHost && (
        <div className="mt-1 flex flex-wrap gap-1">
          {destinations.map((d) => (
            <button
              key={d.label}
              onClick={() => onAssign(playerId, d.teamId)}
              className="rounded bg-navy-700 px-2 py-0.5 text-[11px] hover:bg-navy-600"
            >
              → {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  teamId,
  playerIds,
  capacity,
  room,
  isHost,
  onAssign,
  onDropPlayer,
  editableName,
  onRenameTeam,
}: {
  title: string;
  teamId: string | null;
  playerIds: string[];
  capacity: number | null;
  room: RoomSession;
  isHost: boolean;
  onAssign: (playerId: string, teamId: string | null) => void;
  onDropPlayer: (playerId: string, teamId: string | null) => void;
  editableName?: boolean;
  onRenameTeam?: (name: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const playerId = e.dataTransfer.getData("text/player-id");
        if (playerId) onDropPlayer(playerId, teamId);
      }}
      className={`rounded-xl border-2 p-3 min-h-[220px] transition-colors ${
        dragOver ? "border-gold-400 bg-navy-800/60" : "border-navy-700 bg-navy-900/40"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        {editableName && isHost ? (
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft.trim() && onRenameTeam?.(nameDraft)}
            className="font-heading text-xl bg-transparent border-b border-navy-600 focus:border-gold-500 outline-none"
          />
        ) : (
          <h3 className="font-heading text-xl">{title}</h3>
        )}
        {capacity !== null && (
          <span className="text-xs text-slate-400">
            {playerIds.length}/{capacity}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {playerIds.map((id) => (
          <PlayerChip key={id} playerId={id} room={room} isHost={isHost} onAssign={onAssign} currentColumn={teamId} />
        ))}
        {playerIds.length === 0 && <p className="text-sm text-slate-500 italic">Drop players here</p>}
      </div>
    </div>
  );
}

export default function LobbyScreen({
  room,
  selfId,
  onAutoBalance,
  onAssign,
  onRenameTeam,
  onLockTeams,
  onToggleReady,
  onOpenRules,
  error,
}: LobbyScreenProps) {
  const isHost = room.hostId === selfId;
  const unassignedIds = Object.values(room.players)
    .filter((p) => p.teamId === null)
    .map((p) => p.id);
  const bothTeamsHavePlayers = TEAM_IDS.every((id) => room.teams[id].playerIds.length > 0);
  const self = room.players[selfId];

  return (
    <main className="egg-crate-texture min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl text-gold-500 tracking-wide">ZAMILY FEUD</h1>
            <p className="text-slate-400">
              Room code: <span className="font-heading text-2xl text-white tracking-widest">{room.roomCode}</span>
            </p>
          </div>
          <button onClick={onOpenRules} className="rounded border border-navy-600 px-3 py-1 text-sm hover:border-gold-500">
            How to play
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Column
            title="Unassigned"
            teamId={null}
            playerIds={unassignedIds}
            capacity={null}
            room={room}
            isHost={isHost}
            onAssign={onAssign}
            onDropPlayer={onAssign}
          />
          {TEAM_IDS.map((id) => (
            <Column
              key={id}
              title={room.teams[id].name}
              teamId={id}
              playerIds={room.teams[id].playerIds}
              capacity={MAX_PLAYERS_PER_TEAM}
              room={room}
              isHost={isHost}
              onAssign={onAssign}
              onDropPlayer={onAssign}
              editableName
              onRenameTeam={(name) => onRenameTeam(id, name)}
            />
          ))}
        </div>

        {error && <p className="mt-4 text-center text-red-400 text-sm">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {self && (
            <button
              onClick={onToggleReady}
              className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600"
            >
              {self.ready ? "Not ready" : "I'm ready"}
            </button>
          )}
          {isHost && (
            <>
              <button
                onClick={onAutoBalance}
                className="rounded bg-navy-700 px-4 py-2 font-heading hover:bg-navy-600"
              >
                Auto-Balance Teams
              </button>
              <button
                onClick={onLockTeams}
                disabled={!bothTeamsHavePlayers}
                className="rounded bg-gold-500 px-6 py-2 font-heading text-navy-950 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Lock Teams & Start Game
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
