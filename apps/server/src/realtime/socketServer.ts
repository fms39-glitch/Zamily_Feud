import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { ClientToServerEvents, ErrorPayload, RoomSession, ServerToClientEvents } from "@zamily-feud/shared";
import type { AppConfig } from "../config/env.js";
import { RoomError, RoomStore } from "../rooms/roomStore.js";

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Ack = (result: { ok: true } | ErrorPayload) => void;

export function createSocketServer(httpServer: HttpServer, config: AppConfig, roomStore: RoomStore) {
  const io: GameServer = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN },
  });

  /** Runs a host-authoritative room mutation, acks ok/error, and broadcasts ROOM_UPDATED on success. */
  function runMutation(io: GameServer, socket: GameSocket, ack: Ack, mutate: (roomId: string, requesterId: string) => RoomSession) {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ code: "NOT_IN_ROOM", message: "You are not in a room" });
      return;
    }
    try {
      const room = mutate(roomId, playerId);
      ack({ ok: true });
      io.to(roomId).emit("ROOM_UPDATED", { room });
    } catch (err) {
      if (err instanceof RoomError) {
        ack({ code: err.code, message: err.message });
      } else {
        ack({ code: "UNKNOWN", message: "Something went wrong" });
      }
    }
  }

  io.on("connection", (socket) => {
    socket.on("ROOM_CREATE", (payload, ack) => {
      const displayName = payload?.displayName?.trim();
      if (!displayName) {
        ack({ code: "INVALID_NAME", message: "Display name is required" });
        return;
      }
      const { room, playerId } = roomStore.createRoom(displayName, config.ROOM_TTL_SECONDS);
      socket.data.roomId = room.roomId;
      socket.data.playerId = playerId;
      socket.join(room.roomId);
      ack({ roomId: room.roomId, roomCode: room.roomCode, playerId });
      io.to(room.roomId).emit("ROOM_UPDATED", { room });
    });

    socket.on("ROOM_JOIN", (payload, ack) => {
      const displayName = payload?.displayName?.trim();
      if (!displayName) {
        ack({ code: "INVALID_NAME", message: "Display name is required" });
        return;
      }
      try {
        const { room, playerId } = roomStore.joinRoom(payload.roomCode, displayName);
        socket.data.roomId = room.roomId;
        socket.data.playerId = playerId;
        socket.join(room.roomId);
        ack({ roomId: room.roomId, playerId });
        io.to(room.roomId).emit("ROOM_UPDATED", { room });
      } catch (err) {
        if (err instanceof RoomError) {
          ack({ code: err.code, message: err.message });
        } else {
          ack({ code: "UNKNOWN", message: "Failed to join room" });
        }
      }
    });

    socket.on("PLAYER_READY", (payload) => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      const room = roomStore.getRoom(roomId);
      const player = room?.players[playerId];
      if (!room || !player) return;
      player.ready = payload.ready;
      roomStore.touch(roomId);
      io.to(roomId).emit("ROOM_UPDATED", { room });
    });

    socket.on("TEAM_AUTO_BALANCE", (_payload, ack) => {
      runMutation(io, socket, ack, (roomId, requesterId) => roomStore.autoBalanceTeams(roomId, requesterId));
    });

    socket.on("TEAM_ASSIGN", (payload, ack) => {
      runMutation(io, socket, ack, (roomId, requesterId) =>
        roomStore.assignPlayerToTeam(roomId, requesterId, payload.playerId, payload.teamId),
      );
    });

    socket.on("TEAM_RENAME", (payload, ack) => {
      runMutation(io, socket, ack, (roomId, requesterId) =>
        roomStore.renameTeam(roomId, requesterId, payload.teamId, payload.name),
      );
    });

    socket.on("LOCK_TEAMS", (_payload, ack) => {
      runMutation(io, socket, ack, (roomId, requesterId) => roomStore.lockTeams(roomId, requesterId));
    });

    socket.on("disconnect", () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      const room = roomStore.setPlayerConnected(roomId, playerId, false);
      if (room) {
        io.to(roomId).emit("ROOM_UPDATED", { room });
      }
    });
  });

  return io;
}
