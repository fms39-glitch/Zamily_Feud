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
}

export interface BoardState {
  slots: BoardSlot[];
  currentTotal: number;
}

/** Server-authoritative timer snapshot; clients render from this, never from local setInterval alone. */
export interface TimerState {
  id: string | null;
  kind: "BUZZ" | "STEAL_CONFERENCE" | "ANSWER" | "FAST_MONEY" | null;
  durationMs: number;
  startedAt: number | null;
  remainingMs: number;
}

export interface RoomSession {
  roomId: string;
  roomCode: string;
  hostId: string;

  players: Record<string, PlayerState>;
  teams: Record<string, TeamState>;

  currentQuestionId: string | null;
  phase: GamePhase;
  teamsLocked: boolean;

  activePlayerId: string | null;
  controllingTeamId: string | null;

  board: BoardState;
  timer: TimerState;

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
