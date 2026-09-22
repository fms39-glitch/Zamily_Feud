import { normalizeAnswer } from "../matching/normalize.js";

/** Raw shape of database/seed/source/FamilyFeud_Questions.json: question -> [[answerText, pointsAsString], ...] */
export type RawDataset = Record<string, [string, string][]>;

export interface ParsedAnswer {
  answer: string;
  normalizedAnswer: string;
  points: number;
  rank: number;
}

export interface ParsedQuestion {
  questionText: string;
  source: string;
  answers: ParsedAnswer[];
}

export interface ParseResult {
  questions: ParsedQuestion[];
  warnings: string[];
}

/**
 * Converts the raw source dataset into our normalized shape: points parsed
 * to integers, rank re-derived by sorting on points (never trusting array
 * order), and a normalizedAnswer for exact/near-exact matching. Duplicate
 * answers within one question (by normalized form) are merged, keeping the
 * higher point value.
 */
export function parseSourceDataset(raw: RawDataset, source: string): ParseResult {
  const warnings: string[] = [];
  const questions: ParsedQuestion[] = [];

  for (const [questionText, rawAnswers] of Object.entries(raw)) {
    const trimmedQuestion = questionText.trim();
    if (!trimmedQuestion) {
      warnings.push("Skipped a question with empty text.");
      continue;
    }

    const byNormalized = new Map<string, { answer: string; points: number }>();
    for (const [answerText, pointsStr] of rawAnswers) {
      const answer = answerText.trim();
      const points = Number.parseInt(pointsStr, 10);
      if (!answer || Number.isNaN(points) || points < 0) {
        warnings.push(`Skipped invalid answer "${answerText}" / "${pointsStr}" for question: ${trimmedQuestion}`);
        continue;
      }
      const normalized = normalizeAnswer(answer);
      const existing = byNormalized.get(normalized);
      if (existing) {
        warnings.push(
          `Duplicate answer "${answer}" (normalized "${normalized}") for question: ${trimmedQuestion} — keeping the higher point value.`,
        );
        if (points > existing.points) byNormalized.set(normalized, { answer, points });
      } else {
        byNormalized.set(normalized, { answer, points });
      }
    }

    if (byNormalized.size === 0) {
      warnings.push(`Skipped question with no valid answers: ${trimmedQuestion}`);
      continue;
    }

    const sorted = [...byNormalized.entries()].sort((a, b) => b[1].points - a[1].points);
    const answers: ParsedAnswer[] = sorted.map(([normalizedAnswer, { answer, points }], index) => ({
      answer,
      normalizedAnswer,
      points,
      rank: index + 1,
    }));

    if (answers.length < 8) {
      warnings.push(`Question has only ${answers.length} answer(s), fewer than a full board: ${trimmedQuestion}`);
    }

    questions.push({ questionText: trimmedQuestion, source, answers });
  }

  return { questions, warnings };
}
