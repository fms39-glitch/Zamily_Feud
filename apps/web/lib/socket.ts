"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@zamily-feud/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
    socket = io(url, { autoConnect: true });
  }
  return socket;
}
