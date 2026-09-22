import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { loadConfig } from "./config/env.js";
import { RoomStore } from "./rooms/roomStore.js";
import { createSocketServer } from "./realtime/socketServer.js";

const config = loadConfig();

const app = express();
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
const roomStore = new RoomStore();
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
