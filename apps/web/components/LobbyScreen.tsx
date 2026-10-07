"use client";

import { useState } from "react";
import type { HostCommentary, RoomSession } from "@zamily-feud/shared";
import { HOST_PERSONAS, MAX_PLAYERS_PER_TEAM, TEAM_IDS } from "@zamily-feud/shared";
import ChatPanel from "./ChatPanel";
import { teamTheme } from "../lib/teamTheme";
import Avatar from "./Avatar";
import AvatarPicker from "./AvatarPicker";
import AiHostBubble from "./AiHostBubble";
import ExitButton from "./ExitButton";
import type { TeamMic } from "../hooks/useTeamMic";

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
  mic: TeamMic;
  onSendChat: (text: string) => void;
  onSetAvatar: (image: string | null) => void;
  hostLine: HostCommentary | null;
  onExit: () => void;
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
  const destinations: { label: string; teamId: string | null }[] = player.isHost
    ? []
    : [
        { label: "Unassigned", teamId: null },
        ...TEAM_IDS.map((id) => ({ label: room.teams[id].name, teamId: id })),
      ].filter((d) => d.teamId !== currentColumn);

  return (
    <div
      draggable={isHost && !player.isHost}
      onDragStart={(e) => e.dataTransfer.setData("text/player-id", playerId)}
      className={`rounded-lg border px-3 py-2 ${
        isHost ? "cursor-grab active:cursor-grabbing" : ""
      } ${player.connected ? "border-navy-600 bg-navy-800/80" : "border-navy-700 bg-navy-900/50 opacity-60"}`}
    >
      <div className="flex items-center gap-2">
        <span className="relative">
          <Avatar playerId={player.id} name={player.displayName} teamId={player.teamId} size="sm" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-navy-900 ${player.connected ? "bg-emerald-400" : "bg-slate-500"}`} />
        </span>
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
      className={`min-h-[220px] rounded-2xl border-2 p-3 backdrop-blur-sm transition-all duration-300 ${
        dragOver
          ? "scale-[1.02] border-gold-400 bg-navy-800/70 shadow-[0_0_30px_rgba(244,196,48,0.35)]"
          : teamId
            ? `${teamTheme(teamId).border} border-opacity-60 bg-navy-900/60`
            : "border-dashed border-navy-600 bg-navy-900/40"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        {editableName && isHost ? (
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft.trim() && onRenameTeam?.(nameDraft)}
            className={`min-w-0 border-b border-navy-600 bg-transparent font-heading text-xl tracking-wide outline-none focus:border-gold-500 ${teamId ? teamTheme(teamId).text : ""}`}
          />
        ) : (
          <h3 className={`font-heading text-xl tracking-wide ${teamId ? teamTheme(teamId).text : "text-slate-300"}`}>{title}</h3>
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
  mic,
  onSendChat,
  onSetAvatar,
  hostLine,
  onExit,
}: LobbyScreenProps) {
  // The room creator manages teams in both modes; only a human host sits out of the teams.
  const isHost = room.ownerId === selfId;
  const isHumanHost = room.hostId === selfId;
  const unassignedIds = Object.values(room.players)
    .filter((p) => p.teamId === null)
    .map((p) => p.id);
  const bothTeamsHavePlayers = TEAM_IDS.every((id) => room.teams[id].playerIds.length > 0);
  const self = room.players[selfId];

  return (
    <main className="egg-crate-texture relative min-h-screen overflow-x-hidden p-4 sm:p-6">
      <div className="stage-lights animate-spotlight-drift" aria-hidden />
      <div className="relative z-10 mx-auto max-w-4xl animate-rise-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-metal-gold font-display text-4xl tracking-wide">ZAMILY FEUD</h1>
            <p className="text-slate-400">
              Room code:{" "}
              <span className="rounded-lg border border-gold-500/50 bg-navy-950/70 px-2 font-heading text-2xl tracking-[0.3em] text-white">{room.roomCode}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onOpenRules} className="rounded border border-navy-600 px-3 py-1 text-sm hover:border-gold-500">
              How to play
            </button>
            <ExitButton onConfirm={onExit} warning={isHumanHost ? "You're the host: leaving closes the room for everyone." : undefined} />
          </div>
        </div>

        {room.hostMode === "AI" && (
          <div className="mb-4 flex justify-center">
            <AiHostBubble line={hostLine} />
          </div>
        )}

        {room.hostMode === "AI" && (
          <div className="mb-4 rounded-lg border border-gold-500/60 bg-navy-900/70 px-4 py-2 text-sm text-slate-300">
            <span className="font-heading tracking-widest text-gold-400">AI HOST</span> — an AI runs this game: questions, judging,
            strikes, and the jokes ({HOST_PERSONAS.find((p) => p.id === room.hostPersona)?.label ?? "Family friendly"} style).
            Everyone, including the room creator, plays on a team. Chat with the host below, or grab your team&apos;s mic once you&apos;re on a team.
          </div>
        )}

        {self && (
          <div className="mb-4 flex justify-center">
            <AvatarPicker playerId={self.id} name={self.displayName} teamId={self.teamId} hasAvatar={self.hasAvatar} onSet={onSetAvatar} />
          </div>
        )}

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
          {self && !isHumanHost && (
            <button
              onClick={onToggleReady}
              className="rounded-xl bg-gradient-to-b from-navy-600 to-navy-800 font-heading shadow-[0_4px_0_#050b1f] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#050b1f] px-5 py-2"
            >
              {self.ready ? "Not ready" : "I'm ready"}
            </button>
          )}
          {isHost && (
            <>
              <button
                onClick={onAutoBalance}
                className="rounded-xl bg-gradient-to-b from-navy-600 to-navy-800 font-heading shadow-[0_4px_0_#050b1f] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#050b1f] px-5 py-2"
              >
                Auto-Balance Teams
              </button>
              <button
                onClick={onLockTeams}
                disabled={!bothTeamsHavePlayers}
                className="rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 font-heading text-navy-950 shadow-[0_4px_0_#8a6a05] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#8a6a05] px-7 py-2 text-lg tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
              >
                Lock Teams & Start Game
              </button>
            </>
          )}
        </div>

        {room.hostMode === "AI" && (
          <div className="mt-6 flex justify-center">
            <ChatPanel room={room} selfId={selfId} mic={mic} onSend={onSendChat} />
          </div>
        )}
      </div>
    </main>
  );
}
