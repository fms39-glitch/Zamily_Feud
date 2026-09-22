import { readFile } from "node:fs/promises";
import { loadConfig } from "../config/env.js";
import { DATASET_SOURCE_LABEL, DATASET_SOURCE_PATH } from "../config/paths.js";
import { createPool } from "../database/pool.js";
import { parseSourceDataset, type RawDataset } from "../dataset/parseSourceDataset.js";

/**
 * Sanity-checks the dataset. Always validates the raw source JSON; if
 * DATABASE_URL is set, also checks that the DB matches what the source
 * would produce and reports embedding coverage.
 */
async function main() {
  const config = loadConfig();
  const raw = JSON.parse(await readFile(DATASET_SOURCE_PATH, "utf-8")) as RawDataset;
  const { questions, warnings } = parseSourceDataset(raw, DATASET_SOURCE_LABEL);
  const expectedAnswers = questions.reduce((sum, q) => sum + q.answers.length, 0);

  const failures: string[] = [];

  console.log(`Source: ${questions.length} questions, ${expectedAnswers} answers, ${warnings.length} warnings.`);

  const questionsWithFewAnswers = questions.filter((q) => q.answers.length < 8).length;
  console.log(`${questionsWithFewAnswers} question(s) have fewer than 8 answers (allowed, just flagged).`);

  if (!config.DATABASE_URL) {
    console.log("\nDATABASE_URL not set — skipping DB-level checks.");
  } else {
    const pool = createPool(config);
    try {
      const [{ rows: qc }, { rows: ac }, { rows: embedded }, { rows: badRanks }] = await Promise.all([
        pool.query<{ count: string }>("SELECT count(*) FROM questions"),
        pool.query<{ count: string }>("SELECT count(*) FROM board_answers"),
        pool.query<{ count: string }>("SELECT count(*) FROM board_answers WHERE embedding IS NOT NULL"),
        pool.query<{ question_id: string; rank: number; n: string }>(
          "SELECT question_id, rank, count(*) as n FROM board_answers GROUP BY question_id, rank HAVING count(*) > 1",
        ),
      ]);

      const dbQuestionCount = Number(qc[0].count);
      const dbAnswerCount = Number(ac[0].count);
      const embeddedCount = Number(embedded[0].count);

      console.log(`\nDB: ${dbQuestionCount} questions, ${dbAnswerCount} answers, ${embeddedCount} embedded.`);

      if (dbQuestionCount !== questions.length) {
        failures.push(`DB has ${dbQuestionCount} questions, source produces ${questions.length}. Run dataset:import.`);
      }
      if (dbAnswerCount !== expectedAnswers) {
        failures.push(`DB has ${dbAnswerCount} answers, source produces ${expectedAnswers}. Run dataset:import.`);
      }
      if (badRanks.length > 0) {
        failures.push(`${badRanks.length} (question_id, rank) pair(s) are duplicated — data integrity bug.`);
      }
      if (embeddedCount < dbAnswerCount) {
        console.log(`${dbAnswerCount - embeddedCount} answer(s) still need embedding. Run dataset:embed.`);
      }
    } finally {
      await pool.end();
    }
  }

  if (failures.length > 0) {
    console.log("\nFAILED:");
    for (const failure of failures) console.log(" -", failure);
    process.exit(1);
  }
  console.log("\nOK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
