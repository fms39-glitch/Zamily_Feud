import type { Pool } from "pg";
import { BOARD_SIZE } from "@zamily-feud/shared";

export interface QuestionAnswerRow {
  answerId: string;
  answerText: string;
  normalizedAnswer: string;
  points: number;
  rank: number;
  embedding: number[] | null;
}

export interface QuestionWithAnswers {
  id: string;
  questionText: string;
  answers: QuestionAnswerRow[];
}

export interface QuestionSource {
  /** Picks a random question not in excludeIds, with its top BOARD_SIZE answers. Null once the dataset is exhausted. */
  pickQuestion(excludeIds: Iterable<string>): Promise<QuestionWithAnswers | null>;
}

/** pgvector comes back over the wire as "[0.1,0.2,...]" text unless a custom type parser is registered. */
function parseVector(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    return raw
      .slice(1, -1)
      .split(",")
      .filter((s) => s.length > 0)
      .map(Number);
  }
  return null;
}

export function createDatabaseQuestionSource(pool: Pool): QuestionSource {
  return {
    async pickQuestion(excludeIds) {
      const excluded = Array.from(excludeIds);
      const { rows: questionRows } = await pool.query<{ id: string; question_text: string }>(
        `SELECT id, question_text FROM questions WHERE id <> ALL($1::uuid[]) ORDER BY random() LIMIT 1`,
        [excluded],
      );
      if (questionRows.length === 0) return null;
      const { id, question_text: questionText } = questionRows[0];

      const { rows: answerRows } = await pool.query<{
        id: string;
        answer_text: string;
        normalized_answer: string;
        points: number;
        rank: number;
        embedding: unknown;
      }>(
        `SELECT id, answer_text, normalized_answer, points, rank, embedding
         FROM board_answers WHERE question_id = $1 ORDER BY rank ASC LIMIT $2`,
        [id, BOARD_SIZE],
      );

      return {
        id,
        questionText,
        answers: answerRows.map((r) => ({
          answerId: r.id,
          answerText: r.answer_text,
          normalizedAnswer: r.normalized_answer,
          points: r.points,
          rank: r.rank,
          embedding: parseVector(r.embedding),
        })),
      };
    },
  };
}
