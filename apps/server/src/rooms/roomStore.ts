import { randomUUID } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@zamily-feud/shared";
import type { PlayerState, RoomSession, TeamState } from "@zamily-feud/shared";

export class RoomError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MAX_PLAYERS_PER_TEAM = 5;

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

/**
 * Holds all active game state in memory, keyed by roomId. Nothing here is
 * persisted — destroyRoom() is the only way rooms leave this store, and a
 * background sweep calls it automatically once a room goes idle past its TTL.
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
    const teamA = emptyTeam("team-a", "Team A");
    const teamB = emptyTeam("team-b", "Team B");
    teamA.playerIds.push(playerId);
    teamA.captainId = playerId;

    const host: PlayerState = { id: playerId, displayName, teamId: teamA.id, connected: true, isHost: true, ready: false };

    const now = Date.now();
    const room: RoomSession = {
      roomId,
      roomCode,
      hostId: playerId,
      players: { [playerId]: host },
      teams: { [teamA.id]: teamA, [teamB.id]: teamB },
      currentQuestionId: null,
      phase: "LOBBY",
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

    const teamA = room.teams["team-a"];
    const teamB = room.teams["team-b"];
    if (teamA.playerIds.length >= MAX_PLAYERS_PER_TEAM && teamB.playerIds.length >= MAX_PLAYERS_PER_TEAM) {
      throw new RoomError("ROOM_FULL", "Both teams are full");
    }
    const targetTeam = teamA.playerIds.length <= teamB.playerIds.length ? teamA : teamB;

    const playerId = randomUUID();
    const player: PlayerState = { id: playerId, displayName, teamId: targetTeam.id, connected: true, isHost: false, ready: false };
    room.players[playerId] = player;
    targetTeam.playerIds.push(playerId);
    if (!targetTeam.captainId) targetTeam.captainId = playerId;

    room.lastActivityAt = Date.now();
    return { room, playerId };
  }

  getRoom(roomId: string): RoomSession | undefined {
    return this.roomsById.get(roomId);
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
