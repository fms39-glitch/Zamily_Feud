-- Permanent, read-only game dataset. Never store player/session/gameplay
-- data in this database — that all lives in the server's in-memory
-- RoomStore and is destroyed with the room.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- embedding dimension must match EMBEDDING_DIMENSION in .env. Default here
-- (384) matches the local Xenova/all-MiniLM-L6-v2 model used out of the box;
-- see docs/dataset.md before changing either value.
CREATE TABLE IF NOT EXISTS board_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    normalized_answer TEXT NOT NULL,
    points INTEGER NOT NULL CHECK (points >= 0),
    rank INTEGER NOT NULL CHECK (rank >= 1),
    embedding VECTOR(384),
    embedding_model TEXT,
    embedding_version INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (question_id, rank),
    UNIQUE (question_id, normalized_answer)
);

CREATE INDEX IF NOT EXISTS board_answers_question_id_idx ON board_answers (question_id);

-- Cosine distance index for Tier-2 semantic matching. Only ever queried
-- WHERE question_id = $1 (spec: never a global vector search).
CREATE INDEX IF NOT EXISTS board_answers_embedding_hnsw_idx
    ON board_answers USING hnsw (embedding vector_cosine_ops);
