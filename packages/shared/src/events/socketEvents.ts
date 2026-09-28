import type { HostBoardState, RoomSession } from "../types/game.js";
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

export interface TeamAssignPayload {
  playerId: string;
  /** null moves the player back to the unassigned pool. */
  teamId: string | null;
}

export interface TeamRenamePayload {
  teamId: string;
  name: string;
}

export interface HostRevealPayload {
  slotIndex: number;
}

export interface HostAssignControlPayload {
  teamId: string;
}

/** Server → Client payloads */
export interface RoomUpdatedPayload {
  room: RoomSession;
}

export interface HostBoardStatePayload {
  board: HostBoardState | null;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

type Ack = (result: { ok: true } | ErrorPayload) => void;

export interface ClientToServerEvents {
  ROOM_CREATE: (payload: RoomCreatePayload, ack: (result: { roomId: string; roomCode: string; playerId: string } | ErrorPayload) => void) => void;
  ROOM_JOIN: (payload: RoomJoinPayload, ack: (result: { roomId: string; playerId: string } | ErrorPayload) => void) => void;
  PLAYER_READY: (payload: PlayerReadyPayload) => void;
  TEAM_AUTO_BALANCE: (payload: Record<string, never>, ack: Ack) => void;
  TEAM_ASSIGN: (payload: TeamAssignPayload, ack: Ack) => void;
  TEAM_RENAME: (payload: TeamRenamePayload, ack: Ack) => void;
  LOCK_TEAMS: (payload: Record<string, never>, ack: Ack) => void;

  /** Host-only: pulls the next question from the dataset and opens the buzzer. */
  HOST_START_QUESTION: (payload: Record<string, never>, ack: Ack) => void;
  /** Only the calling player's team captain may buzz, and only while the buzzer is open. */
  BUZZ: (payload: BuzzPayload, ack: Ack) => void;
  /** Only the player currently on the clock may submit (face-off winner, or any controlling/stealing-team member). */
  SUBMIT_ANSWER: (payload: SubmitAnswerPayload, ack: Ack) => void;
  /** Only the controlling team's captain may choose. */
  CHOOSE_PLAY: (payload: Record<string, never>, ack: Ack) => void;
  CHOOSE_PASS: (payload: Record<string, never>, ack: Ack) => void;

  /** Host-only: reveals a board slot as correct and advances the round accordingly. */
  HOST_REVEAL: (payload: HostRevealPayload, ack: Ack) => void;
  /** Host-only: marks the most recent attempt wrong (no answer text required). */
  HOST_WRONG: (payload: Record<string, never>, ack: Ack) => void;
  /** Host-only: re-opens the buzzer after a timeout with nobody locked in. */
  HOST_REOPEN_BUZZ: (payload: Record<string, never>, ack: Ack) => void;
  /** Host-only: manually awards control when both face-off attempts miss. */
  HOST_ASSIGN_CONTROL: (payload: HostAssignControlPayload, ack: Ack) => void;
  /** Host-only: ends the steal conference and opens the single steal attempt. */
  HOST_ADVANCE_STEAL: (payload: Record<string, never>, ack: Ack) => void;
  /** Host-only: clears the board and returns to a fresh face-off. */
  HOST_NEXT_ROUND: (payload: Record<string, never>, ack: Ack) => void;
  /** Host-only: ends the game and shows the final scoreboard. */
  HOST_END_GAME: (payload: Record<string, never>, ack: Ack) => void;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (payload: RoomUpdatedPayload) => void;
  /** Host-only channel: full answer text for every slot, even unrevealed ones. */
  HOST_BOARD_STATE: (payload: HostBoardStatePayload) => void;
  /** One-off animation trigger for the buzz-in flash; authoritative state is in ROOM_UPDATED. */
  BUZZ_LOCKED: (payload: { playerId: string; teamId: string }) => void;
  /** One-off animation trigger for a slot flip; authoritative state is in ROOM_UPDATED. */
  SLOT_REVEALED: (payload: { slotIndex: number }) => void;
  /** One-off animation trigger for the strike popup; authoritative state is in ROOM_UPDATED. */
  STRIKE: (payload: { teamId: string; strikes: number }) => void;
  HOST_COMMENTARY: (payload: HostCommentary) => void;
  ERROR: (payload: ErrorPayload) => void;
}
