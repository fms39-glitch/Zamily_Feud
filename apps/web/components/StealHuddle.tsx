"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH } from "@zamily-feud/shared";
import type { ChatMessage, RoomSession } from "@zamily-feud/shared";
import { useCountdown } from "../hooks/useCountdown";
import Avatar from "./Avatar";

interface StealHuddleProps {
  room: RoomSession;
  selfId: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onDone: () => void;
  /** The local team-mic holder's live transcript, if it's me. */
  interim: string;
}

/**
 * The stealing team's private huddle: only its members see this panel and its messages (the server
 * delivers them to teammates only). A countdown runs the discussion; anyone can end it early.
 */
export default function StealHuddle({ room, selfId, messages, onSend, onDone, interim }: StealHuddleProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const remainingMs = useCountdown(room.timer);
  const conferring = room.phase === "STEAL_CONFERENCE";
  const team = room.controllingTeamId ? room.teams[room.controllingTeamId] : null;
  const seconds = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, interim]);

  if (!team) return null;

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section className="relative z-10 flex w-full max-w-3xl animate-slam-in flex-col overflow-hidden rounded-2xl border-2 border-red-500/70 bg-navy-950/90 shadow-[0_0_40px_rgba(239,68,68,0.35)]">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-red-900/80 via-red-700/60 to-red-900/80 px-4 py-2">
        <div>
          <h2 className="font-display text-2xl tracking-wide text-white">🔒 TEAM HUDDLE</h2>
          <p className="text-xs text-red-100/80">Only {team.name} can see this. Agree on one answer, then one of you submits it.</p>
        </div>
        {conferring ? (
          <div className="flex items-center gap-3">
            <span className={`font-display text-3xl tabular-nums ${seconds <= 5 ? "text-red-300" : "text-white"}`}>{seconds}s</span>
            <button
              onClick={onDone}
              className="rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 font-heading text-lg tracking-wide text-navy-950 shadow-[0_4px_0_#065f46] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#065f46]"
            >
              ✅ Discussion is done
            </button>
          </div>
        ) : (
          <span className="rounded-full bg-gold-500 px-3 py-1 font-heading tracking-widest text-navy-950">SUBMIT YOUR STEAL!</span>
        )}
      </header>

      <div className="flex gap-2 border-b border-navy-700 px-4 py-2">
        {team.playerIds.map((id) => (
          <Avatar key={id} playerId={id} name={room.players[id]?.displayName ?? "?"} teamId={team.id} size="md" />
        ))}
      </div>

      <div ref={listRef} className="h-36 space-y-2 overflow-y-auto px-4 py-2" aria-live="polite">
        {messages.length === 0 && <p className="text-sm italic text-slate-500">Throw out ideas: what&apos;s still on the board?</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <Avatar playerId={m.playerId} name={m.displayName} teamId={m.teamId} size="xs" />
            <p className="text-sm">
              <span className={`font-semibold ${m.playerId === selfId ? "text-emerald-300" : "text-rose-200"}`}>
                {m.displayName}
                {m.via === "VOICE" ? " 🎙️" : ""}:{" "}
              </span>
              <span className="text-slate-100">{m.text}</span>
            </p>
          </div>
        ))}
        {interim && <p className="text-sm italic text-slate-400">🎙️ {interim}…</p>}
      </div>

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
          placeholder="Private to your team…"
          className="min-w-0 flex-1 rounded border border-red-500/40 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          autoFocus
        />
        <button type="submit" disabled={!draft.trim()} className="rounded bg-red-600 px-4 py-2 font-heading text-sm hover:bg-red-500 disabled:opacity-40">
          Send
        </button>
      </form>
    </section>
  );
}
