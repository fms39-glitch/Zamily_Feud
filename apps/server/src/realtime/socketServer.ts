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

/** Only the host's socket joins this room, so full (blurred, pre-reveal) answer text never reaches other clients. */
function hostChannel(roomId: string): string {
  return `${roomId}:host`;
}

export function createSocketServer(httpServer: HttpServer, config: AppConfig, roomStore: RoomStore) {
  const io: GameServer = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN },
  });

  function broadcastRoom(roomId: string, room: RoomSession) {
    io.to(roomId).emit("ROOM_UPDATED", { room });
    io.to(hostChannel(roomId)).emit("HOST_BOARD_STATE", { board: roomStore.getHostBoard(roomId) });
  }

  /**
   * Re-arms the server-side timeout for whatever timer the room currently
   * holds. A stale fire (the timer already moved on) is a safe no-op —
   * RoomStore.expireTimer guards on the timer id itself.
   */
  function scheduleTimerIfNeeded(roomId: string, room: RoomSession) {
    if (!room.timer.id) return;
    const timerId = room.timer.id;
    setTimeout(() => {
      const updated = roomStore.expireTimer(roomId, timerId);
      if (!updated) return;
      broadcastRoom(roomId, updated);
      scheduleTimerIfNeeded(roomId, updated);
    }, room.timer.durationMs);
  }

  function ackError(ack: Ack, err: unknown) {
    if (err instanceof RoomError) {
      ack({ code: err.code, message: err.message });
    } else {
      console.error(err);
      ack({ code: "UNKNOWN", message: "Something went wrong" });
    }
  }

  /** Runs a room mutation, acks ok/error, broadcasts on success, and re-arms any timer the mutation started. */
  async function runMutation(
    socket: GameSocket,
    ack: Ack,
    mutate: (roomId: string, requesterId: string) => RoomSession | Promise<RoomSession>,
  ) {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) {
      ack({ code: "NOT_IN_ROOM", message: "You are not in a room" });
      return;
    }
    try {
      const room = await mutate(roomId, playerId);
      ack({ ok: true });
      broadcastRoom(roomId, room);
      scheduleTimerIfNeeded(roomId, room);
    } catch (err) {
      ackError(ack, err);
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
      socket.join(hostChannel(room.roomId)); // the creator is always the host
      ack({ roomId: room.roomId, roomCode: room.roomCode, playerId });
      broadcastRoom(room.roomId, room);
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
        broadcastRoom(room.roomId, room);
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
      broadcastRoom(roomId, room);
    });

    socket.on("TEAM_AUTO_BALANCE", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.autoBalanceTeams(roomId, requesterId)),
    );
    socket.on("TEAM_ASSIGN", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) =>
        roomStore.assignPlayerToTeam(roomId, requesterId, payload.playerId, payload.teamId),
      ),
    );
    socket.on("TEAM_RENAME", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.renameTeam(roomId, requesterId, payload.teamId, payload.name)),
    );
    socket.on("LOCK_TEAMS", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.lockTeams(roomId, requesterId)));

    socket.on("HOST_START_QUESTION", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.startQuestion(roomId, requesterId)),
    );

    socket.on("BUZZ", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const room = roomStore.buzz(roomId, requesterId);
        io.to(roomId).emit("BUZZ_LOCKED", { playerId: requesterId, teamId: room.controllingTeamId! });
        return room;
      }),
    );

    socket.on("SUBMIT_ANSWER", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.submitAnswer(roomId, requesterId, payload.answer)),
    );

    socket.on("CHOOSE_PLAY", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.choosePlay(roomId, requesterId)));
    socket.on("CHOOSE_PASS", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.choosePass(roomId, requesterId)));

    socket.on("HOST_REVEAL", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const room = roomStore.hostReveal(roomId, requesterId, payload.slotIndex);
        io.to(roomId).emit("SLOT_REVEALED", { slotIndex: payload.slotIndex });
        return room;
      }),
    );

    socket.on("HOST_WRONG", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const before = roomStore.getRoom(roomId);
        const teamIdBefore = before?.controllingTeamId ?? null;
        const strikesBefore = teamIdBefore ? before!.teams[teamIdBefore].strikes : 0;

        const room = roomStore.hostWrong(roomId, requesterId);

        const strikesAfter = teamIdBefore ? room.teams[teamIdBefore]?.strikes ?? 0 : 0;
        if (teamIdBefore && strikesAfter > strikesBefore) {
          io.to(roomId).emit("STRIKE", { teamId: teamIdBefore, strikes: strikesAfter });
        }
        return room;
      }),
    );

    socket.on("HOST_REOPEN_BUZZ", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.hostReopenBuzz(roomId, requesterId)),
    );
    socket.on("HOST_ASSIGN_CONTROL", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.hostAssignControl(roomId, requesterId, payload.teamId)),
    );
    socket.on("HOST_ADVANCE_STEAL", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.hostAdvanceSteal(roomId, requesterId)),
    );
    socket.on("HOST_NEXT_ROUND", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => roomStore.hostNextRound(roomId, requesterId)),
    );
    socket.on("HOST_END_GAME", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.hostEndGame(roomId, requesterId)));

    socket.on("disconnect", () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      const room = roomStore.setPlayerConnected(roomId, playerId, false);
      if (room) broadcastRoom(roomId, room);
    });
  });

  return io;
}
