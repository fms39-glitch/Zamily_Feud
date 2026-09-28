import type { AnswerSuggestion, MatchMethod } from "@zamily-feud/shared";
import { normalizeAnswer } from "./normalize.js";

export interface MatchableAnswer {
  answerId: string;
  answerText: string;
  normalizedAnswer: string;
  points: number;
  rank: number;
  embedding: number[] | null;
}

export interface MatchThresholds {
  fuzzy: number;
  vectorAccept: number;
  vectorReject: number;
}

/** Result of matching. `slotIndex` is an index into the `answers` array passed in — the caller remaps it if needed. */
export type AnswerMatch = AnswerSuggestion;

function bigrams(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return counts;
}

/** Bigram Dice coefficient: 1.0 for identical strings, 0 for no shared bigrams. Cheap, dependency-free fuzzy match. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let intersection = 0;
  for (const [bg, count] of bgA) {
    const other = bgB.get(bg);
    if (other) intersection += Math.min(count, other);
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function noMatch(latencyMs: number): AnswerMatch {
  return { matched: false, method: "NO_MATCH", latencyMs, slotIndex: null, autoAccept: false };
}

/**
 * Tiered matching (spec: exact -> fuzzy -> vector). Always a suggestion for
 * the host, never authoritative — the host is the one who reveals or marks
 * an attempt wrong. `embed` is only called when every candidate answer has
 * an embedding; omit it (or leave some answers unembedded) to skip Tier 3.
 */
export async function matchAnswer(
  submittedText: string,
  answers: MatchableAnswer[],
  thresholds: MatchThresholds,
  embed?: (text: string) => Promise<number[]>,
): Promise<AnswerMatch> {
  const startedAt = Date.now();
  const normalized = normalizeAnswer(submittedText);
  if (!normalized) return noMatch(Date.now() - startedAt);

  const exactIndex = answers.findIndex((a) => a.normalizedAnswer === normalized);
  if (exactIndex !== -1) {
    const a = answers[exactIndex];
    return {
      matched: true,
      answerId: a.answerId,
      matchedAnswer: a.answerText,
      points: a.points,
      rank: a.rank,
      method: "EXACT",
      similarity: 1,
      latencyMs: Date.now() - startedAt,
      slotIndex: exactIndex,
      autoAccept: true,
    };
  }

  let bestFuzzyIndex = -1;
  let bestFuzzyScore = 0;
  answers.forEach((a, i) => {
    const score = diceCoefficient(normalized, a.normalizedAnswer);
    if (score > bestFuzzyScore) {
      bestFuzzyScore = score;
      bestFuzzyIndex = i;
    }
  });
  if (bestFuzzyIndex !== -1 && bestFuzzyScore >= thresholds.fuzzy) {
    const a = answers[bestFuzzyIndex];
    const method: MatchMethod = "FUZZY";
    return {
      matched: true,
      answerId: a.answerId,
      matchedAnswer: a.answerText,
      points: a.points,
      rank: a.rank,
      method,
      similarity: bestFuzzyScore,
      latencyMs: Date.now() - startedAt,
      slotIndex: bestFuzzyIndex,
      autoAccept: true,
    };
  }

  const allEmbedded = answers.length > 0 && answers.every((a) => a.embedding !== null);
  if (allEmbedded && embed) {
    const submittedEmbedding = await embed(normalized);
    let bestVectorIndex = -1;
    let bestVectorScore = -1;
    answers.forEach((a, i) => {
      const score = cosineSimilarity(submittedEmbedding, a.embedding!);
      if (score > bestVectorScore) {
        bestVectorScore = score;
        bestVectorIndex = i;
      }
    });
    if (bestVectorIndex !== -1 && bestVectorScore > thresholds.vectorReject) {
      const a = answers[bestVectorIndex];
      return {
        matched: bestVectorScore >= thresholds.vectorAccept,
        answerId: a.answerId,
        matchedAnswer: a.answerText,
        points: a.points,
        rank: a.rank,
        method: "VECTOR",
        similarity: bestVectorScore,
        latencyMs: Date.now() - startedAt,
        slotIndex: bestVectorIndex,
        autoAccept: bestVectorScore >= thresholds.vectorAccept,
      };
    }
  }

  if (bestFuzzyIndex !== -1 && bestFuzzyScore > 0) {
    const a = answers[bestFuzzyIndex];
    return {
      matched: false,
      answerId: a.answerId,
      matchedAnswer: a.answerText,
      points: a.points,
      rank: a.rank,
      method: "FUZZY",
      similarity: bestFuzzyScore,
      latencyMs: Date.now() - startedAt,
      slotIndex: bestFuzzyIndex,
      autoAccept: false,
    };
  }

  return noMatch(Date.now() - startedAt);
}
