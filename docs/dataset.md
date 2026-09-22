# Dataset

## Source

`database/seed/source/FamilyFeud_Questions.json`, from the
[MacEvelly/Family_Feud](https://github.com/MacEvelly/Family_Feud) dataset.

Raw shape (inspected, not assumed):

```json
{ "Name something you associate with Egypt": [["Pyramids", "77"], ["Sphinx", "7"], ...] }
```

A flat object keyed by question text, each value an array of `[answerText, pointsAsString]`
pairs. No IDs, no explicit rank, no normalized form — all derived by the importer.

- 1,977 questions, 12,085 answers total, average 6.1 answers/question (range 1–12).
- Rank is **re-derived by sorting on points**, never trusted from array order.
- Duplicate answers within a question (same normalized form, e.g. "Dog" / "dogs") are merged,
  keeping the higher point value.
- Questions with fewer than 8 answers are kept (not excluded) but flagged as warnings —
  1,534 of the 1,977 questions fall short of a full 8-slot board. Game logic that requires a
  full board should filter on `answers.length >= 8` at question-selection time, not assume
  every row in the dataset qualifies.

## Normalization

`apps/server/src/matching/normalize.ts` — trim, Unicode NFKD-fold + strip diacritics,
lowercase, strip punctuation, collapse whitespace, then a conservative per-word
singularization (`dogs` -> `dog`, `glasses` -> `glass`, but `bus`/`tennis` are left alone).
This is a heuristic, not a lemmatizer — used only for the exact/near-exact matching tier, so
occasional odd folds (e.g. "lens" -> "len") are harmless as long as the same function is
applied to both the stored answer and the player's input, which it always is.

## Embedding model

| Setting | Value |
|---|---|
| Provider | `local` — `@huggingface/transformers` running on-device, no API key, no network call per embedding |
| Model | `Xenova/all-MiniLM-L6-v2` |
| Dimension | 384 |
| Embedding version | 1 (bump `CURRENT_EMBEDDING_VERSION` in `apps/server/src/providers/embedding/index.ts` and re-run `dataset:embed` if the model or preprocessing changes) |

Chosen because it's free and requires no signup — reasonable for this project's scale. If
higher recall is ever needed, swap in a hosted provider by implementing `EmbeddingProvider`
and updating `EMBEDDING_PROVIDER`/`EMBEDDING_MODEL`/`EMBEDDING_DIMENSION`; the `vector(384)`
column and its index would need a new migration to match the new dimension.

Verified empirically (not guessed) against the pgvector cosine-similarity column:

| Pair | Cosine similarity |
|---|---|
| dog / puppy | 0.80 |
| dog / cat | 0.66 |
| dog / pyramid | 0.18 |

This is why `VECTOR_AUTO_ACCEPT_THRESHOLD=0.90` / `VECTOR_AUTO_REJECT_THRESHOLD=0.60`
(`.env.example`) land "puppy vs dog" and "cat vs dog" in the LLM boundary zone rather than
auto-accepting or auto-rejecting them — which matches the spec's own canonical example of a
case the LLM tier should adjudicate.

## Scripts

Run from `apps/server`:

| Script | Needs `DATABASE_URL` | Purpose |
|---|---|---|
| `npm run dataset:normalize` | No | Dry-run: parse + normalize the source JSON, print a sample and warnings |
| `npm run dataset:import` | Yes | Idempotent upsert of questions/answers into Postgres |
| `npm run dataset:embed` | Yes | Idempotent: embeds any answer missing an embedding or on a stale model/version |
| `npm run dataset:validate` | Optional | Sanity-checks the source JSON; with `DATABASE_URL` set, also checks DB row counts and embedding coverage match |

## Schema

See `database/migrations/0001_init.sql`. `questions` and `board_answers` only — no player,
session, or gameplay data ever lives in this database (see the root README's Ephemeral Data
section).
