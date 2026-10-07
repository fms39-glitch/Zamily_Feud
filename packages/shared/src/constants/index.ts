import type { AgeCategory } from "../types/host.js";

export const BOARD_SIZE = 8;
export const STRIKES_TO_STEAL = 3;
export const FAST_MONEY_QUESTION_COUNT = 5;

/** Overall window a question stays open for buzzing, from the moment it's revealed (spec: "overall question time"). */
export const BUZZ_WINDOW_MS = 10_000;
/** AI rooms: how long a new question is on screen (and read aloud) before the buzzer opens. */
export const QUESTION_INTRO_MS = 4_500;
/** Largest player picture accepted, as a data URL. Clients shrink photos to ~10-20 KB first. */
export const AVATAR_MAX_CHARS = 60_000;
/** Once a player buzzes in, how long they have to submit an answer (long enough to type or say it). */
export const ANSWER_WINDOW_MS = 10_000;
/** Speech-to-text runner-up transcripts sent alongside a spoken answer. */
export const MAX_ANSWER_ALTERNATIVES = 3;
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The lobby is a strict 2-team format, 5 players max per team (10 total). */
export const TEAM_COUNT = 2;
export const MAX_PLAYERS_PER_TEAM = 5;
export const TEAM_IDS = ["team-1", "team-2"] as const;

/** Persona choices for the AI host, in display order. */
export const HOST_PERSONAS = [
  { id: "FAMILY_FRIENDLY", label: "Family friendly" },
  { id: "SASSY", label: "Sassy" },
  { id: "MILLENNIAL", label: "Millennial" },
  { id: "GEN_Z", label: "Gen Z" },
] as const satisfies readonly { id: AgeCategory; label: string }[];

export const CHAT_HISTORY_LIMIT = 50;
export const ROOM_EVENT_LIMIT = 20;
export const CHAT_MAX_LENGTH = 200;
/** A team mic auto-releases after this long so nobody can hog it. */
export const MIC_MAX_HOLD_MS = 30_000;

/** The virtual player id the AI host acts as in AI-host rooms. Never a real socket/player. */
export const AI_HOST_ID = "ai-host";
/** How many questions an AI-hosted game runs before the AI host wraps it up. */
export const AI_HOST_DEFAULT_ROUNDS = 5;
