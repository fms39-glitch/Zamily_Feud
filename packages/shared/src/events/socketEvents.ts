import type { HostBoardState, HostMode, RoomSession } from "../types/game.js";
import type { AgeCategory, HostCommentary } from "../types/host.js";
import type { ChatMessage, RtcSignal } from "../types/chat.js";

/** Client → Server payloads */
export interface RoomCreatePayload {
  displayName: string;
  /** Defaults to HUMAN. */
  hostMode?: HostMode;
  /** AI mode only; defaults to FAMILY_FRIENDLY. */
  hostPersona?: AgeCategory;
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
  /** Spoken answers only: speech-to-text's other guesses at what was said, best first. */
  alternatives?: string[];
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

export interface ChatSendPayload {
  text: string;
  /** VOICE = transcribed while holding the team mic. */
  via?: "TEXT" | "VOICE";
}

export interface RtcSignalPayload {
  /** Target player id (outbound) / sender player id (inbound). */
  peerId: string;
  /**
   * Which connection this belongs to, from the receiver's side: "toListener" = the sender holds a mic and is
   * streaming to you; "toHolder" = you hold a mic and the sender is a listener answering you. Two players who
   * both hold their team's mic have one connection each way, so this keeps the signals apart.
   */
  direction: "toListener" | "toHolder";
  signal: RtcSignal;
}

/** Server → Client payloads */
export interface SlotRevealedPayload {
  slotIndex: number;
  /** Who gave the answer, when known (for their picture in the celebration). */
  playerId: string | null;
  /** 1 = the number-one answer. Ranks 1-3 get their own celebrations. */
  rank: number;
  answerText: string;
  points: number;
  /** The team the reveal scores for (controlling or stealing team), if any. */
  teamId: string | null;
}

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
  /** Leave the room for good (lobby or mid-game). A human host leaving closes the room for everyone. */
  ROOM_LEAVE: (payload: Record<string, never>, ack: Ack) => void;
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

  /** AI-host rooms: post to the shared chat (the host may reply). */
  CHAT_SEND: (payload: ChatSendPayload, ack: Ack) => void;
  /** AI-host rooms: take your team's talk-to-host mic, if nobody on your team holds it. */
  MIC_CLAIM: (payload: Record<string, never>, ack: Ack) => void;
  MIC_RELEASE: (payload: Record<string, never>, ack: Ack) => void;
  /** WebRTC signaling for the mic's live audio, relayed to `peerId` in the same room. */
  RTC_SIGNAL: (payload: RtcSignalPayload) => void;

  /** Set (a small JPEG/PNG/WebP data URL) or clear (null) your picture. */
  PLAYER_SET_AVATAR: (payload: { image: string | null }, ack: Ack) => void;
  /** Any member of the stealing team: "Discussion is done" ends the 20s huddle early. */
  STEAL_READY: (payload: Record<string, never>, ack: Ack) => void;
  /** Stealing team only, during the steal: private team discussion, never shown to the other team or the host. */
  TEAM_CHAT_SEND: (payload: ChatSendPayload, ack: Ack) => void;
}

export interface ServerToClientEvents {
  ROOM_UPDATED: (payload: RoomUpdatedPayload) => void;
  /** Host-only channel: full answer text for every slot, even unrevealed ones. */
  HOST_BOARD_STATE: (payload: HostBoardStatePayload) => void;
  /** One-off animation trigger for the buzz-in flash; authoritative state is in ROOM_UPDATED. */
  BUZZ_LOCKED: (payload: { playerId: string; teamId: string }) => void;
  /** One-off animation trigger for a slot flip; authoritative state is in ROOM_UPDATED. */
  SLOT_REVEALED: (payload: SlotRevealedPayload) => void;
  /** One-off animation trigger for the strike popup; authoritative state is in ROOM_UPDATED. */
  STRIKE: (payload: { teamId: string; strikes: number }) => void;
  /** AI-host mode only: one spoken line from the AI host (rendered as a speech bubble, optionally read aloud). */
  HOST_COMMENTARY: (payload: HostCommentary) => void;
  /** WebRTC signaling from `peerId` (see the client event of the same name). */
  RTC_SIGNAL: (payload: RtcSignalPayload) => void;
  /** Every player's picture (playerId -> data URL). Sent on join and whenever one changes. */
  PLAYER_AVATARS: (payload: { avatars: Record<string, string> }) => void;
  /** A private steal-huddle message, delivered only to the stealing team's members. */
  TEAM_CHAT_MESSAGE: (payload: ChatMessage) => void;
  /** The room is gone (the human host left); clients return to the start screen. */
  ROOM_CLOSED: (payload: { reason: string }) => void;
  ERROR: (payload: ErrorPayload) => void;
}
