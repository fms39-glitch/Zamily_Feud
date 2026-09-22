import { describe, expect, it } from "vitest";
import { BOARD_SIZE, ROOM_CODE_ALPHABET, STRIKES_TO_STEAL } from "./index.js";

describe("shared constants", () => {
  it("has sane gameplay constants", () => {
    expect(BOARD_SIZE).toBe(8);
    expect(STRIKES_TO_STEAL).toBe(3);
    expect(ROOM_CODE_ALPHABET.length).toBeGreaterThan(0);
  });
});
