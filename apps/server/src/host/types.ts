import type { AgeCategory, HostBoardState, HostEventType, RoomSession } from "@zamily-feud/shared";

/** Every move the AI host can make. Each one carries the line the host says while making it. */
export type HostActionName =
  | "say"
  | "start_question"
  | "reveal_answer"
  | "mark_wrong"
  | "reopen_buzzer"
  | "award_control"
  | "next_round"
  | "end_game"
  | "stay_quiet";

export type HostAction =
  | { name: "say"; line: string }
  | { name: "start_question"; line: string }
  | { name: "reveal_answer"; line: string; slotNumber: number }
  | { name: "mark_wrong"; line: string }
  | { name: "reopen_buzzer"; line: string }
  | { name: "award_control"; line: string; teamId: string }
  | { name: "next_round"; line: string }
  | { name: "end_game"; line: string }
  | { name: "stay_quiet" };

export type SituationKind =
  | "OPEN_GAME"
  | "START_QUESTION"
  | "JUDGE_ANSWER"
  | "BUZZER_IDLE"
  | "FACE_OFF_DEADLOCK"
  | "BOARD_DECISION"
  | "STEAL_HUDDLE"
  | "ROUND_OVER"
  | "GAME_OVER"
  | "LOBBY_WELCOME"
  | "ROSTER"
  | "CHAT";

/** A moment in the game that needs the host. Derived purely from room state, so each one is handled exactly once (by key). */
export interface Situation {
  kind: SituationKind;
  key: string;
  /** What just happened and what the host is expected to do, in plain English for the model. */
  brief: string;
  /** Tools legal in this moment. Anything else is rejected before touching the game. */
  allowed: HostActionName[];
  /** True when the game is stuck until the host makes a non-`say` move. */
  requiresAction: boolean;
  /** Commentary tag for lines spoken during this situation. */
  eventType: HostEventType;
  /** Beat to wait before acting (lets an intro or a final flip land). */
  delayMs?: number;
}

/** Outcome of one tool call, fed back to the model as a tool_result. */
export type ActionOutcome =
  | { ok: true; result: string; resolved: boolean }
  | { ok: false; error: string };

/** Everything a brain needs to run one turn. `execute` is the only way it can touch the game. */
export interface HostTurn {
  room: RoomSession;
  hostBoard: HostBoardState | null;
  persona: AgeCategory;
  situation: Situation;
  totalRounds: number;
  faceOffAttemptedTeamIds: string[];
  /** Recent events and host lines, oldest first, for running jokes and avoiding repeats. */
  showLog: string[];
  /** How many times the buzzer has been reopened on this question. */
  buzzerReopens: number;
  execute(action: HostAction): Promise<ActionOutcome>;
  /** True once a non-`say` action has succeeded this turn. */
  actionDone(): boolean;
}

export interface HostBrain {
  readonly name: "LLM" | "CANNED";
  takeTurn(turn: HostTurn): Promise<void>;
}
