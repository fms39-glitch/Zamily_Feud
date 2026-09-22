import { readFile } from "node:fs/promises";
import { DATASET_SOURCE_LABEL, DATASET_SOURCE_PATH } from "../config/paths.js";
import { parseSourceDataset, type RawDataset } from "../dataset/parseSourceDataset.js";

/** Dry run: parses and normalizes the source dataset without touching a database. */
async function main() {
  const raw = JSON.parse(await readFile(DATASET_SOURCE_PATH, "utf-8")) as RawDataset;
  const { questions, warnings } = parseSourceDataset(raw, DATASET_SOURCE_LABEL);

  const totalAnswers = questions.reduce((sum, q) => sum + q.answers.length, 0);
  console.log(`Parsed ${questions.length} questions, ${totalAnswers} answers, ${warnings.length} warnings.`);
  console.log("\nSample question:");
  console.log(JSON.stringify(questions[0], null, 2));

  if (warnings.length > 0) {
    console.log(`\nFirst 10 of ${warnings.length} warnings:`);
    for (const warning of warnings.slice(0, 10)) console.log(" -", warning);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
