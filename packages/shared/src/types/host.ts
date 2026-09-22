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
  | "GAME_COMPLETE";

export type AgeCategory = "GEN_Z" | "MILLENNIAL" | "FAMILY_FRIENDLY";

export interface HostEvent {
  type: HostEventType;
  context: Record<string, unknown>;
}

export interface HostCommentary {
  eventType: HostEventType;
  text: string;
  source: "LLM" | "CANNED";
}
