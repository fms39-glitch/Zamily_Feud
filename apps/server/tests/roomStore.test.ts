import { beforeEach, describe, expect, it } from "vitest";
import { RoomError, RoomStore } from "../src/rooms/roomStore.js";

describe("RoomStore", () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore();
  });

  it("creates a room with the host unassigned and two empty teams", () => {
    const { room, playerId } = store.createRoom("Alice", 3600);
    expect(room.hostId).toBe(playerId);
    expect(room.players[playerId].isHost).toBe(true);
    expect(room.players[playerId].teamId).toBeNull();
    expect(room.teams["team-1"].playerIds).toHaveLength(0);
    expect(room.teams["team-2"].playerIds).toHaveLength(0);
    expect(room.phase).toBe("LOBBY");
    expect(room.teamsLocked).toBe(false);
    expect(room.roomCode).toHaveLength(5);
  });

  it("lets a second player join by room code, also unassigned", () => {
    const { room } = store.createRoom("Alice", 3600);
    const { room: joined, playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
    expect(joined.players[bobId].displayName).toBe("Bob");
    expect(joined.players[bobId].teamId).toBeNull();
  });

  it("is case-insensitive on room codes", () => {
    const { room } = store.createRoom("Alice", 3600);
    const { playerId } = store.joinRoom(room.roomCode.toLowerCase(), "Bob");
    expect(playerId).toBeDefined();
  });

  it("rejects joining a room that does not exist", () => {
    expect(() => store.joinRoom("ZZZZZ", "Bob")).toThrow(RoomError);
  });

  it("rejects joining once the room has 10 players", () => {
    const { room } = store.createRoom("Alice", 3600);
    for (let i = 0; i < 9; i++) {
      store.joinRoom(room.roomCode, `Player${i}`);
    }
    expect(() => store.joinRoom(room.roomCode, "OneTooMany")).toThrow(RoomError);
  });

  describe("assignPlayerToTeam", () => {
    it("lets the host assign a player to a team", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
      const updated = store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-1");
      expect(updated.teams["team-1"].playerIds).toContain(bobId);
      expect(updated.players[bobId].teamId).toBe("team-1");
      expect(updated.teams["team-1"].captainId).toBe(bobId);
    });

    it("rejects a non-host caller", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
      expect(() => store.assignPlayerToTeam(room.roomId, bobId, hostId, "team-1")).toThrow(RoomError);
    });

    it("moves a player back to unassigned with teamId null", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      store.assignPlayerToTeam(room.roomId, hostId, hostId, "team-1");
      const updated = store.assignPlayerToTeam(room.roomId, hostId, hostId, null);
      expect(updated.players[hostId].teamId).toBeNull();
      expect(updated.teams["team-1"].playerIds).not.toContain(hostId);
    });

    it("rejects assignment once a team already has 5 players", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      for (let i = 0; i < 5; i++) {
        const { playerId } = store.joinRoom(room.roomCode, `P${i}`);
        store.assignPlayerToTeam(room.roomId, hostId, playerId, "team-1");
      }
      const { playerId: sixth } = store.joinRoom(room.roomCode, "Sixth");
      expect(() => store.assignPlayerToTeam(room.roomId, hostId, sixth, "team-1")).toThrow(RoomError);
    });

    it("promotes the next player to captain when the captain leaves the team", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
      store.assignPlayerToTeam(room.roomId, hostId, hostId, "team-1");
      store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-1");
      const updated = store.assignPlayerToTeam(room.roomId, hostId, hostId, null);
      expect(updated.teams["team-1"].captainId).toBe(bobId);
    });
  });

  describe("autoBalanceTeams", () => {
    it("splits every player 50/50 across the two teams", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      for (let i = 0; i < 7; i++) store.joinRoom(room.roomCode, `P${i}`);
      const updated = store.autoBalanceTeams(room.roomId, hostId);
      const sizes = [updated.teams["team-1"].playerIds.length, updated.teams["team-2"].playerIds.length];
      expect(sizes.sort()).toEqual([4, 4]);
      expect(Object.values(updated.players).every((p) => p.teamId !== null)).toBe(true);
    });

    it("rejects a non-host caller", () => {
      const { room } = store.createRoom("Alice", 3600);
      const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
      expect(() => store.autoBalanceTeams(room.roomId, bobId)).toThrow(RoomError);
    });
  });

  describe("renameTeam", () => {
    it("lets the host rename a team", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      const updated = store.renameTeam(room.roomId, hostId, "team-1", "The Champions");
      expect(updated.teams["team-1"].name).toBe("The Champions");
    });

    it("rejects a blank name", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      expect(() => store.renameTeam(room.roomId, hostId, "team-1", "   ")).toThrow(RoomError);
    });
  });

  describe("lockTeams", () => {
    it("requires both teams to be non-empty", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      store.assignPlayerToTeam(room.roomId, hostId, hostId, "team-1");
      expect(() => store.lockTeams(room.roomId, hostId)).toThrow(RoomError);
    });

    it("locks teams and advances the phase once both teams have a player", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
      store.assignPlayerToTeam(room.roomId, hostId, hostId, "team-1");
      store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-2");
      const updated = store.lockTeams(room.roomId, hostId);
      expect(updated.teamsLocked).toBe(true);
      expect(updated.phase).toBe("FACE_OFF");
    });

    it("rejects further team edits once locked", () => {
      const { room, playerId: hostId } = store.createRoom("Alice", 3600);
      const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
      store.assignPlayerToTeam(room.roomId, hostId, hostId, "team-1");
      store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-2");
      store.lockTeams(room.roomId, hostId);
      expect(() => store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-1")).toThrow(RoomError);
    });
  });

  it("destroys a room and removes all its state, including its code index", () => {
    const { room } = store.createRoom("Alice", 3600);
    store.destroyRoom(room.roomId);
    expect(store.getRoom(room.roomId)).toBeUndefined();
    expect(() => store.joinRoom(room.roomCode, "Bob")).toThrow(RoomError);
  });

  it("sweeps rooms idle past the TTL and leaves fresh rooms alone", () => {
    const { room: staleRoom } = store.createRoom("Stale", 3600);
    const { room: freshRoom } = store.createRoom("Fresh", 3600);

    const now = Date.now();
    staleRoom.lastActivityAt = now - 2 * 3600 * 1000;

    const expired = store.sweepExpired(3600, now);

    expect(expired).toContain(staleRoom.roomId);
    expect(expired).not.toContain(freshRoom.roomId);
    expect(store.getRoom(staleRoom.roomId)).toBeUndefined();
    expect(store.getRoom(freshRoom.roomId)).toBeDefined();
  });

  it("marks a player disconnected without deleting the room", () => {
    const { room, playerId } = store.createRoom("Alice", 3600);
    const updated = store.setPlayerConnected(room.roomId, playerId, false);
    expect(updated?.players[playerId].connected).toBe(false);
  });
});
