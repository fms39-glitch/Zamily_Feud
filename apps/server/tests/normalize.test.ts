import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "../src/matching/normalize.js";

describe("normalizeAnswer", () => {
  it("folds the spec's canonical dog examples to the same value", () => {
    expect(normalizeAnswer(" Dog ")).toBe("dog");
    expect(normalizeAnswer("DOG!")).toBe("dog");
    expect(normalizeAnswer("dog")).toBe("dog");
    expect(normalizeAnswer("dogs")).toBe("dog");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeAnswer("Pots & Pans")).toBe("pot pan");
    expect(normalizeAnswer("  toilet   paper  ")).toBe("toilet paper");
  });

  it("does not over-singularize words ending in ss/us/is", () => {
    expect(normalizeAnswer("Glasses")).toBe("glass");
    expect(normalizeAnswer("Bus")).toBe("bus");
    expect(normalizeAnswer("Tennis")).toBe("tennis");
  });

  it("handles empty and whitespace-only input", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("   ")).toBe("");
  });

  it("can skip singularization when asked", () => {
    expect(normalizeAnswer("dogs", { singular: false })).toBe("dogs");
  });
});
