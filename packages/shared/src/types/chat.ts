/** One line in the room's shared chat: a player (typed or spoken via the team mic) or the AI host. */
export interface ChatMessage {
  id: string;
  from: "PLAYER" | "HOST";
  /** null for the host. */
  playerId: string | null;
  displayName: string;
  teamId: string | null;
  text: string;
  /** VOICE = transcribed from the team mic. */
  via: "TEXT" | "VOICE";
  at: number;
}

/** WebRTC signaling relayed by the server between two players in the same room (offer/answer SDP or an ICE candidate). */
export type RtcSignal =
  | { kind: "description"; description: { type: "offer" | "answer"; sdp: string } }
  | { kind: "ice"; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };
