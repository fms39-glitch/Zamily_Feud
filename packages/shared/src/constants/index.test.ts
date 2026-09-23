import { describe, expect, it } from "vitest";
import { BOARD_SIZE, MAX_PLAYERS_PER_TEAM, ROOM_CODE_ALPHABET, STRIKES_TO_STEAL, TEAM_COUNT, TEAM_IDS } from "./index.js";

describe("shared constants", () => {
  it("has sane gameplay constants", () => {
    expect(BOARD_SIZE).toBe(8);
    expect(STRIKES_TO_STEAL).toBe(3);
    expect(ROOM_CODE_ALPHABET.length).toBeGreaterThan(0);
  });

  it("locks the lobby to a strict 2-team, 5-per-team format", () => {
    expect(TEAM_COUNT).toBe(2);
    expect(MAX_PLAYERS_PER_TEAM).toBe(5);
    expect(TEAM_IDS).toHaveLength(2);
  });
});
