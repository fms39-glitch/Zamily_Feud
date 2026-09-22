import { readFile } from "node:fs/promises";
import { loadConfig } from "../config/env.js";
import { DATASET_SOURCE_LABEL, DATASET_SOURCE_PATH } from "../config/paths.js";
import { createPool } from "../database/pool.js";
import { parseSourceDataset, type RawDataset } from "../dataset/parseSourceDataset.js";

/**
 * Idempotent: re-running this after edits only changes rows whose content
 * actually changed (ON CONFLICT ... DO UPDATE), and never touches
 * board_answers.embedding — that's dataset:embed's job.
 */
async function main() {
  const config = loadConfig();
  const raw = JSON.parse(await readFile(DATASET_SOURCE_PATH, "utf-8")) as RawDataset;
  const { questions, warnings } = parseSourceDataset(raw, DATASET_SOURCE_LABEL);

  console.log(`Parsed ${questions.length} questions (${warnings.length} warnings). Importing...`);

  const pool = createPool(config);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let importedQuestions = 0;
    let importedAnswers = 0;

    for (const question of questions) {
      const questionResult = await client.query<{ id: string }>(
        `INSERT INTO questions (question_text, source)
         VALUES ($1, $2)
         ON CONFLICT (question_text) DO UPDATE SET source = EXCLUDED.source
         RETURNING id`,
        [question.questionText, question.source],
      );
      const questionId = questionResult.rows[0].id;
      importedQuestions++;

      for (const answer of question.answers) {
        await client.query(
          `INSERT INTO board_answers (question_id, answer_text, normalized_answer, points, rank)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (question_id, rank) DO UPDATE SET
             answer_text = EXCLUDED.answer_text,
             normalized_answer = EXCLUDED.normalized_answer,
             points = EXCLUDED.points`,
          [questionId, answer.answer, answer.normalizedAnswer, answer.points, answer.rank],
        );
        importedAnswers++;
      }
    }

    await client.query("COMMIT");
    console.log(`Imported ${importedQuestions} questions, ${importedAnswers} answers.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
