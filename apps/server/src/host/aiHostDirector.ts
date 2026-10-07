import { randomUUID } from "node:crypto";
import { AI_HOST_ID } from "@zamily-feud/shared";
import type { ChatMessage, HostCommentary, HostEventType, RoomEvent, RoomSession } from "@zamily-feud/shared";
import { RoomError, type RoomStore } from "../rooms/roomStore.js";
import { detectSituation } from "./situations.js";
import type { ActionOutcome, HostAction, HostBrain, HostTurn, Situation } from "./types.js";

/** What the director needs from the realtime layer: the same side effects a human host's socket actions trigger. */
export interface HostEffects {
  /** Broadcast the room (and host board) and arm any timer the move started. */
  commit(roomId: string, room: RoomSession): void;
  /** Broadcast the room without touching timers (for talk-only turns, so the chat updates). */
  broadcast(roomId: string, room: RoomSession): void;
  say(roomId: string, commentary: HostCommentary): void;
  slotRevealed(roomId: string, slotIndex: number, playerId: string | null): void;
  strike(roomId: string, teamId: string, strikes: number): void;
  error(roomId: string, message: string): void;
}

export interface AiHostDirectorOptions {
  totalRounds: number;
  /** Overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

interface RoomHostState {
  running: boolean;
  dirty: boolean;
  handled: Set<string>;
  showLog: string[];
  faceOffWinnerByQuestion: Map<string, string>;
  buzzerReopensByQuestion: Map<string, number>;
  /** Player chat messages already copied into the show log. */
  loggedChatIds: Set<string>;
  /** `at` of the newest player message the host has already had a chance to answer. */
  chatAnsweredUpTo: number;
  /** Room events (joins, exits, renames) already copied into the show log. */
  loggedEventIds: Set<string>;
  /** `at` of the newest room event the host has already reacted to. */
  eventsAnsweredUpTo: number;
  /** Earliest time the next chat-triggered turn may run (keeps chat replies from flooding, and the API bill down). */
  nextChatTurnAt: number;
}

const SHOW_LOG_LIMIT = 20;
/** Wait this long after a chat message so a burst of messages gets one reply. */
const CHAT_DEBOUNCE_MS = 1_200;
/** At most one chat-triggered host turn per room in this window. */
const CHAT_MIN_GAP_MS = 4_000;
/** Most recent unanswered messages shown to the host in one chat turn. */
const CHAT_BATCH_LIMIT = 6;
/** Claude tries a required game move up to this many times before the canned host steps in. */
const LLM_ATTEMPTS = 2;

function describeEvent(e: RoomEvent): string {
  switch (e.kind) {
    case "JOINED":
      return `${e.playerName} joined the room`;
    case "LEFT":
      return `${e.playerName}${e.teamName ? ` (${e.teamName})` : ""} left the game`;
    case "TEAM_RENAMED":
      return `"${e.previousName}" renamed itself "${e.teamName}"`;
    case "TEAMS_SHUFFLED":
      return "the teams were shuffled at random";
  }
}

function describeChat(room: RoomSession, m: ChatMessage): string {
  const team = m.teamId ? room.teams[m.teamId]?.name : null;
  return `${m.displayName}${team ? ` (${team})` : ""}${m.via === "VOICE" ? " on the mic" : ""}: "${m.text}"`;
}

/**
 * Runs AI-hosted rooms. Every room broadcast calls notify(); the director
 * works out which moment (if any) needs the host, and runs one brain turn
 * for it — never two at once per room, and never the same moment twice.
 *
 * The LLM brain goes first; if it errors, times out, or leaves a required move
 * unmade, the canned brain finishes the beat so the game never stalls.
 * Brains act only through execute(), which re-checks the moment is still
 * current and then calls the same RoomStore methods a human host would.
 */
export class AiHostDirector {
  private states = new Map<string, RoomHostState>();
  private sleep: (ms: number) => Promise<void>;

  constructor(
    private roomStore: RoomStore,
    private effects: HostEffects,
    private brains: { llm: HostBrain | null; canned: HostBrain },
    private options: AiHostDirectorOptions,
  ) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  notify(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.states.delete(roomId);
      return;
    }
    if (room.hostMode !== "AI") return;
    const state = this.stateFor(roomId);
    if (state.running) {
      state.dirty = true;
      return;
    }
    void this.drain(roomId, state);
  }

  forget(roomId: string): void {
    this.states.delete(roomId);
  }

  /** Resolves once the room has no queued host work. For tests. */
  async idle(roomId: string): Promise<void> {
    while (this.states.get(roomId)?.running) await new Promise((r) => setTimeout(r, 5));
  }

  private stateFor(roomId: string): RoomHostState {
    let state = this.states.get(roomId);
    if (!state) {
      state = {
        running: false,
        dirty: false,
        handled: new Set(),
        showLog: [],
        faceOffWinnerByQuestion: new Map(),
        buzzerReopensByQuestion: new Map(),
        loggedChatIds: new Set(),
        chatAnsweredUpTo: 0,
        loggedEventIds: new Set(),
        eventsAnsweredUpTo: 0,
        nextChatTurnAt: 0,
      };
      this.states.set(roomId, state);
    }
    return state;
  }

  /** The game, roster, and chat moments (if any) right now. Game moments come first, then roster, then chat; see drain(). */
  private current(
    roomId: string,
    state: RoomHostState,
  ): { room: RoomSession; game: Situation | null; roster: Situation | null; chat: Situation | null } | null {
    const room = this.roomStore.getRoom(roomId);
    if (!room) return null;
    if (room.phase === "CONTROL_DECISION" && room.currentQuestionId && room.controllingTeamId) {
      state.faceOffWinnerByQuestion.set(room.currentQuestionId, room.controllingTeamId);
    }
    for (const m of room.chat) {
      if (m.from === "PLAYER" && !state.loggedChatIds.has(m.id)) {
        state.loggedChatIds.add(m.id);
        this.log(state, `CHAT ${describeChat(room, m)}`);
      }
    }
    for (const e of room.roomEvents) {
      if (!state.loggedEventIds.has(e.id)) {
        state.loggedEventIds.add(e.id);
        this.log(state, `EVENT: ${describeEvent(e)}.`);
      }
    }
    const game = detectSituation(room, {
      faceOffAttemptedTeamIds: this.roomStore.getFaceOffAttemptedTeamIds(roomId),
      totalRounds: this.options.totalRounds,
      faceOffWinnerTeamId: room.currentQuestionId ? state.faceOffWinnerByQuestion.get(room.currentQuestionId) ?? null : null,
      boardOwnerTeamId: this.roomStore.getBoardOwnerTeamId(roomId),
    });
    return { room, game, roster: this.rosterSituation(room, state), chat: this.chatSituation(room, state) };
  }

  /** Whether a moment the host is working on still holds (a game move must not land on a moment that has passed). */
  private isCurrent(roomId: string, state: RoomHostState, situation: Situation): boolean {
    const now = this.current(roomId, state);
    const current = situation.kind === "CHAT" ? now?.chat : situation.kind === "ROSTER" ? now?.roster : now?.game;
    return current?.key === situation.key;
  }

  /** Arrivals, exits, and team changes the host hasn't reacted to yet. A burst (three friends joining at once) gets one line. */
  private rosterSituation(room: RoomSession, state: RoomHostState): Situation | null {
    const pending = room.roomEvents.filter((e) => e.at > state.eventsAnsweredUpTo);
    if (pending.length === 0) return null;
    const last = pending[pending.length - 1];
    const someoneLeft = pending.some((e) => e.kind === "LEFT");
    return {
      kind: "ROSTER",
      key: `roster:${last.id}`,
      eventType: "BANTER",
      brief: `Just now in the room:\n${pending.map((e) => `- ${describeEvent(e)}`).join("\n")}\n${
        someoneLeft
          ? "Give the exit a quick joke in your style (tease the departure, never guilt or mock the person who left), and keep everyone else's energy up."
          : "React in one quick line: welcome newcomers by name, or riff on the team change."
      }`,
      allowed: ["say"],
      requiresAction: false,
      delayMs: Math.max(CHAT_DEBOUNCE_MS, state.nextChatTurnAt - Date.now()),
    };
  }

  /** Unanswered player chat, as a moment. Only picked when no unhandled game moment is waiting. */
  private chatSituation(room: RoomSession, state: RoomHostState): Situation | null {
    const pending = room.chat.filter((m) => m.from === "PLAYER" && m.at > state.chatAnsweredUpTo);
    if (pending.length === 0) return null;
    const last = pending[pending.length - 1];
    return {
      kind: "CHAT",
      key: `chat:${last.id}`,
      eventType: "BANTER",
      brief: `New in the room chat:\n${pending
        .slice(-CHAT_BATCH_LIMIT)
        .map((m) => `- ${describeChat(room, m)}`)
        .join("\n")}\nReply with \`say\` if they're talking to you or it's a great setup; otherwise \`stay_quiet\` and let them talk.`,
      allowed: ["say", "stay_quiet"],
      requiresAction: false,
      delayMs: Math.max(CHAT_DEBOUNCE_MS, state.nextChatTurnAt - Date.now()),
    };
  }

  private async drain(roomId: string, state: RoomHostState): Promise<void> {
    state.running = true;
    try {
      do {
        state.dirty = false;
        const now = this.current(roomId, state);
        if (!now) {
          this.states.delete(roomId);
          return;
        }
        // A game moment that's still showing but already handled (e.g. "Team 1 is playing the board") mustn't block the chat.
        const situation = [now.game, now.roster, now.chat].find((s) => s && !state.handled.has(s.key)) ?? null;
        if (situation && !state.handled.has(situation.key)) {
          state.handled.add(situation.key);
          await this.handle(roomId, state, situation);
          state.dirty = true; // re-check: the move usually opens the next moment
        }
      } while (state.dirty);
    } catch (err) {
      console.error(JSON.stringify({ event: "AI_HOST_ERROR", roomId, message: (err as Error).message }));
    } finally {
      state.running = false;
    }
  }

  private async handle(roomId: string, state: RoomHostState, situation: Situation): Promise<void> {
    if (situation.delayMs) {
      await this.sleep(situation.delayMs);
      if (!this.isCurrent(roomId, state, situation)) {
        // Superseded while we waited (more chat arrived, or the game needs the host). Let it come round again.
        state.handled.delete(situation.key);
        return;
      }
    }
    const room = this.roomStore.getRoom(roomId);
    if (situation.kind === "CHAT") {
      state.chatAnsweredUpTo = Math.max(state.chatAnsweredUpTo, ...(room?.chat.map((m) => m.at) ?? [0]));
      state.nextChatTurnAt = Date.now() + CHAT_MIN_GAP_MS;
    }
    // The sign-off already covers a walkout, so the exits that caused it don't get a second joke.
    if (situation.kind === "ROSTER" || situation.kind === "GAME_OVER") {
      state.eventsAnsweredUpTo = Math.max(state.eventsAnsweredUpTo, ...(room?.roomEvents.map((e) => e.at) ?? [0]));
      if (situation.kind === "ROSTER") state.nextChatTurnAt = Date.now() + CHAT_MIN_GAP_MS;
    }

    let actionDone = false;
    const run = async (brain: HostBrain) => {
      const room = this.roomStore.getRoom(roomId);
      if (!room) return;
      const turn: HostTurn = {
        room,
        hostBoard: this.roomStore.getHostBoard(roomId),
        persona: room.hostPersona ?? "FAMILY_FRIENDLY",
        situation,
        totalRounds: this.options.totalRounds,
        faceOffAttemptedTeamIds: this.roomStore.getFaceOffAttemptedTeamIds(roomId),
        showLog: [...state.showLog],
        buzzerReopens: room.currentQuestionId ? state.buzzerReopensByQuestion.get(room.currentQuestionId) ?? 0 : 0,
        execute: async (action) => {
          const outcome = await this.execute(roomId, state, situation, action, brain.name, actionDone);
          if (outcome.ok && action.name !== "say") actionDone = true;
          return outcome;
        },
        actionDone: () => actionDone,
      };
      const startedAt = Date.now();
      await brain.takeTurn(turn);
      console.log(JSON.stringify({ event: "AI_HOST_TURN", roomId, brain: brain.name, situation: situation.kind, actionDone, ms: Date.now() - startedAt }));
    };

    // With a key, the canned host is a last resort: a game move that Claude didn't land gets one more Claude try first.
    for (let attempt = 1; this.brains.llm && attempt <= LLM_ATTEMPTS; attempt++) {
      try {
        await run(this.brains.llm);
      } catch (err) {
        console.error(JSON.stringify({ event: "AI_HOST_LLM_FAILED", roomId, situation: situation.kind, attempt, message: (err as Error).message }));
      }
      if (!situation.requiresAction || actionDone || !this.isCurrent(roomId, state, situation)) break;
    }

    const stillCurrent = this.isCurrent(roomId, state, situation);
    const needsFallback = !this.brains.llm || (situation.requiresAction && !actionDone && stillCurrent);
    if (needsFallback) await run(this.brains.canned);
  }

  private log(state: RoomHostState, entry: string): void {
    state.showLog.push(entry);
    if (state.showLog.length > SHOW_LOG_LIMIT) state.showLog.shift();
  }

  /** Shows the line in the speech bubble (read aloud) and posts it to the room chat. Callers broadcast the room afterwards. */
  private speak(roomId: string, state: RoomHostState, eventType: HostEventType, text: string, source: "LLM" | "CANNED"): void {
    // Text-to-speech reads markdown aloud ("asterisk my asterisk"), so strip any that slips through.
    const line = text.replace(/[*`]/g, "").trim();
    if (!line) return;
    this.roomStore.postHostChat(roomId, line);
    this.effects.say(roomId, { id: randomUUID(), eventType, text: line, source, at: Date.now() });
    this.log(state, `HOST: ${line}`);
  }

  /**
   * Validates a brain's move against the live game, applies it as the AI host, and reports back in model-readable text.
   * The host's line is spoken only once the move has actually landed, so a rejected move never leaves a dangling line.
   */
  private async execute(
    roomId: string,
    state: RoomHostState,
    situation: Situation,
    action: HostAction,
    source: "LLM" | "CANNED",
    actionAlreadyDone: boolean,
  ): Promise<ActionOutcome> {
    if (!situation.allowed.includes(action.name)) {
      return { ok: false, error: `${action.name} isn't a legal move right now. Legal: ${situation.allowed.join(", ")}.` };
    }
    const room = this.roomStore.getRoom(roomId);
    if (!room) return { ok: false, error: "The room is gone." };

    if (action.name === "stay_quiet") {
      return { ok: true, resolved: true, result: "Staying quiet." };
    }
    if (action.name === "say") {
      this.speak(roomId, state, situation.eventType, action.line, source);
      this.effects.broadcast(roomId, room);
      const resolved = !situation.requiresAction || actionAlreadyDone;
      return { ok: true, resolved, result: resolved ? "Said." : "Said. You still need to make the game move." };
    }

    // A game move must still match the moment it was decided for (an answer may have been resolved by a timer, etc.).
    if (!this.isCurrent(roomId, state, situation)) {
      return { ok: false, error: "The game moved on before that move landed; nothing was changed." };
    }

    try {
      switch (action.name) {
        case "start_question": {
          const updated = await this.roomStore.startQuestion(roomId, AI_HOST_ID);
          this.speak(roomId, state, situation.eventType, action.line, source);
          this.effects.commit(roomId, updated);
          this.log(state, `EVENT: Round ${updated.roundNumber} started: "${updated.questionText}" (${updated.board.slots.length} answers).`);
          return {
            ok: true,
            resolved: false,
            result: `Round ${updated.roundNumber} question is up: "${updated.questionText}" — ${updated.board.slots.length} answers on the board. The face-off buzzer is open now. Use say to read the question to the players.`,
          };
        }

        case "reveal_answer": {
          const slotIndex = action.slotNumber - 1;
          const slot = room.board.slots[slotIndex];
          if (!slot) return { ok: false, error: `There's no slot #${action.slotNumber}. The board has ${room.board.slots.length} slots.` };
          if (slot.revealed) return { ok: false, error: `#${action.slotNumber} is already revealed — if that's what they said, mark it wrong (it's already up there).` };
          const sub = room.lastSubmission;
          // A steal answer can arrive during the huddle; open the attempt so the reveal counts.
          if (room.phase === "STEAL_CONFERENCE") this.roomStore.hostAdvanceSteal(roomId, AI_HOST_ID);
          const wasSteal = room.phase === "STEAL_ATTEMPT";
          const updated = this.roomStore.hostReveal(roomId, AI_HOST_ID, slotIndex);
          this.speak(roomId, state, slot.rank === 1 ? "EXACT_MATCH" : "SYNONYM_MATCH", action.line, source);
          this.effects.slotRevealed(roomId, slotIndex, sub?.playerId ?? null);
          this.effects.commit(roomId, updated);
          const answer = updated.board.slots[slotIndex].answerText;
          this.log(state, `EVENT: ${sub?.displayName ?? "Someone"} said "${sub?.text ?? ""}" → revealed #${action.slotNumber} ${answer} (${slot.points} pts)${wasSteal ? " — STEAL SUCCESS" : ""}.`);
          return { ok: true, resolved: true, result: `Revealed #${action.slotNumber} ${answer} for ${slot.points}. Phase is now ${updated.phase}.` };
        }

        case "mark_wrong": {
          const sub = room.lastSubmission;
          if (room.phase === "STEAL_CONFERENCE") this.roomStore.hostAdvanceSteal(roomId, AI_HOST_ID);
          const teamId = room.controllingTeamId;
          const strikesBefore = teamId ? room.teams[teamId].strikes : 0;
          const phaseBefore = room.phase;
          const updated = this.roomStore.hostWrong(roomId, AI_HOST_ID);
          this.speak(
            roomId,
            state,
            phaseBefore === "STEAL_ATTEMPT" ? "STEAL_FAILURE" : strikesBefore + 1 >= 3 && phaseBefore === "PLAYING_BOARD" ? "STRIKE_3" : "STRIKE",
            action.line,
            source,
          );
          const strikesAfter = teamId ? updated.teams[teamId]?.strikes ?? 0 : 0;
          if (teamId && strikesAfter > strikesBefore) this.effects.strike(roomId, teamId, strikesAfter);
          this.effects.commit(roomId, updated);
          this.log(state, `EVENT: ${sub?.displayName ?? "Someone"} said "${sub?.text ?? ""}" → WRONG${strikesAfter > strikesBefore ? ` (strike ${strikesAfter})` : ""}${phaseBefore === "STEAL_ATTEMPT" ? " — steal failed" : ""}.`);
          return { ok: true, resolved: true, result: `Marked wrong. Phase is now ${updated.phase}.` };
        }

        case "reopen_buzzer": {
          const updated = this.roomStore.hostReopenBuzz(roomId, AI_HOST_ID);
          this.speak(roomId, state, situation.eventType, action.line, source);
          if (updated.currentQuestionId) {
            state.buzzerReopensByQuestion.set(updated.currentQuestionId, (state.buzzerReopensByQuestion.get(updated.currentQuestionId) ?? 0) + 1);
          }
          this.effects.commit(roomId, updated);
          this.log(state, "EVENT: Nobody buzzed; buzzer reopened.");
          return { ok: true, resolved: true, result: "Buzzer reopened." };
        }

        case "award_control": {
          if (!room.teams[action.teamId]) {
            return { ok: false, error: `No team with id ${action.teamId}. Team ids: ${Object.keys(room.teams).join(", ")}.` };
          }
          const updated = this.roomStore.hostAssignControl(roomId, AI_HOST_ID, action.teamId);
          this.speak(roomId, state, "CONTROL_AWARDED", action.line, source);
          this.effects.commit(roomId, updated);
          this.log(state, `EVENT: Host awarded control to ${updated.teams[action.teamId].name}.`);
          return { ok: true, resolved: true, result: `${updated.teams[action.teamId].name} has control; their captain now picks play or pass.` };
        }

        case "next_round": {
          const updated = this.roomStore.hostNextRound(roomId, AI_HOST_ID);
          this.speak(roomId, state, "ROUND_COMPLETE", action.line, source);
          this.effects.commit(roomId, updated);
          return { ok: true, resolved: true, result: "Board cleared." };
        }

        case "end_game": {
          const updated = this.roomStore.hostEndGame(roomId, AI_HOST_ID);
          this.speak(roomId, state, "GAME_COMPLETE", action.line, source);
          this.effects.commit(roomId, updated);
          return { ok: true, resolved: true, result: "Game over." };
        }
      }
    } catch (err) {
      if (err instanceof RoomError) {
        if (err.code === "NO_QUESTION_SOURCE" || err.code === "DATASET_EXHAUSTED") this.effects.error(roomId, err.message);
        return { ok: false, error: `${err.code}: ${err.message}` };
      }
      throw err;
    }
  }
}
