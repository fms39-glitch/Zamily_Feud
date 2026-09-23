import { randomUUID } from "node:crypto";
import { MAX_PLAYERS_PER_TEAM, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TEAM_IDS } from "@zamily-feud/shared";
import type { PlayerState, RoomSession, TeamState } from "@zamily-feud/shared";

export class RoomError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MAX_PLAYERS_TOTAL = MAX_PLAYERS_PER_TEAM * TEAM_IDS.length;
const MAX_TEAM_NAME_LENGTH = 24;

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function emptyTeam(id: string, name: string): TeamState {
  return { id, name, playerIds: [], captainId: null, score: 0, strikes: 0 };
}

function requireHost(room: RoomSession, requesterId: string): void {
  if (room.hostId !== requesterId) {
    throw new RoomError("NOT_HOST", "Only the host can do that");
  }
}

/** Recomputes a team's captain after its membership changes: first player in the list, or none. */
function recomputeCaptain(team: TeamState): void {
  team.captainId = team.playerIds[0] ?? null;
}

/**
 * Holds all active game state in memory, keyed by roomId. Nothing here is
 * persisted — destroyRoom() is the only way rooms leave this store, and a
 * background sweep calls it automatically once a room goes idle past its TTL.
 *
 * Team format is fixed: exactly 2 teams, 5 players max each (spec: 10 total).
 * Players start unassigned (teamId: null) and only move to a team via
 * assignPlayerToTeam() or autoBalanceTeams() — both host-only.
 */
export class RoomStore {
  private roomsById = new Map<string, RoomSession>();
  private roomIdByCode = new Map<string, string>();

  createRoom(displayName: string, ttlSeconds: number): { room: RoomSession; playerId: string } {
    const roomId = randomUUID();
    let roomCode = generateRoomCode();
    while (this.roomIdByCode.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerId = randomUUID();
    const teams = Object.fromEntries(TEAM_IDS.map((id, i) => [id, emptyTeam(id, `Team ${i + 1}`)]));
    const host: PlayerState = { id: playerId, displayName, teamId: null, connected: true, isHost: true, ready: false };

    const now = Date.now();
    const room: RoomSession = {
      roomId,
      roomCode,
      hostId: playerId,
      players: { [playerId]: host },
      teams,
      currentQuestionId: null,
      phase: "LOBBY",
      teamsLocked: false,
      activePlayerId: null,
      controllingTeamId: null,
      board: { slots: [], currentTotal: 0 },
      timer: { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 },
      createdAt: now,
      lastActivityAt: now,
    };

    this.roomsById.set(roomId, room);
    this.roomIdByCode.set(roomCode, roomId);
    void ttlSeconds; // TTL is enforced by sweepExpired(), applied uniformly to every room.
    return { room, playerId };
  }

  joinRoom(roomCode: string, displayName: string): { room: RoomSession; playerId: string } {
    const roomId = this.roomIdByCode.get(roomCode.toUpperCase());
    if (!roomId) throw new RoomError("ROOM_NOT_FOUND", `No room with code ${roomCode}`);
    const room = this.roomsById.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", `No room with code ${roomCode}`);
    if (room.phase !== "LOBBY") throw new RoomError("ROOM_IN_PROGRESS", "This game has already started");
    if (Object.keys(room.players).length >= MAX_PLAYERS_TOTAL) {
      throw new RoomError("ROOM_FULL", "This room is full");
    }

    const playerId = randomUUID();
    const player: PlayerState = { id: playerId, displayName, teamId: null, connected: true, isHost: false, ready: false };
    room.players[playerId] = player;

    room.lastActivityAt = Date.now();
    return { room, playerId };
  }

  /** Host-only. Moves a player onto a team (max 5) or back to the unassigned pool (teamId: null). */
  assignPlayerToTeam(roomId: string, requesterId: string, playerId: string, teamId: string | null): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.teamsLocked) throw new RoomError("TEAMS_LOCKED", "Teams are already locked");

    const player = room.players[playerId];
    if (!player) throw new RoomError("PLAYER_NOT_FOUND", "No such player in this room");

    if (teamId !== null) {
      const targetTeam = room.teams[teamId];
      if (!targetTeam) throw new RoomError("TEAM_NOT_FOUND", "No such team");
      const alreadyOnTarget = targetTeam.playerIds.includes(playerId);
      if (!alreadyOnTarget && targetTeam.playerIds.length >= MAX_PLAYERS_PER_TEAM) {
        throw new RoomError("TEAM_FULL", `${targetTeam.name} is full`);
      }
    }

    for (const team of Object.values(room.teams)) {
      const idx = team.playerIds.indexOf(playerId);
      if (idx !== -1) {
        team.playerIds.splice(idx, 1);
        recomputeCaptain(team);
      }
    }
    if (teamId !== null) {
      const targetTeam = room.teams[teamId];
      targetTeam.playerIds.push(playerId);
      recomputeCaptain(targetTeam);
    }
    player.teamId = teamId;

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Randomly redistributes every player 50/50 across the two teams. */
  autoBalanceTeams(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.teamsLocked) throw new RoomError("TEAMS_LOCKED", "Teams are already locked");

    const teams = TEAM_IDS.map((id) => room.teams[id]);
    const shuffled = Object.keys(room.players).sort(() => Math.random() - 0.5);

    for (const team of teams) team.playerIds = [];
    shuffled.forEach((playerId, index) => {
      const team = teams[index % teams.length];
      team.playerIds.push(playerId);
      room.players[playerId].teamId = team.id;
    });
    for (const team of teams) recomputeCaptain(team);

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Renames a team (1-24 chars after trimming). */
  renameTeam(roomId: string, requesterId: string, teamId: string, name: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    const team = room.teams[teamId];
    if (!team) throw new RoomError("TEAM_NOT_FOUND", "No such team");

    const trimmed = name.trim();
    if (!trimmed) throw new RoomError("INVALID_NAME", "Team name cannot be blank");
    team.name = trimmed.slice(0, MAX_TEAM_NAME_LENGTH);

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Closes the lobby: both teams must be non-empty. Advances phase to FACE_OFF. */
  lockTeams(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.phase !== "LOBBY") throw new RoomError("ALREADY_STARTED", "The game has already started");

    const emptyTeams = Object.values(room.teams).filter((team) => team.playerIds.length === 0);
    if (emptyTeams.length > 0) {
      throw new RoomError("TEAM_EMPTY", `${emptyTeams.map((t) => t.name).join(", ")} needs at least one player`);
    }

    room.teamsLocked = true;
    room.phase = "FACE_OFF";
    room.lastActivityAt = Date.now();
    return room;
  }

  getRoom(roomId: string): RoomSession | undefined {
    return this.roomsById.get(roomId);
  }

  private getRoomOrThrow(roomId: string): RoomSession {
    const room = this.roomsById.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No such room");
    return room;
  }

  setPlayerConnected(roomId: string, playerId: string, connected: boolean): RoomSession | undefined {
    const room = this.roomsById.get(roomId);
    const player = room?.players[playerId];
    if (!room || !player) return undefined;
    player.connected = connected;
    room.lastActivityAt = Date.now();
    return room;
  }

  touch(roomId: string): void {
    const room = this.roomsById.get(roomId);
    if (room) room.lastActivityAt = Date.now();
  }

  /** Removes every trace of a room's players, teams, scores, and board state. */
  destroyRoom(roomId: string): void {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    this.roomIdByCode.delete(room.roomCode);
    this.roomsById.delete(roomId);
  }

  /** Destroys any room whose lastActivityAt is older than ttlSeconds. Returns destroyed room IDs. */
  sweepExpired(ttlSeconds: number, now: number = Date.now()): string[] {
    const ttlMs = ttlSeconds * 1000;
    const expired: string[] = [];
    for (const room of this.roomsById.values()) {
      if (now - room.lastActivityAt > ttlMs) {
        expired.push(room.roomId);
      }
    }
    for (const roomId of expired) {
      this.destroyRoom(roomId);
    }
    return expired;
  }

  size(): number {
    return this.roomsById.size;
  }
}
