"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CHAT_MAX_LENGTH, MIC_MAX_HOLD_MS } from "@zamily-feud/shared";
import type { RoomSession } from "@zamily-feud/shared";
import type { TeamMic } from "../hooks/useTeamMic";
import Avatar from "./Avatar";

interface ChatPanelProps {
  room: RoomSession;
  selfId: string;
  mic: TeamMic;
  onSend: (text: string) => void;
}

/** The room's shared chat with the AI host, plus the one-per-team "talk to host" mic. */
export default function ChatPanel({ room, selfId, mic, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const self = room.players[selfId];
  const teamId = self?.teamId ?? null;
  const teamHolder = teamId ? room.micHolders[teamId] : null;
  const live = Object.entries(room.micHolders).filter((entry): entry is [string, string] => Boolean(entry[1]));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [room.chat.length, mic.interim]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  let micButton: ReactNode = null;
  if (teamId && mic.supported.voice) {
    if (mic.iHoldMic) {
      micButton = (
        <button onClick={mic.release} className="animate-buzzer-ready rounded bg-red-600 px-3 py-2 font-heading text-sm hover:bg-red-500">
          🎙️ Release mic
        </button>
      );
    } else if (teamHolder) {
      micButton = (
        <span className="rounded bg-navy-800 px-3 py-2 text-xs text-slate-400">
          🎙️ {room.players[teamHolder]?.displayName ?? "A teammate"} has your team&apos;s mic
        </span>
      );
    } else {
      micButton = (
        <button onClick={mic.claim} className="rounded bg-navy-700 px-3 py-2 font-heading text-sm hover:bg-navy-600" title="Talk to the host — everyone hears you live">
          🎙️ Talk to host
        </button>
      );
    }
  }

  return (
    <section className="flex w-full max-w-3xl flex-col rounded-xl border border-navy-700 bg-navy-950/70">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-700 px-3 py-2">
        <h2 className="font-heading tracking-widest text-gold-400">ROOM CHAT</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {live.length === 0 ? (
            <span className="text-slate-500">Mics are open: one per team</span>
          ) : (
            live.map(([tid, pid]) => (
              <span key={tid} className="rounded-full bg-red-600/20 px-2 py-0.5 text-red-300">
                🔴 {room.players[pid]?.displayName} ({room.teams[tid]?.name}) is on the mic
              </span>
            ))
          )}
        </div>
      </header>

      <div ref={listRef} className="h-48 space-y-1.5 overflow-y-auto px-3 py-2 sm:h-56" aria-live="polite">
        {room.chat.length === 0 && <p className="text-sm italic text-slate-500">Say hi to the host or trash-talk the other team…</p>}
        {room.chat.map((m) =>
          m.from === "HOST" ? (
            <p key={m.id} className="text-sm">
              <span className="font-heading tracking-wide text-gold-400">AI HOST </span>
              <span className="text-amber-100">{m.text}</span>
            </p>
          ) : (
            <p key={m.id} className="flex items-start gap-2 text-sm">
              <Avatar playerId={m.playerId} name={m.displayName} teamId={m.teamId} size="xs" />
              <span>
              <span className={`font-semibold ${m.playerId === selfId ? "text-emerald-300" : "text-sky-300"}`}>
                {m.displayName}
                {m.teamId ? <span className="font-normal text-slate-500"> · {room.teams[m.teamId]?.name}</span> : null}
                {m.via === "VOICE" ? " 🎙️" : ""}:{" "}
              </span>
              <span className="text-slate-200">{m.text}</span>
              </span>
            </p>
          ),
        )}
        {mic.iHoldMic && mic.interim && <p className="text-sm italic text-slate-400">🎙️ {mic.interim}…</p>}
      </div>

      {(mic.error || (mic.iHoldMic && !mic.supported.transcript)) && (
        <p className="px-3 text-xs text-red-400">
          {mic.error ?? "Your browser can stream your voice but can't transcribe it, so the host won't hear you. Chrome or Edge can."}
        </p>
      )}
      {mic.iHoldMic && (
        <p className="px-3 text-xs text-slate-400">
          You&apos;re live: everyone hears you, and the host reads what you say. The mic auto-releases after {MIC_MAX_HOLD_MS / 1000}s.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-navy-700 p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Message the room and the host…"
          className="min-w-0 flex-1 rounded border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <button type="submit" disabled={!draft.trim()} className="rounded bg-gold-500 px-3 py-2 font-heading text-sm text-navy-950 hover:bg-gold-400 disabled:opacity-40">
          Send
        </button>
        {micButton}
      </form>
    </section>
  );
}
