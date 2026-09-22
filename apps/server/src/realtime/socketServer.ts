import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@zamily-feud/shared";
import type { AppConfig } from "../config/env.js";
import { RoomError, RoomStore } from "../rooms/roomStore.js";

interface SocketData {
  roomId?: string;
  playerId?: string;
}

export function createSocketServer(httpServer: HttpServer, config: AppConfig, roomStore: RoomStore) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN },
  });

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
