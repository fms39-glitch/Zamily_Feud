import type { RoomSession } from "../types/game.js";
import type { HostCommentary } from "../types/host.js";

/** Client → Server payloads */
export interface RoomCreatePayload {
  displayName: string;
}

export interface RoomJoinPayload {
  roomCode: string;
  displayName: string;
}

export interface PlayerReadyPayload {
  ready: boolean;
}

export interface BuzzPayload {
  clientTimestamp: number;
}

export interface SubmitAnswerPayload {
  answer: string;
}

export interface ChoosePlayPassPayload {
  choice: "PLAY" | "PASS";
}

export interface SubmitStealPayload {
  answer: string;
}

/** Server → Client payloads */
export interface RoomUpdatedPayload {
  room: RoomSession;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ClientToServerEvents {
  ROOM_CREATE: (payload: RoomCreatePayload, ack: (result: { roomId: string; roomCode: string; playerId: string } | ErrorPayload) => void) => void;
  ROOM_JOIN: (payload: RoomJoinPayload, ack: (result: { roomId: string; playerId: string } | ErrorPayload) => void) => void;
  PLAYER_READY: (payload: PlayerReadyPayload) => void;
  BUZZ: (payload: BuzzPayload) => void;
  SUBMIT_ANSWER: (payload: SubmitAnswerPayload) => void;
  CHOOSE_PLAY: (payload: Record<string, never>) => void;
  CHOOSE_PASS: (payload: Record<string, never>) => void;
  SUBMIT_STEAL: (payload: SubmitStealPayload) => void;
  READY_FOR_NEXT_ROUND: (payload: Record<string, never>) => void;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (payload: RoomUpdatedPayload) => void;
  GAME_STATE_UPDATED: (payload: RoomUpdatedPayload) => void;
  QUESTION_REVEALED: (payload: { questionText: string }) => void;
  BUZZ_LOCKED: (payload: { playerId: string; teamId: string }) => void;
  ANSWER_RESULT: (payload: unknown) => void;
  BOARD_REVEALED: (payload: unknown) => void;
  STRIKE: (payload: { teamId: string; strikes: number }) => void;
  TIMER_STARTED: (payload: { kind: string; durationMs: number }) => void;
  TIMER_UPDATED: (payload: { remainingMs: number }) => void;
  STEAL_STARTED: (payload: unknown) => void;
  ROUND_COMPLETE: (payload: unknown) => void;
  HOST_COMMENTARY: (payload: HostCommentary) => void;
  GAME_COMPLETE: (payload: unknown) => void;
  ERROR: (payload: ErrorPayload) => void;
}
