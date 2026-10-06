export type HostEventType =
  | "GAME_STARTED"
  | "QUESTION_REVEALED"
  | "FACE_OFF_STARTED"
  | "EXACT_MATCH"
  | "SYNONYM_MATCH"
  | "STRIKE"
  | "STRIKE_3"
  | "STEAL_STARTED"
  | "STEAL_SUCCESS"
  | "STEAL_FAILURE"
  | "ROUND_COMPLETE"
  | "OUTRAGEOUS_MISS"
  | "FAST_MONEY_STARTED"
  | "FAST_MONEY_RESULT"
  | "GAME_COMPLETE"
  | "BUZZ_TIMEOUT"
  | "CONTROL_AWARDED"
  | "PLAY_CHOSEN"
  | "PASS_CHOSEN"
  | "BANTER";

/** The AI host's comedic persona (historically named for age groups; SASSY is a style, not an age). */
export type AgeCategory = "FAMILY_FRIENDLY" | "SASSY" | "MILLENNIAL" | "GEN_Z";

export interface HostEvent {
  type: HostEventType;
  context: Record<string, unknown>;
}

export interface HostCommentary {
  /** Unique per line, so clients can key animations and speech on it. */
  id: string;
  eventType: HostEventType;
  text: string;
  source: "LLM" | "CANNED";
  at: number;
}
