import type { EvaluationResult } from "./matching.js";
import type { AgeCategory } from "./host.js";
import type { ChatMessage } from "./chat.js";

/** HUMAN: the room creator hosts (manages, never plays). AI: an AI agent hosts and the creator plays like everyone else. */
export type HostMode = "HUMAN" | "AI";

/** Explicit game state machine phases (spec §8). Transitions are server-only. */
export type GamePhase =
  | "LOBBY"
  | "FACE_OFF"
  | "CONTROL_DECISION"
  | "PLAYING_BOARD"
  | "STEAL_CONFERENCE"
  | "STEAL_ATTEMPT"
  | "ROUND_RESULT"
  | "NEXT_ROUND"
  | "FAST_MONEY_PLAYER_1"
  | "FAST_MONEY_PLAYER_2"
  | "FAST_MONEY_RESULT"
  | "GAME_RESULT";

export interface PlayerState {
  id: string;
  displayName: string;
  /** null = unassigned, sitting in the lobby pool until the host or auto-balance places them. */
  teamId: string | null;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
  /** The player set a picture. The image itself travels on the PLAYER_AVATARS event, not in every room update. */
  hasAvatar: boolean;
}

export interface TeamState {
  id: string;
  name: string;
  playerIds: string[];
  captainId: string | null;
  score: number;
  strikes: number;
}

/** One revealed/hidden slot on the board for the current question. */
export interface BoardSlot {
  answerId: string;
  answerText: string | null;
  points: number;
  rank: number;
  revealed: boolean;
  /** Shown at round end because nobody got it; never scored. */
  missed: boolean;
}

export interface BoardState {
  slots: BoardSlot[];
  currentTotal: number;
}

/** Host-only board view: answer text is always populated so the host can render it blurred pre-reveal. */
export interface HostBoardSlot {
  answerId: string;
  answerText: string;
  points: number;
  rank: number;
  revealed: boolean;
  missed: boolean;
}

export interface HostBoardState {
  questionId: string;
  slots: HostBoardSlot[];
}

/** The matching engine's best guess at which board slot a submitted answer matches — never authoritative, the host decides. */
export interface AnswerSuggestion extends EvaluationResult {
  slotIndex: number | null;
  /** True once confidence clears the auto-accept bar for its tier — still just a suggestion. */
  autoAccept: boolean;
}

/** The most recent free-text answer submitted, broadcast so every client can see what was said. */
export interface SubmissionBanner {
  playerId: string;
  teamId: string;
  displayName: string;
  text: string;
  /** For spoken answers: speech-to-text's other guesses at what was said. Empty for typed answers. */
  alternatives: string[];
  /** Which wording the suggestion was matched on — `text`, or one of `alternatives` if that matched better. */
  matchedOn: string;
  suggestion: AnswerSuggestion;
  submittedAt: number;
}

/** Server-authoritative timer snapshot; clients render from this, never from local setInterval alone. */
export interface TimerState {
  id: string | null;
  /** QUESTION_INTRO: AI rooms show the question for a beat (and the host reads it) before the buzzer opens. */
  kind: "QUESTION_INTRO" | "BUZZ" | "STEAL_CONFERENCE" | "ANSWER" | "FAST_MONEY" | null;
  durationMs: number;
  startedAt: number | null;
  remainingMs: number;
}

export interface RoomSession {
  roomId: string;
  roomCode: string;
  /** Who runs the game. In AI mode this is AI_HOST_ID, a virtual host that never appears in `players`. */
  hostId: string;
  /** The room creator: manages the lobby (teams, lock) in both modes. Same as hostId in HUMAN mode. */
  ownerId: string;
  hostMode: HostMode;
  /** The AI host's comedic register; null in HUMAN mode. */
  hostPersona: AgeCategory | null;

  players: Record<string, PlayerState>;
  teams: Record<string, TeamState>;

  currentQuestionId: string | null;
  questionText: string | null;
  /** 1-based count of questions started so far; 0 before the first one. */
  roundNumber: number;
  /** How many rounds an AI-hosted game runs; null for human hosts (who decide when to end). */
  totalRounds: number | null;
  phase: GamePhase;
  teamsLocked: boolean;

  activePlayerId: string | null;
  controllingTeamId: string | null;

  board: BoardState;
  timer: TimerState;
  /** Shared chat (players + AI host), newest last, capped at CHAT_HISTORY_LIMIT. Ephemeral like everything else here. */
  chat: ChatMessage[];
  /** teamId → the player currently holding that team's talk-to-host mic (one per team), or null. */
  micHolders: Record<string, string | null>;
  /** null once resolved (host reveals/marks wrong, or a new question starts). */
  lastSubmission: SubmissionBanner | null;

  createdAt: number;
  lastActivityAt: number;
}

/** Permanent dataset shapes (Supabase). Never contains player/session data. */
export interface Question {
  id: string;
  questionText: string;
  source: string;
  createdAt: string;
}

export interface BoardAnswer {
  id: string;
  questionId: string;
  answer: string;
  normalizedAnswer: string;
  points: number;
  rank: number;
  embedding?: number[];
  embeddingModel?: string | null;
  embeddingVersion?: number | null;
}
