export const BOARD_SIZE = 8;
export const STRIKES_TO_STEAL = 3;
export const FAST_MONEY_QUESTION_COUNT = 5;

/** Overall window a question stays open for buzzing, from the moment it's revealed (spec: "overall question time"). */
export const BUZZ_WINDOW_MS = 10_000;
/** Once a player buzzes in, how long they have to submit an answer. */
export const ANSWER_WINDOW_MS = 3_000;
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The lobby is a strict 2-team format, 5 players max per team (10 total). */
export const TEAM_COUNT = 2;
export const MAX_PLAYERS_PER_TEAM = 5;
export const TEAM_IDS = ["team-1", "team-2"] as const;
