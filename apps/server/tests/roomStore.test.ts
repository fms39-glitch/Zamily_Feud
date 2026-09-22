import { beforeEach, describe, expect, it } from "vitest";
import { RoomError, RoomStore } from "../src/rooms/roomStore.js";

describe("RoomStore", () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore();
  });

  it("creates a room with the host on team A", () => {
    const { room, playerId } = store.createRoom("Alice", 3600);
    expect(room.hostId).toBe(playerId);
    expect(room.players[playerId].isHost).toBe(true);
    expect(room.teams["team-a"].playerIds).toContain(playerId);
    expect(room.phase).toBe("LOBBY");
    expect(room.roomCode).toHaveLength(5);
  });

  it("lets a second player join by room code and balances teams", () => {
    const { room } = store.createRoom("Alice", 3600);
    const { room: joined, playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
    expect(joined.players[bobId].displayName).toBe("Bob");
    expect(joined.teams["team-b"].playerIds).toContain(bobId);
  });

  it("is case-insensitive on room codes", () => {
    const { room } = store.createRoom("Alice", 3600);
    const { playerId } = store.joinRoom(room.roomCode.toLowerCase(), "Bob");
    expect(playerId).toBeDefined();
  });

  it("rejects joining a room that does not exist", () => {
    expect(() => store.joinRoom("ZZZZZ", "Bob")).toThrow(RoomError);
  });

  it("rejects joining once both teams are full", () => {
    const { room } = store.createRoom("Alice", 3600);
    for (let i = 0; i < 9; i++) {
      store.joinRoom(room.roomCode, `Player${i}`);
    }
    expect(() => store.joinRoom(room.roomCode, "OneTooMany")).toThrow(RoomError);
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
    // Backdate only the stale room's activity; the store returns a live
    // reference, so mutating it here is equivalent to time having passed.
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
