import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { HOST_PERSONAS, MIC_MAX_HOLD_MS } from "@zamily-feud/shared";
import type { ClientToServerEvents, ErrorPayload, RoomSession, ServerToClientEvents } from "@zamily-feud/shared";
import type { AppConfig } from "../config/env.js";
import { RoomError, RoomStore } from "../rooms/roomStore.js";
import { AiHostDirector } from "../host/aiHostDirector.js";
import type { HostBrain } from "../host/types.js";

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Ack = (result: { ok: true } | ErrorPayload) => void;

/** WebRTC SDP for one audio track is a few KB; anything far bigger isn't a real signal. */
const MAX_SIGNAL_BYTES = 16_000;

/** Only the host's socket joins this room, so full (blurred, pre-reveal) answer text never reaches other clients. */
function hostChannel(roomId: string): string {
  return `${roomId}:host`;
}

export function createSocketServer(
  httpServer: HttpServer,
  config: AppConfig,
  roomStore: RoomStore,
  hostBrains: { llm: HostBrain | null; canned: HostBrain },
) {
  const io: GameServer = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN },
  });
  /** playerId -> socket id, so WebRTC signals can be relayed to one specific player. */
  const socketIdByPlayer = new Map<string, string>();

  /** Runs AI-hosted rooms; it acts through the same broadcast/timer/animation side effects as a human host's socket. */
  const aiHost = new AiHostDirector(
    roomStore,
    {
      commit: (roomId, room) => {
        broadcastRoom(roomId, room);
        scheduleTimerIfNeeded(roomId, room);
      },
      broadcast: (roomId, room) => broadcastRoom(roomId, room),
      say: (roomId, commentary) => io.to(roomId).emit("HOST_COMMENTARY", commentary),
      slotRevealed: (roomId, slotIndex, playerId) => emitSlotRevealed(roomId, slotIndex, playerId),
      strike: (roomId, teamId, strikes) => io.to(roomId).emit("STRIKE", { teamId, strikes }),
      error: (roomId, message) => io.to(roomId).emit("ERROR", { code: "AI_HOST", message }),
    },
    hostBrains,
    { totalRounds: config.AI_HOST_ROUNDS },
  );

  /** One-off reveal animation trigger, with what's needed to pick the celebration (rank) before ROOM_UPDATED lands. */
  function emitSlotRevealed(roomId: string, slotIndex: number, playerId: string | null) {
    const room = roomStore.getRoom(roomId);
    const slot = room?.board.slots[slotIndex];
    if (!room || !slot) return;
    io.to(roomId).emit("SLOT_REVEALED", {
      slotIndex,
      playerId,
      rank: slot.rank,
      answerText: slot.answerText ?? "",
      points: slot.points,
      teamId: room.controllingTeamId,
    });
  }

  function broadcastRoom(roomId: string, room: RoomSession) {
    io.to(roomId).emit("ROOM_UPDATED", { room });
    io.to(hostChannel(roomId)).emit("HOST_BOARD_STATE", { board: roomStore.getHostBoard(roomId) });
    aiHost.notify(roomId);
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
      const hostMode = payload.hostMode === "AI" ? "AI" : "HUMAN";
      const hostPersona = HOST_PERSONAS.find((p) => p.id === payload.hostPersona)?.id;
      const { room, playerId } = roomStore.createRoom(displayName, config.ROOM_TTL_SECONDS, { hostMode, hostPersona });
      socket.data.roomId = room.roomId;
      socket.data.playerId = playerId;
      socketIdByPlayer.set(playerId, socket.id);
      socket.join(room.roomId);
      // In HUMAN mode the creator is the host and gets the full-answer channel; in AI mode they're a player and must not.
      if (hostMode === "HUMAN") socket.join(hostChannel(room.roomId));
      ack({ roomId: room.roomId, roomCode: room.roomCode, playerId });
      socket.emit("PLAYER_AVATARS", { avatars: roomStore.getAvatars(room.roomId) });
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
        socketIdByPlayer.set(playerId, socket.id);
        socket.join(room.roomId);
        ack({ roomId: room.roomId, playerId });
        socket.emit("PLAYER_AVATARS", { avatars: roomStore.getAvatars(room.roomId) });
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
      runMutation(socket, ack, (roomId, requesterId) => roomStore.submitAnswer(roomId, requesterId, payload.answer, payload.alternatives)),
    );

    socket.on("CHOOSE_PLAY", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.choosePlay(roomId, requesterId)));
    socket.on("CHOOSE_PASS", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.choosePass(roomId, requesterId)));

    socket.on("HOST_REVEAL", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const answeredBy = roomStore.getRoom(roomId)?.lastSubmission?.playerId ?? null;
        const room = roomStore.hostReveal(roomId, requesterId, payload.slotIndex);
        emitSlotRevealed(roomId, payload.slotIndex, answeredBy);
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

    socket.on("CHAT_SEND", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) =>
        roomStore.postPlayerChat(roomId, requesterId, String(payload?.text ?? ""), payload?.via === "VOICE" ? "VOICE" : "TEXT").room,
      ),
    );

    socket.on("MIC_CLAIM", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const { room, claimId } = roomStore.claimMic(roomId, requesterId);
        // Nobody holds a team mic forever: release this claim after the cap unless it was already released or re-claimed.
        setTimeout(() => {
          const released = roomStore.releaseMic(roomId, requesterId, claimId);
          if (released) broadcastRoom(roomId, released);
        }, MIC_MAX_HOLD_MS);
        return room;
      }),
    );

    socket.on("MIC_RELEASE", (_payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const room = roomStore.releaseMic(roomId, requesterId) ?? roomStore.getRoom(roomId);
        if (!room) throw new RoomError("ROOM_NOT_FOUND", "No such room");
        return room;
      }),
    );

    socket.on("PLAYER_SET_AVATAR", (payload, ack) =>
      runMutation(socket, ack, (roomId, requesterId) => {
        const room = roomStore.setAvatar(roomId, requesterId, payload?.image ?? null);
        io.to(roomId).emit("PLAYER_AVATARS", { avatars: roomStore.getAvatars(roomId) });
        return room;
      }),
    );

    socket.on("STEAL_READY", (_payload, ack) => runMutation(socket, ack, (roomId, requesterId) => roomStore.endStealHuddle(roomId, requesterId)));

    // The stealing team's private huddle: delivered to its members' sockets only — never the room, never the AI host.
    socket.on("TEAM_CHAT_SEND", (payload, ack) => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) {
        ack({ code: "NOT_IN_ROOM", message: "You are not in a room" });
        return;
      }
      try {
        const { message, recipientIds } = roomStore.postTeamChat(roomId, playerId, String(payload?.text ?? ""), payload?.via === "VOICE" ? "VOICE" : "TEXT");
        ack({ ok: true });
        for (const id of recipientIds) {
          const sid = socketIdByPlayer.get(id);
          if (sid) io.to(sid).emit("TEAM_CHAT_MESSAGE", message);
        }
      } catch (err) {
        ackError(ack, err);
      }
    });

    // Relays WebRTC offers/answers/ICE between two players in the same AI-host room. The server never sees audio.
    socket.on("RTC_SIGNAL", (payload) => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId || !payload || typeof payload.peerId !== "string") return;
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostMode !== "AI" || !room.players[payload.peerId] || payload.peerId === playerId) return;
      if (JSON.stringify(payload.signal ?? null).length > MAX_SIGNAL_BYTES) return;
      // During a steal huddle the stealing team's mic only connects to its own teammates.
      const [holderId, listenerId] = payload.direction === "toHolder" ? [payload.peerId, playerId] : [playerId, payload.peerId];
      if (!roomStore.canHearMic(roomId, holderId, listenerId)) return;
      const targetSocketId = socketIdByPlayer.get(payload.peerId);
      const direction = payload.direction === "toHolder" ? "toHolder" : "toListener";
      if (targetSocketId) io.to(targetSocketId).emit("RTC_SIGNAL", { peerId: playerId, direction, signal: payload.signal });
    });

    socket.on("disconnect", () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      if (socketIdByPlayer.get(playerId) === socket.id) socketIdByPlayer.delete(playerId);
      const room = roomStore.setPlayerConnected(roomId, playerId, false);
      if (room) broadcastRoom(roomId, room);
    });
  });

  return { io, aiHost };
}
