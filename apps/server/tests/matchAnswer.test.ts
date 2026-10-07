import { describe, expect, it } from "vitest";
import { editDistance, isLikelyTypo, matchAnswer, type MatchableAnswer } from "../src/matching/matchAnswer.js";
import { normalizeAnswer } from "../src/matching/normalize.js";

const THRESHOLDS = { fuzzy: 0.82, vectorAccept: 0.8, vectorReject: 0.6 };

function board(...texts: string[]): MatchableAnswer[] {
  return texts.map((t, i) => ({
    answerId: `a${i}`,
    answerText: t,
    normalizedAnswer: normalizeAnswer(t),
    points: 40 - i * 10,
    rank: i + 1,
    embedding: null,
  }));
}

describe("typo tier", () => {
  it("counts missing, extra, swapped, and substituted letters as one edit", () => {
    expect(editDistance("coutch", "couch")).toBe(1);
    expect(editDistance("pancaks", "pancakes")).toBe(1);
    expect(editDistance("hosue", "house")).toBe(1);
    expect(editDistance("horse", "house")).toBe(1);
    expect(editDistance("cat", "dog")).toBe(3);
  });

  it("accepts one slipped key but not short words that flip meaning", () => {
    expect(isLikelyTypo("coutch", "couch")).toBe(true);
    expect(isLikelyTypo("pancaks", "pancakes")).toBe(true);
    expect(isLikelyTypo("hosue", "house")).toBe(true);
    expect(isLikelyTypo("televisoin", "television")).toBe(true);
    expect(isLikelyTypo("televisian", "television")).toBe(true);
    expect(isLikelyTypo("horse", "house")).toBe(false);
    expect(isLikelyTypo("beer", "bear")).toBe(false);
    expect(isLikelyTypo("cat", "car")).toBe(false);
  });

  it("auto-accepts a typo before reaching the embedding tier", async () => {
    const result = await matchAnswer("coutch", board("Bed", "Couch", "Chair"), THRESHOLDS);
    expect(result).toMatchObject({ matched: true, autoAccept: true, slotIndex: 1, matchedAnswer: "Couch" });
  });

  it("doesn't accept a different word one letter away", async () => {
    const result = await matchAnswer("horse", board("House", "Car"), THRESHOLDS);
    expect(result.autoAccept).toBe(false);
  });
});

describe("meaning tier", () => {
  it("auto-accepts a synonym at the 0.80 threshold and leaves weaker ones to the host", async () => {
    const answers = board("Couch", "Chair").map((a, i) => ({ ...a, embedding: i === 0 ? [1, 0] : [0, 1] }));
    const sofa = await matchAnswer("sofa", answers, THRESHOLDS, async () => [0.86, Math.sqrt(1 - 0.86 ** 2)]);
    expect(sofa).toMatchObject({ method: "VECTOR", autoAccept: true, slotIndex: 0 });
    const weak = await matchAnswer("lamp", answers, THRESHOLDS, async () => [0.73, Math.sqrt(1 - 0.73 ** 2)]);
    expect(weak.autoAccept).toBe(false);
  });
});
