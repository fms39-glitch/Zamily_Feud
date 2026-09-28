import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { loadConfig } from "./config/env.js";
import { createPool } from "./database/pool.js";
import { createDatabaseQuestionSource } from "./dataset/questionSource.js";
import { getEmbeddingProvider } from "./providers/embedding/index.js";
import { RoomStore } from "./rooms/roomStore.js";
import { createSocketServer } from "./realtime/socketServer.js";

const config = loadConfig();

const app = express();
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);

// The question dataset lives in Postgres; without DATABASE_URL the game
// engine still runs, it just can't start a question (a clear host-facing
// error rather than a crash).
const roomStore = new RoomStore(
  config.DATABASE_URL
    ? {
        questionSource: createDatabaseQuestionSource(createPool(config)),
        embeddingProvider: getEmbeddingProvider(config),
        thresholds: {
          fuzzy: config.FUZZY_MATCH_THRESHOLD,
          vectorAccept: config.VECTOR_AUTO_ACCEPT_THRESHOLD,
          vectorReject: config.VECTOR_AUTO_REJECT_THRESHOLD,
        },
        stealConferenceMs: config.STEAL_TIMER_SECONDS * 1000,
      }
    : {},
);
createSocketServer(httpServer, config, roomStore);

const SWEEP_INTERVAL_MS = 30_000;
setInterval(() => {
  const expired = roomStore.sweepExpired(config.ROOM_TTL_SECONDS);
  for (const roomId of expired) {
    console.log(JSON.stringify({ event: "ROOM_EXPIRED", roomId, timestamp: Date.now() }));
  }
}, SWEEP_INTERVAL_MS);

httpServer.listen(config.PORT, () => {
  console.log(JSON.stringify({ event: "SERVER_STARTED", port: config.PORT, env: config.NODE_ENV }));
});
