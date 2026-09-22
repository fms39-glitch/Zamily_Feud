import { describe, expect, it } from "vitest";
import { parseSourceDataset, type RawDataset } from "../src/dataset/parseSourceDataset.js";

describe("parseSourceDataset", () => {
  it("parses answers, derives rank from points, and normalizes text", () => {
    const raw: RawDataset = {
      "Name something you associate with Egypt": [
        ["Pyramids", "77"],
        ["Sphinx", "7"],
        ["Camels", "4"],
      ],
    };
    const { questions, warnings } = parseSourceDataset(raw, "test-source");
    expect(questions).toHaveLength(1);
    const [q] = questions;
    expect(q.questionText).toBe("Name something you associate with Egypt");
    expect(q.source).toBe("test-source");
    expect(q.answers.map((a) => a.rank)).toEqual([1, 2, 3]);
    expect(q.answers[0]).toMatchObject({ answer: "Pyramids", normalizedAnswer: "pyramid", points: 77, rank: 1 });
    expect(warnings.some((w) => w.includes("fewer than a full board"))).toBe(true);
  });

  it("re-derives rank from points rather than trusting input order", () => {
    const raw: RawDataset = {
      Q: [
        ["Low", "1"],
        ["High", "99"],
      ],
    };
    const { questions } = parseSourceDataset(raw, "test");
    expect(questions[0].answers[0].answer).toBe("High");
    expect(questions[0].answers[0].rank).toBe(1);
  });

  it("skips invalid answers but keeps the valid ones", () => {
    const raw: RawDataset = {
      Q: [
        ["Good", "10"],
        ["Bad Points", "not-a-number"],
        ["", "5"],
      ],
    };
    const { questions, warnings } = parseSourceDataset(raw, "test");
    expect(questions[0].answers).toHaveLength(1);
    expect(warnings.some((w) => w.includes("Skipped invalid answer"))).toBe(true);
  });

  it("merges duplicate normalized answers, keeping the higher points", () => {
    const raw: RawDataset = {
      Q: [
        ["Dog", "5"],
        ["dogs", "10"],
      ],
    };
    const { questions, warnings } = parseSourceDataset(raw, "test");
    expect(questions[0].answers).toHaveLength(1);
    expect(questions[0].answers[0]).toMatchObject({ answer: "dogs", points: 10 });
    expect(warnings.some((w) => w.includes("Duplicate answer"))).toBe(true);
  });

  it("skips questions with empty text or no valid answers entirely", () => {
    const raw: RawDataset = {
      "  ": [["Anything", "5"]],
      "No valid answers": [["", "5"]],
    };
    const { questions, warnings } = parseSourceDataset(raw, "test");
    expect(questions).toHaveLength(0);
    expect(warnings.some((w) => w.includes("empty text"))).toBe(true);
    expect(warnings.some((w) => w.includes("no valid answers"))).toBe(true);
  });
});
