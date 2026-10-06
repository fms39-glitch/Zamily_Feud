import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { loadConfig } from "./config/env.js";
import { createPool } from "./database/pool.js";
import { createDatabaseQuestionSource } from "./dataset/questionSource.js";
import { getEmbeddingProvider } from "./providers/embedding/index.js";
import { RoomStore } from "./rooms/roomStore.js";
import { createSocketServer } from "./realtime/socketServer.js";
import { ClaudeHostBrain } from "./host/claudeBrain.js";
import { CannedHostBrain } from "./host/cannedBrain.js";

const config = loadConfig();

const app = express();
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);

const embeddingProvider = config.DATABASE_URL ? getEmbeddingProvider(config) : undefined;
// Load the local embedding model now rather than on the first answer of the night (it takes seconds).
embeddingProvider?.embed(["warm up"]).then(
  () => console.log(JSON.stringify({ event: "EMBEDDINGS_READY" })),
  (err: Error) => console.error(JSON.stringify({ event: "EMBEDDINGS_WARMUP_FAILED", message: err.message })),
);

// The question dataset lives in Postgres; without DATABASE_URL the game
// engine still runs, it just can't start a question (a clear host-facing
// error rather than a crash).
const roomStore = new RoomStore(
  config.DATABASE_URL
    ? {
        questionSource: createDatabaseQuestionSource(createPool(config)),
        embeddingProvider,
        thresholds: {
          fuzzy: config.FUZZY_MATCH_THRESHOLD,
          vectorAccept: config.VECTOR_AUTO_ACCEPT_THRESHOLD,
          vectorReject: config.VECTOR_AUTO_REJECT_THRESHOLD,
        },
        stealConferenceMs: config.STEAL_TIMER_SECONDS * 1000,
        aiTotalRounds: config.AI_HOST_ROUNDS,
      }
    : { aiTotalRounds: config.AI_HOST_ROUNDS },
);

// The AI host is Claude when a key is configured; the canned host always backs it up
// (and runs AI-hosted rooms on its own when there's no key).
const llmApiKey = config.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
const llmBrain =
  llmApiKey && config.LLM_PROVIDER === "anthropic"
    ? new ClaudeHostBrain({ apiKey: llmApiKey, model: config.LLM_MODEL, timeoutMs: config.LLM_TIMEOUT_MS, effort: config.LLM_EFFORT })
    : null;
console.log(JSON.stringify({ event: "AI_HOST_CONFIGURED", brain: llmBrain ? "LLM" : "CANNED", model: llmBrain ? config.LLM_MODEL : null }));

const { aiHost } = createSocketServer(httpServer, config, roomStore, { llm: llmBrain, canned: new CannedHostBrain() });

const SWEEP_INTERVAL_MS = 30_000;
setInterval(() => {
  const expired = roomStore.sweepExpired(config.ROOM_TTL_SECONDS);
  for (const roomId of expired) {
    aiHost.forget(roomId);
    console.log(JSON.stringify({ event: "ROOM_EXPIRED", roomId, timestamp: Date.now() }));
  }
}, SWEEP_INTERVAL_MS);

httpServer.listen(config.PORT, () => {
  console.log(JSON.stringify({ event: "SERVER_STARTED", port: config.PORT, env: config.NODE_ENV }));
});
