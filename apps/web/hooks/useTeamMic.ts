"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSession, RtcSignal, RtcSignalPayload } from "@zamily-feud/shared";
import { getSocket } from "../lib/socket";
import { SPEECH_ERROR_MESSAGES, getRecognitionCtor, type Recognition } from "./useSpeechAnswer";

/** STUN is enough on most home networks; set NEXT_PUBLIC_ICE_SERVERS (JSON RTCIceServer[]) to add a TURN relay for strict ones. */
function iceServers(): RTCIceServer[] {
  try {
    const custom = process.env.NEXT_PUBLIC_ICE_SERVERS;
    if (custom) return JSON.parse(custom) as RTCIceServer[];
  } catch {
    // Fall through to the default.
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

function iceSignal(c: RTCIceCandidate): RtcSignal {
  return { kind: "ice", candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } };
}

function sendSignal(peerId: string, direction: RtcSignalPayload["direction"], signal: RtcSignal) {
  getSocket().emit("RTC_SIGNAL", { peerId, direction, signal });
}

interface Listening {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
}

/**
 * The talk-to-host team mic. Whoever holds their team's mic:
 *  - streams their live voice to every other player's browser (WebRTC, device to device; the
 *    server only relays the connection setup), and
 *  - has their speech transcribed into the chat, which is how the AI host "hears" them.
 * Every other player automatically receives and plays the holders' audio.
 */
export function useTeamMic(room: RoomSession | null, selfId: string | null) {
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [supported, setSupported] = useState({ voice: false, transcript: false });

  const outgoing = useRef(new Map<string, RTCPeerConnection>()); // I hold a mic -> each listener
  const incoming = useRef(new Map<string, Listening>()); // each mic holder -> me
  const signalChains = useRef(new Map<string, Promise<void>>());
  const localStream = useRef<MediaStream | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const holdingRef = useRef(false);
  const huddleRef = useRef(false);

  const selfTeam = room && selfId ? room.players[selfId]?.teamId ?? null : null;
  const iHoldMic = Boolean(room && selfTeam && room.micHolders[selfTeam] === selfId);
  const holderIds = room ? Object.values(room.micHolders).filter((id): id is string => Boolean(id)) : [];
  const holderKey = holderIds.sort().join(",");
  // While my team huddles to steal, my voice reaches only my teammates (the server enforces this too).
  const stealing = Boolean(room && selfTeam && selfTeam === room.controllingTeamId);
  const privateAudio = stealing && room?.phase === "STEAL_CONFERENCE";
  huddleRef.current = stealing && (room?.phase === "STEAL_CONFERENCE" || room?.phase === "STEAL_ATTEMPT");
  const peerIds =
    room && selfId
      ? Object.values(room.players)
          .filter((p) => p.connected && p.id !== selfId && (!privateAudio || p.teamId === selfTeam))
          .map((p) => p.id)
      : [];
  const peerKey = peerIds.sort().join(",");
  holdingRef.current = iHoldMic;

  useEffect(() => {
    setSupported({
      voice: typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && "RTCPeerConnection" in window,
      transcript: getRecognitionCtor() !== null,
    });
  }, []);

  // --- Receiving side, plus answers to my own offers. Signals per peer run strictly in order.
  useEffect(() => {
    const socket = getSocket();
    async function handle({ peerId, direction, signal }: RtcSignalPayload) {
      if (direction === "toListener") {
        if (signal.kind === "description" && signal.description.type === "offer") {
          incoming.current.get(peerId)?.pc.close();
          const pc = new RTCPeerConnection({ iceServers: iceServers() });
          const audio = new Audio();
          audio.autoplay = true;
          pc.ontrack = (e) => {
            audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
            void audio.play().catch(() => setError("Tap anywhere to hear your teammates' mic."));
          };
          pc.onicecandidate = (e) => e.candidate && sendSignal(peerId, "toHolder", iceSignal(e.candidate));
          incoming.current.set(peerId, { pc, audio });
          await pc.setRemoteDescription(signal.description);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(peerId, "toHolder", { kind: "description", description: { type: "answer", sdp: answer.sdp ?? "" } });
        } else if (signal.kind === "ice") {
          await incoming.current.get(peerId)?.pc.addIceCandidate(signal.candidate).catch(() => {});
        }
      } else {
        const pc = outgoing.current.get(peerId);
        if (!pc) return;
        if (signal.kind === "description" && signal.description.type === "answer") await pc.setRemoteDescription(signal.description);
        else if (signal.kind === "ice") await pc.addIceCandidate(signal.candidate).catch(() => {});
      }
    }
    const onSignal = (payload: RtcSignalPayload) => {
      const prev = signalChains.current.get(payload.peerId) ?? Promise.resolve();
      signalChains.current.set(
        payload.peerId,
        prev.then(() => handle(payload)).catch((err: Error) => console.warn("mic signal failed", err.message)),
      );
    };
    socket.on("RTC_SIGNAL", onSignal);
    return () => {
      socket.off("RTC_SIGNAL", onSignal);
    };
  }, []);

  // Stop playing anyone who no longer holds a mic.
  useEffect(() => {
    const holders = new Set(holderKey ? holderKey.split(",") : []);
    for (const [peerId, { pc, audio }] of incoming.current) {
      if (!holders.has(peerId)) {
        pc.close();
        audio.srcObject = null;
        incoming.current.delete(peerId);
      }
    }
  }, [holderKey]);

  // --- Holding side: open the mic, transcribe it, and stream it while I hold my team's mic.
  useEffect(() => {
    if (!iHoldMic) return;
    let cancelled = false;
    window.speechSynthesis?.cancel(); // don't talk over (or transcribe) the host

    if (supported.voice) {
      navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .then((stream) => {
          if (cancelled) return stream.getTracks().forEach((t) => t.stop());
          localStream.current = stream;
          setStreamReady(true);
        })
        .catch(() => setError(SPEECH_ERROR_MESSAGES["not-allowed"]));
    }

    const Ctor = getRecognitionCtor();
    if (Ctor) {
      const start = () => {
        const rec = new Ctor();
        rec.lang = navigator.language || "en-US";
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          let partial = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const text = e.results[i][0]?.transcript.trim() ?? "";
            if (e.results[i].isFinal) {
              // Huddle talk goes to the team's private chat; otherwise to the room (and the host).
              if (text) getSocket().emit(huddleRef.current ? "TEAM_CHAT_SEND" : "CHAT_SEND", { text, via: "VOICE" }, () => {});
            } else partial += text;
          }
          setInterim(partial);
        };
        rec.onerror = (e) => {
          if (e.error !== "aborted" && e.error !== "no-speech") setError(SPEECH_ERROR_MESSAGES[e.error] ?? "Voice transcription stopped.");
        };
        // Chrome ends continuous recognition after a pause; keep listening for as long as the mic is held.
        rec.onend = () => {
          setInterim("");
          if (!cancelled && holdingRef.current) start();
        };
        recognition.current = rec;
        rec.start();
      };
      start();
    }

    return () => {
      cancelled = true;
      recognition.current?.abort();
      recognition.current = null;
      setInterim("");
      for (const pc of outgoing.current.values()) pc.close();
      outgoing.current.clear();
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      setStreamReady(false);
    };
  }, [iHoldMic, supported.voice]);

  // Call every connected player (including late joiners) once my mic stream is up; drop ones who left.
  useEffect(() => {
    const stream = localStream.current;
    if (!iHoldMic || !streamReady || !stream) return;
    const peers = new Set(peerKey ? peerKey.split(",") : []);
    for (const [peerId, pc] of outgoing.current) {
      if (!peers.has(peerId)) {
        pc.close();
        outgoing.current.delete(peerId);
      }
    }
    for (const peerId of peers) {
      if (outgoing.current.has(peerId)) continue;
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => e.candidate && sendSignal(peerId, "toListener", iceSignal(e.candidate));
      outgoing.current.set(peerId, pc);
      void pc
        .createOffer()
        .then(async (offer) => {
          await pc.setLocalDescription(offer);
          sendSignal(peerId, "toListener", { kind: "description", description: { type: "offer", sdp: offer.sdp ?? "" } });
        })
        .catch((err: Error) => console.warn("mic offer failed", err.message));
    }
  }, [iHoldMic, streamReady, peerKey]);

  // Leaving the room or closing the tab: hang up everything.
  useEffect(
    () => () => {
      for (const { pc } of incoming.current.values()) pc.close();
      for (const pc of outgoing.current.values()) pc.close();
    },
    [],
  );

  const claim = useCallback(() => {
    setError(null);
    getSocket().emit("MIC_CLAIM", {}, (res) => {
      if ("code" in res) setError(res.message);
    });
  }, []);

  const release = useCallback(() => {
    getSocket().emit("MIC_RELEASE", {}, () => {});
  }, []);

  return { iHoldMic, claim, release, interim, error, supported };
}

export type TeamMic = ReturnType<typeof useTeamMic>;
