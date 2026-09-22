import { loadConfig } from "../config/env.js";
import { createPool } from "../database/pool.js";
import { CURRENT_EMBEDDING_VERSION, getEmbeddingProvider } from "../providers/embedding/index.js";

const BATCH_SIZE = 64;

interface PendingRow {
  id: string;
  normalized_answer: string;
}

/**
 * Idempotent: only (re)embeds rows missing an embedding, or whose stored
 * embedding_model/embedding_version no longer matches the configured
 * provider (spec §30/31) — a model swap or version bump re-embeds
 * everything, an unchanged rerun embeds nothing.
 */
async function main() {
  const config = loadConfig();
  const provider = getEmbeddingProvider(config);

  if (provider.dimension !== config.EMBEDDING_DIMENSION) {
    throw new Error(
      `EMBEDDING_DIMENSION (${config.EMBEDDING_DIMENSION}) does not match provider "${provider.modelName}" (${provider.dimension}). Update .env or the schema.`,
    );
  }

  const pool = createPool(config);
  try {
    const { rows: pending } = await pool.query<PendingRow>(
      `SELECT id, normalized_answer FROM board_answers
       WHERE embedding IS NULL
          OR embedding_model IS DISTINCT FROM $1
          OR embedding_version IS DISTINCT FROM $2`,
      [provider.modelName, CURRENT_EMBEDDING_VERSION],
    );

    console.log(`${pending.length} answer(s) need embedding with ${provider.modelName} v${CURRENT_EMBEDDING_VERSION}.`);
    if (pending.length === 0) return;

    let done = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const vectors = await provider.embed(batch.map((row) => row.normalized_answer));

      await Promise.all(
        batch.map((row, idx) =>
          pool.query(
            `UPDATE board_answers SET embedding = $1, embedding_model = $2, embedding_version = $3 WHERE id = $4`,
            [`[${vectors[idx].join(",")}]`, provider.modelName, CURRENT_EMBEDDING_VERSION, row.id],
          ),
        ),
      );

      done += batch.length;
      console.log(`Embedded ${done}/${pending.length}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
