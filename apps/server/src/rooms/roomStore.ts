import { randomUUID } from "node:crypto";
import {
  AI_HOST_DEFAULT_ROUNDS,
  AI_HOST_ID,
  AVATAR_MAX_CHARS,
  ANSWER_WINDOW_MS,
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_LENGTH,
  BUZZ_WINDOW_MS,
  MAX_ANSWER_ALTERNATIVES,
  QUESTION_INTRO_MS,
  MAX_PLAYERS_PER_TEAM,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  STRIKES_TO_STEAL,
  TEAM_IDS,
} from "@zamily-feud/shared";
import type { AgeCategory, ChatMessage, HostBoardState, HostMode, PlayerState, RoomSession, TeamState } from "@zamily-feud/shared";
import type { EmbeddingProvider } from "../providers/embedding/EmbeddingProvider.js";
import type { QuestionSource } from "../dataset/questionSource.js";
import { matchAnswer, type AnswerMatch, type MatchableAnswer, type MatchThresholds } from "../matching/matchAnswer.js";

interface RoundContext {
  questionId: string;
  answers: MatchableAnswer[];
  /** Team IDs that have already had their face-off attempt this question. */
  faceOffAttemptedTeamIds: Set<string>;
  /** The team that was playing the board before a steal — they bank on a failed steal. */
  boardOwnerTeamId: string | null;
  stealAttempted: boolean;
  /** True while an accepted answer is still being matched (the embedding call can take seconds). */
  matchingInProgress: boolean;
}

export interface RoomStoreDeps {
  questionSource?: QuestionSource;
  embeddingProvider?: EmbeddingProvider;
  thresholds?: MatchThresholds;
  /** How long the stealing team gets to confer before their one steal attempt. Defaults to 20s. */
  stealConferenceMs?: number;
  /** Rounds per AI-hosted game (shown to players as "Round 2 of 5"). */
  aiTotalRounds?: number;
  /** AI rooms: how long a new question shows before the buzzer opens. 0 opens it immediately. */
  questionIntroMs?: number;
}

const NO_TIMER = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 } as const;
const AVATAR_PREFIX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const DEFAULT_THRESHOLDS: MatchThresholds = { fuzzy: 0.82, vectorAccept: 0.9, vectorReject: 0.6 };
const MAX_ANSWER_LENGTH = 120;
/** Minimum gap between one player's chat messages. */
const CHAT_MIN_INTERVAL_MS = 700;

/** Ranks match results: a confident match beats an unsure one, then the stronger method, then the higher similarity. */
function matchStrength(m: AnswerMatch): number {
  const method = { EXACT: 4, FUZZY: 3, VECTOR: 2, LLM: 1, NO_MATCH: 0 }[m.method];
  return (m.autoAccept ? 100 : 0) + (m.matched ? 10 : 0) + method + (m.similarity ?? 0) / 10;
}

export class RoomError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MAX_PLAYERS_TOTAL = MAX_PLAYERS_PER_TEAM * TEAM_IDS.length;
const MAX_TEAM_NAME_LENGTH = 24;

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function emptyTeam(id: string, name: string): TeamState {
  return { id, name, playerIds: [], captainId: null, score: 0, strikes: 0 };
}

function requireHost(room: RoomSession, requesterId: string): void {
  if (room.hostId !== requesterId) {
    throw new RoomError("NOT_HOST", "Only the host can do that");
  }
}

/** Lobby setup (teams, names, lock) belongs to the room creator — who is also the host in HUMAN mode. */
function requireOwner(room: RoomSession, requesterId: string): void {
  if (room.ownerId !== requesterId) {
    throw new RoomError("NOT_OWNER", "Only the room creator can do that");
  }
}

export interface CreateRoomOptions {
  hostMode?: HostMode;
  hostPersona?: AgeCategory;
}

/** The team's face-off representative: whichever player is currently captain. */
function requireCaptain(room: RoomSession, requesterId: string): TeamState {
  const player = room.players[requesterId];
  if (!player || !player.teamId) throw new RoomError("NOT_ON_A_TEAM", "You are not on a team");
  const team = room.teams[player.teamId];
  if (team.captainId !== requesterId) {
    throw new RoomError("NOT_CAPTAIN", "Only your team's captain can do that");
  }
  return team;
}

function otherTeamId(teamId: string): string {
  const other = TEAM_IDS.find((id) => id !== teamId);
  if (!other) throw new Error("TEAM_IDS must have exactly 2 entries");
  return other;
}

/** Recomputes a team's captain after its membership changes: first player in the list, or none. */
function recomputeCaptain(team: TeamState): void {
  team.captainId = team.playerIds[0] ?? null;
}

/**
 * Holds all active game state in memory, keyed by roomId. Nothing here is
 * persisted — destroyRoom() is the only way rooms leave this store, and a
 * background sweep calls it automatically once a room goes idle past its TTL.
 *
 * Team format is fixed: exactly 2 teams, 5 players max each (spec: 10 total).
 * Players start unassigned (teamId: null) and only move to a team via
 * assignPlayerToTeam() or autoBalanceTeams() — both host-only.
 */
export class RoomStore {
  private roomsById = new Map<string, RoomSession>();
  private roomIdByCode = new Map<string, string>();
  private roundsByRoom = new Map<string, RoundContext>();
  private askedQuestionIdsByRoom = new Map<string, Set<string>>();
  private lastChatAtByPlayer = new Map<string, number>();
  private avatarsByRoom = new Map<string, Record<string, string>>();
  /** `${roomId}:${teamId}` -> id of the current mic claim, so a stale auto-release can't drop a newer claim. */
  private micClaimIds = new Map<string, string>();

  constructor(private deps: RoomStoreDeps = {}) {}

  /**
   * In AI mode the creator joins as a regular (team-eligible) player and the
   * game is hosted by the virtual AI_HOST_ID, which only the server's AI host
   * director acts as.
   */
  createRoom(displayName: string, ttlSeconds: number, options: CreateRoomOptions = {}): { room: RoomSession; playerId: string } {
    const hostMode: HostMode = options.hostMode ?? "HUMAN";
    const roomId = randomUUID();
    let roomCode = generateRoomCode();
    while (this.roomIdByCode.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerId = randomUUID();
    const teams = Object.fromEntries(TEAM_IDS.map((id, i) => [id, emptyTeam(id, `Team ${i + 1}`)]));
    const creator: PlayerState = { id: playerId, displayName, teamId: null, connected: true, isHost: hostMode === "HUMAN", ready: false, hasAvatar: false };

    const now = Date.now();
    const room: RoomSession = {
      roomId,
      roomCode,
      hostId: hostMode === "AI" ? AI_HOST_ID : playerId,
      ownerId: playerId,
      hostMode,
      hostPersona: hostMode === "AI" ? options.hostPersona ?? "FAMILY_FRIENDLY" : null,
      players: { [playerId]: creator },
      teams,
      currentQuestionId: null,
      questionText: null,
      roundNumber: 0,
      totalRounds: hostMode === "AI" ? this.deps.aiTotalRounds ?? AI_HOST_DEFAULT_ROUNDS : null,
      phase: "LOBBY",
      teamsLocked: false,
      activePlayerId: null,
      controllingTeamId: null,
      board: { slots: [], currentTotal: 0 },
      timer: { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 },
      lastSubmission: null,
      chat: [],
      micHolders: Object.fromEntries(TEAM_IDS.map((id) => [id, null])),
      createdAt: now,
      lastActivityAt: now,
    };

    this.roomsById.set(roomId, room);
    this.roomIdByCode.set(roomCode, roomId);
    void ttlSeconds; // TTL is enforced by sweepExpired(), applied uniformly to every room.
    return { room, playerId };
  }

  joinRoom(roomCode: string, displayName: string): { room: RoomSession; playerId: string } {
    const roomId = this.roomIdByCode.get(roomCode.toUpperCase());
    if (!roomId) throw new RoomError("ROOM_NOT_FOUND", `No room with code ${roomCode}`);
    const room = this.roomsById.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", `No room with code ${roomCode}`);
    if (room.phase !== "LOBBY") throw new RoomError("ROOM_IN_PROGRESS", "This game has already started");
    if (Object.keys(room.players).length >= MAX_PLAYERS_TOTAL) {
      throw new RoomError("ROOM_FULL", "This room is full");
    }

    const playerId = randomUUID();
    const player: PlayerState = { id: playerId, displayName, teamId: null, connected: true, isHost: false, ready: false, hasAvatar: false };
    room.players[playerId] = player;

    room.lastActivityAt = Date.now();
    return { room, playerId };
  }

  /** Owner-only. Moves a player onto a team (max 5) or back to the unassigned pool (teamId: null). */
  assignPlayerToTeam(roomId: string, requesterId: string, playerId: string, teamId: string | null): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireOwner(room, requesterId);
    if (room.teamsLocked) throw new RoomError("TEAMS_LOCKED", "Teams are already locked");

    const player = room.players[playerId];
    if (!player) throw new RoomError("PLAYER_NOT_FOUND", "No such player in this room");
    if (player.isHost && teamId !== null) {
      throw new RoomError("HOST_CANNOT_PLAY", "The host manages the game and cannot join a team");
    }

    if (teamId !== null) {
      const targetTeam = room.teams[teamId];
      if (!targetTeam) throw new RoomError("TEAM_NOT_FOUND", "No such team");
      const alreadyOnTarget = targetTeam.playerIds.includes(playerId);
      if (!alreadyOnTarget && targetTeam.playerIds.length >= MAX_PLAYERS_PER_TEAM) {
        throw new RoomError("TEAM_FULL", `${targetTeam.name} is full`);
      }
    }

    this.dropMic(room, playerId);
    for (const team of Object.values(room.teams)) {
      const idx = team.playerIds.indexOf(playerId);
      if (idx !== -1) {
        team.playerIds.splice(idx, 1);
        recomputeCaptain(team);
      }
    }
    if (teamId !== null) {
      const targetTeam = room.teams[teamId];
      targetTeam.playerIds.push(playerId);
      recomputeCaptain(targetTeam);
    }
    player.teamId = teamId;

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Owner-only. Randomly redistributes every player 50/50 across the two teams. */
  autoBalanceTeams(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireOwner(room, requesterId);
    if (room.teamsLocked) throw new RoomError("TEAMS_LOCKED", "Teams are already locked");

    const teams = TEAM_IDS.map((id) => room.teams[id]);
    const shuffled = Object.values(room.players)
      .filter((p) => !p.isHost)
      .map((p) => p.id)
      .sort(() => Math.random() - 0.5);

    for (const team of teams) team.playerIds = [];
    for (const id of shuffled) this.dropMic(room, id);
    shuffled.forEach((playerId, index) => {
      const team = teams[index % teams.length];
      team.playerIds.push(playerId);
      room.players[playerId].teamId = team.id;
    });
    for (const team of teams) recomputeCaptain(team);

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Owner-only. Renames a team (1-24 chars after trimming). */
  renameTeam(roomId: string, requesterId: string, teamId: string, name: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireOwner(room, requesterId);
    const team = room.teams[teamId];
    if (!team) throw new RoomError("TEAM_NOT_FOUND", "No such team");

    const trimmed = name.trim();
    if (!trimmed) throw new RoomError("INVALID_NAME", "Team name cannot be blank");
    team.name = trimmed.slice(0, MAX_TEAM_NAME_LENGTH);

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Owner-only. Closes the lobby: both teams must be non-empty. Advances phase to FACE_OFF. */
  lockTeams(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireOwner(room, requesterId);
    if (room.phase !== "LOBBY") throw new RoomError("ALREADY_STARTED", "The game has already started");

    const emptyTeams = Object.values(room.teams).filter((team) => team.playerIds.length === 0);
    if (emptyTeams.length > 0) {
      throw new RoomError("TEAM_EMPTY", `${emptyTeams.map((t) => t.name).join(", ")} needs at least one player`);
    }

    room.teamsLocked = true;
    room.phase = "FACE_OFF";
    room.lastActivityAt = Date.now();
    return room;
  }

  // ---------------------------------------------------------------------
  // Game engine (spec §8): face-off buzzer, host-controlled reveal/strike,
  // play/pass, and the steal. Answer text + embeddings live only in
  // roundsByRoom on this server — RoomSession (broadcast to everyone) never
  // carries hidden answer text; getHostBoard() is the one host-only channel
  // that does.
  // ---------------------------------------------------------------------

  /** Host-only. Pulls the next question from the dataset and opens the buzzer. */
  async startQuestion(roomId: string, requesterId: string): Promise<RoomSession> {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.phase !== "FACE_OFF" && room.phase !== "NEXT_ROUND") {
      throw new RoomError("WRONG_PHASE", "Can't start a question right now");
    }
    if (room.currentQuestionId !== null) {
      throw new RoomError("QUESTION_ACTIVE", "A question is already active");
    }
    if (!this.deps.questionSource) {
      throw new RoomError("NO_QUESTION_SOURCE", "No question dataset is configured");
    }

    const asked = this.askedQuestionIdsByRoom.get(roomId) ?? new Set<string>();
    const picked = await this.deps.questionSource.pickQuestion(asked);
    if (!picked) throw new RoomError("DATASET_EXHAUSTED", "No more questions left for this room");
    asked.add(picked.id);
    this.askedQuestionIdsByRoom.set(roomId, asked);

    const answers: MatchableAnswer[] = picked.answers.map((a) => ({
      answerId: a.answerId,
      answerText: a.answerText,
      normalizedAnswer: a.normalizedAnswer,
      points: a.points,
      rank: a.rank,
      embedding: a.embedding,
    }));

    room.currentQuestionId = picked.id;
    room.questionText = picked.questionText;
    room.roundNumber += 1;
    room.phase = "FACE_OFF";
    room.activePlayerId = null;
    room.controllingTeamId = null;
    room.board = {
      slots: answers.map((a) => ({ answerId: a.answerId, answerText: null, points: a.points, rank: a.rank, revealed: false, missed: false })),
      currentTotal: 0,
    };
    room.lastSubmission = null;
    // AI rooms give everyone a beat to read the question (and hear the host read it) before buzzing opens.
    const introMs = room.hostMode === "AI" ? this.deps.questionIntroMs ?? QUESTION_INTRO_MS : 0;
    room.timer =
      introMs > 0
        ? { id: randomUUID(), kind: "QUESTION_INTRO", durationMs: introMs, startedAt: Date.now(), remainingMs: introMs }
        : { id: randomUUID(), kind: "BUZZ", durationMs: BUZZ_WINDOW_MS, startedAt: Date.now(), remainingMs: BUZZ_WINDOW_MS };

    this.roundsByRoom.set(roomId, {
      questionId: picked.id,
      answers,
      faceOffAttemptedTeamIds: new Set(),
      boardOwnerTeamId: null,
      stealAttempted: false,
      matchingInProgress: false,
    });

    room.lastActivityAt = Date.now();
    return room;
  }

  /** The host-only view of the current board: full answer text, even for unrevealed slots. */
  getHostBoard(roomId: string): HostBoardState | null {
    const room = this.roomsById.get(roomId);
    const round = this.roundsByRoom.get(roomId);
    if (!room || !round) return null;
    return {
      questionId: round.questionId,
      slots: room.board.slots.map((slot, i) => ({
        answerId: slot.answerId,
        answerText: round.answers[i].answerText,
        points: slot.points,
        rank: slot.rank,
        revealed: slot.revealed,
        missed: slot.missed,
      })),
    };
  }

  /** Only a team's captain may buzz, only while the buzzer is open, and only once per team per question. */
  buzz(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    const round = this.roundsByRoom.get(roomId);
    if (!round) throw new RoomError("NO_ACTIVE_QUESTION", "No question is active");
    if (room.phase !== "FACE_OFF") throw new RoomError("NOT_BUZZ_TIME", "It's not time to buzz in");
    if (room.timer.kind !== "BUZZ") throw new RoomError("BUZZER_CLOSED", "The buzzer isn't open");
    if (room.activePlayerId !== null) throw new RoomError("ALREADY_BUZZED", "Someone already buzzed in");

    const team = requireCaptain(room, requesterId);
    if (round.faceOffAttemptedTeamIds.has(team.id)) {
      throw new RoomError("ALREADY_ATTEMPTED", "Your team already had a face-off attempt on this question");
    }

    room.activePlayerId = requesterId;
    room.controllingTeamId = team.id;
    room.timer = { id: randomUUID(), kind: "ANSWER", durationMs: ANSWER_WINDOW_MS, startedAt: Date.now(), remainingMs: ANSWER_WINDOW_MS };
    room.lastActivityAt = Date.now();
    return room;
  }

  private async embedOne(text: string): Promise<number[]> {
    if (!this.deps.embeddingProvider) throw new Error("No embedding provider configured");
    const [vector] = await this.deps.embeddingProvider.embed([text]);
    return vector;
  }

  /**
   * Runs the tiered matcher and records the result as a suggestion for the
   * host — matching never reveals or strikes on its own, the host always
   * makes that call. Eligibility: the face-off buzz winner during
   * FACE_OFF, any controlling-team member during PLAYING_BOARD, or the
   * (single-shot) stealing team during STEAL_CONFERENCE/STEAL_ATTEMPT.
   */
  async submitAnswer(roomId: string, requesterId: string, rawText: string, rawAlternatives: unknown = []): Promise<RoomSession> {
    const room = this.getRoomOrThrow(roomId);
    const round = this.roundsByRoom.get(roomId);
    if (!round) throw new RoomError("NO_ACTIVE_QUESTION", "No question is active");

    const text = rawText.trim().slice(0, MAX_ANSWER_LENGTH);
    if (!text) throw new RoomError("EMPTY_ANSWER", "Answer cannot be blank");
    // Spoken answers carry speech-to-text's runner-up guesses; untrusted client input, so clean it hard.
    const alternatives = Array.isArray(rawAlternatives)
      ? [
          ...new Set(
            rawAlternatives
              .filter((a): a is string => typeof a === "string")
              .map((a) => a.trim().slice(0, MAX_ANSWER_LENGTH))
              .filter((a) => a && a.toLowerCase() !== text.toLowerCase()),
          ),
        ].slice(0, MAX_ANSWER_ALTERNATIVES)
      : [];

    const player = room.players[requesterId];
    if (!player || !player.teamId) throw new RoomError("NOT_ON_A_TEAM", "You are not on a team");
    if (round.matchingInProgress) throw new RoomError("ANSWER_PENDING", "Someone just answered — hang on a second");
    // A human host can glance at a replaced banner; the AI host judges each answer in turn, so don't overwrite one mid-judgment.
    if (room.hostMode === "AI" && room.lastSubmission !== null) {
      throw new RoomError("HOST_JUDGING", "Hold on — the host is still judging the last answer");
    }

    if (room.phase === "FACE_OFF") {
      if (requesterId !== room.activePlayerId || room.timer.kind !== "ANSWER") {
        throw new RoomError("NOT_YOUR_TURN", "It's not your turn to answer");
      }
    } else if (room.phase === "PLAYING_BOARD") {
      if (player.teamId !== room.controllingTeamId) {
        throw new RoomError("NOT_YOUR_TURN", "Your team doesn't control the board");
      }
    } else if (room.phase === "STEAL_CONFERENCE" || room.phase === "STEAL_ATTEMPT") {
      if (player.teamId !== room.controllingTeamId) {
        throw new RoomError("NOT_YOUR_TURN", "It's not your team's steal attempt");
      }
      if (round.stealAttempted) throw new RoomError("STEAL_USED", "Your team already used its steal attempt");
      round.stealAttempted = true;
    } else {
      throw new RoomError("WRONG_PHASE", "No answer is expected right now");
    }

    // The answer is in: stop the face-off answer clock now, so a slow match (e.g. the
    // embedding model's first load) can't time the player out after they answered in time.
    const phaseAtSubmit = room.phase;
    if (phaseAtSubmit === "FACE_OFF") {
      room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    }

    const unrevealed = round.answers.map((a, index) => ({ a, index })).filter(({ index }) => !room.board.slots[index].revealed);
    const matchable: MatchableAnswer[] = unrevealed.map(({ a }) => a);
    const thresholds = this.deps.thresholds ?? DEFAULT_THRESHOLDS;
    const embed = this.deps.embeddingProvider ? (t: string) => this.embedOne(t) : undefined;
    round.matchingInProgress = true;
    let match: AnswerMatch;
    let matchedOn = text;
    try {
      match = await matchAnswer(text, matchable, thresholds, embed);
      // Only consult the runner-up transcripts when the main one isn't a confident hit (e.g. "dock" heard for "dog").
      for (const alt of match.autoAccept ? [] : alternatives) {
        const altMatch = await matchAnswer(alt, matchable, thresholds, embed);
        if (matchStrength(altMatch) > matchStrength(match)) {
          match = altMatch;
          matchedOn = alt;
        }
      }
    } finally {
      round.matchingInProgress = false;
    }
    // The host may have moved the game on while we were matching; don't attach a verdict-in-waiting to a different moment.
    const stillCurrent =
      this.roundsByRoom.get(roomId) === round &&
      (room.phase === phaseAtSubmit || (phaseAtSubmit === "STEAL_CONFERENCE" && room.phase === "STEAL_ATTEMPT"));
    if (!stillCurrent) throw new RoomError("ANSWER_TOO_LATE", "The game moved on before that answer landed");
    const slotIndex = match.slotIndex !== null ? unrevealed[match.slotIndex].index : null;

    room.lastSubmission = {
      playerId: requesterId,
      teamId: player.teamId,
      displayName: player.displayName,
      text,
      alternatives,
      matchedOn,
      suggestion: { ...match, slotIndex },
      submittedAt: Date.now(),
    };

    room.lastActivityAt = Date.now();
    return room;
  }

  private resolveFaceOffMiss(room: RoomSession, round: RoundContext): void {
    const attemptedTeam = room.controllingTeamId;
    if (attemptedTeam) round.faceOffAttemptedTeamIds.add(attemptedTeam);
    room.activePlayerId = null;
    room.controllingTeamId = null;
    room.lastSubmission = null;
    if (attemptedTeam && !round.faceOffAttemptedTeamIds.has(otherTeamId(attemptedTeam))) {
      room.timer = { id: randomUUID(), kind: "BUZZ", durationMs: BUZZ_WINDOW_MS, startedAt: Date.now(), remainingMs: BUZZ_WINDOW_MS };
    } else {
      room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    }
  }

  private finishRound(room: RoomSession, winningTeamId: string | null): void {
    if (winningTeamId) room.teams[winningTeamId].score += room.board.currentTotal;
    // Like the show: flip whatever nobody got, so everyone sees the full board (unscored).
    const round = this.roundsByRoom.get(room.roomId);
    room.board.slots.forEach((slot, i) => {
      if (!slot.revealed && round) {
        slot.answerText = round.answers[i].answerText;
        slot.revealed = true;
        slot.missed = true;
      }
    });
    room.phase = "ROUND_RESULT";
    room.activePlayerId = null;
    room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
  }

  /**
   * Host-only, and the only way a slot gets revealed or a strike gets
   * recorded (spec: matching only ever suggests). `slotIndex` is required
   * for reveal so the host can override the matcher's suggestion.
   */
  hostReveal(roomId: string, requesterId: string, slotIndex: number): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    const round = this.roundsByRoom.get(roomId);
    if (!round) throw new RoomError("NO_ACTIVE_QUESTION", "No question is active");
    if (room.phase !== "FACE_OFF" && room.phase !== "PLAYING_BOARD" && room.phase !== "STEAL_ATTEMPT") {
      throw new RoomError("WRONG_PHASE", "No reveal is expected right now");
    }
    const slot = room.board.slots[slotIndex];
    if (!slot) throw new RoomError("INVALID_SLOT", "No such slot");
    if (slot.revealed) throw new RoomError("ALREADY_REVEALED", "That slot is already revealed");

    slot.answerText = round.answers[slotIndex].answerText;
    slot.revealed = true;
    room.board.currentTotal += slot.points;
    room.lastSubmission = null;

    if (room.phase === "FACE_OFF" && room.board.slots.every((s) => s.revealed)) {
      // Nothing left to play or pass (a one-answer board): the face-off winner banks it.
      this.finishRound(room, room.controllingTeamId);
    } else if (room.phase === "FACE_OFF") {
      room.phase = "CONTROL_DECISION";
      room.activePlayerId = null;
      room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    } else if (room.phase === "PLAYING_BOARD") {
      if (room.board.slots.every((s) => s.revealed)) this.finishRound(room, round.boardOwnerTeamId);
    } else if (room.phase === "STEAL_ATTEMPT") {
      this.finishRound(room, room.controllingTeamId);
    }

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Marks the current attempt wrong — behavior depends on phase; never auto-strikes during face-off. */
  hostWrong(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    const round = this.roundsByRoom.get(roomId);
    if (!round) throw new RoomError("NO_ACTIVE_QUESTION", "No question is active");

    if (room.phase === "FACE_OFF") {
      if (!room.controllingTeamId) throw new RoomError("NO_ACTIVE_ATTEMPT", "Nobody has buzzed in yet");
      this.resolveFaceOffMiss(room, round);
    } else if (room.phase === "PLAYING_BOARD") {
      if (!room.controllingTeamId) throw new RoomError("NO_CONTROLLING_TEAM", "No team controls the board");
      const team = room.teams[room.controllingTeamId];
      team.strikes += 1;
      room.lastSubmission = null;
      if (team.strikes >= STRIKES_TO_STEAL) {
        round.boardOwnerTeamId = room.controllingTeamId;
        room.controllingTeamId = otherTeamId(room.controllingTeamId);
        room.phase = "STEAL_CONFERENCE";
        const ms = this.deps.stealConferenceMs ?? 20_000;
        room.timer = { id: randomUUID(), kind: "STEAL_CONFERENCE", durationMs: ms, startedAt: Date.now(), remainingMs: ms };
      }
    } else if (room.phase === "STEAL_ATTEMPT") {
      room.lastSubmission = null;
      this.finishRound(room, round.boardOwnerTeamId);
    } else {
      throw new RoomError("WRONG_PHASE", "Nothing to mark wrong right now");
    }

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Team IDs that have already used their face-off attempt on the current question. */
  getFaceOffAttemptedTeamIds(roomId: string): string[] {
    return Array.from(this.roundsByRoom.get(roomId)?.faceOffAttemptedTeamIds ?? []);
  }

  /** The team that will bank the board if a steal fails (the team that played it before the steal). */
  getBoardOwnerTeamId(roomId: string): string | null {
    return this.roundsByRoom.get(roomId)?.boardOwnerTeamId ?? null;
  }

  /** Host-only. Re-opens the buzzer after a timeout with nobody locked in. */
  hostReopenBuzz(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.phase !== "FACE_OFF" || room.activePlayerId !== null) {
      throw new RoomError("WRONG_PHASE", "The buzzer isn't waiting to reopen");
    }
    room.timer = { id: randomUUID(), kind: "BUZZ", durationMs: BUZZ_WINDOW_MS, startedAt: Date.now(), remainingMs: BUZZ_WINDOW_MS };
    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Manually awards control — used when both face-off attempts miss. */
  hostAssignControl(roomId: string, requesterId: string, teamId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (!room.teams[teamId]) throw new RoomError("TEAM_NOT_FOUND", "No such team");
    if (room.phase !== "FACE_OFF") throw new RoomError("WRONG_PHASE", "Not awaiting a control decision");

    room.controllingTeamId = teamId;
    room.phase = "CONTROL_DECISION";
    room.activePlayerId = null;
    room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Ends the steal conference early and opens the single steal attempt. */
  hostAdvanceSteal(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.phase !== "STEAL_CONFERENCE") throw new RoomError("WRONG_PHASE", "Not in a steal conference");
    room.phase = "STEAL_ATTEMPT";
    room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    room.lastActivityAt = Date.now();
    return room;
  }

  /** Any member of the stealing team can end the huddle early ("Discussion is done") and open their one steal attempt. */
  endStealHuddle(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    if (room.phase !== "STEAL_CONFERENCE") throw new RoomError("WRONG_PHASE", "There's no steal huddle right now");
    if (room.players[requesterId]?.teamId !== room.controllingTeamId) {
      throw new RoomError("NOT_YOUR_HUDDLE", "Only the stealing team can end its huddle");
    }
    room.phase = "STEAL_ATTEMPT";
    room.timer = { ...NO_TIMER };
    room.lastActivityAt = Date.now();
    return room;
  }

  /** True while the stealing team is conferring or answering — their discussion is private then. */
  private isStealHuddle(room: RoomSession): boolean {
    return room.phase === "STEAL_CONFERENCE" || room.phase === "STEAL_ATTEMPT";
  }

  /** The stealing team's private huddle chat. Returns the message and exactly who may receive it (their teammates). */
  postTeamChat(roomId: string, playerId: string, rawText: string, via: "TEXT" | "VOICE" = "TEXT"): { message: ChatMessage; recipientIds: string[] } {
    const room = this.getRoomOrThrow(roomId);
    const player = room.players[playerId];
    if (!player?.teamId) throw new RoomError("NOT_ON_A_TEAM", "You are not on a team");
    if (!this.isStealHuddle(room) || player.teamId !== room.controllingTeamId) {
      throw new RoomError("NO_HUDDLE", "Team chat is only open for the stealing team during a steal");
    }
    const text = rawText.trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) throw new RoomError("EMPTY_MESSAGE", "Message cannot be blank");
    const key = `${roomId}:${playerId}`;
    const now = Date.now();
    if (now - (this.lastChatAtByPlayer.get(key) ?? 0) < CHAT_MIN_INTERVAL_MS) throw new RoomError("CHAT_TOO_FAST", "Slow down a little");
    this.lastChatAtByPlayer.set(key, now);
    room.lastActivityAt = now;
    const message: ChatMessage = { id: randomUUID(), from: "PLAYER", playerId, displayName: player.displayName, teamId: player.teamId, text, via, at: now };
    return { message, recipientIds: [...room.teams[player.teamId].playerIds] };
  }

  /** During a steal, may `fromId` stream mic audio to `toId`? The stealing team only talks among itself. */
  canHearMic(roomId: string, fromId: string, toId: string): boolean {
    const room = this.roomsById.get(roomId);
    if (!room) return false;
    const fromTeam = room.players[fromId]?.teamId;
    if (room.phase === "STEAL_CONFERENCE" && fromTeam === room.controllingTeamId) return room.players[toId]?.teamId === fromTeam;
    return true;
  }

  /** Sets or clears a player's picture. Only small image data URLs are accepted; they live in memory and die with the room. */
  setAvatar(roomId: string, playerId: string, image: unknown): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    const player = room.players[playerId];
    if (!player) throw new RoomError("PLAYER_NOT_FOUND", "No such player in this room");
    const avatars = this.avatarsByRoom.get(roomId) ?? {};
    if (image === null) {
      delete avatars[playerId];
    } else {
      if (typeof image !== "string" || image.length > AVATAR_MAX_CHARS || !AVATAR_PREFIX.test(image)) {
        throw new RoomError("BAD_IMAGE", "That picture couldn't be used — try a smaller JPEG or PNG");
      }
      avatars[playerId] = image;
    }
    this.avatarsByRoom.set(roomId, avatars);
    player.hasAvatar = image !== null;
    room.lastActivityAt = Date.now();
    return room;
  }

  getAvatars(roomId: string): Record<string, string> {
    return { ...(this.avatarsByRoom.get(roomId) ?? {}) };
  }

  /** The controlling team's captain chooses to play the board themselves. */
  choosePlay(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    if (room.phase !== "CONTROL_DECISION" || !room.controllingTeamId) {
      throw new RoomError("WRONG_PHASE", "No control decision is pending");
    }
    const team = requireCaptain(room, requesterId);
    if (team.id !== room.controllingTeamId) throw new RoomError("NOT_YOUR_DECISION", "Your team doesn't control the board");

    const round = this.roundsByRoom.get(roomId);
    if (round) round.boardOwnerTeamId = team.id;
    room.phase = "PLAYING_BOARD";
    room.lastActivityAt = Date.now();
    return room;
  }

  /** The controlling team's captain passes the board to the other team. */
  choosePass(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    if (room.phase !== "CONTROL_DECISION" || !room.controllingTeamId) {
      throw new RoomError("WRONG_PHASE", "No control decision is pending");
    }
    const team = requireCaptain(room, requesterId);
    if (team.id !== room.controllingTeamId) throw new RoomError("NOT_YOUR_DECISION", "Your team doesn't control the board");

    const receivingTeamId = otherTeamId(team.id);
    const round = this.roundsByRoom.get(roomId);
    if (round) round.boardOwnerTeamId = receivingTeamId;
    room.controllingTeamId = receivingTeamId;
    room.phase = "PLAYING_BOARD";
    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Clears the board and returns to a fresh face-off. */
  hostNextRound(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.phase !== "ROUND_RESULT") throw new RoomError("WRONG_PHASE", "No round result to clear");

    for (const team of Object.values(room.teams)) team.strikes = 0;
    room.currentQuestionId = null;
    room.questionText = null;
    room.board = { slots: [], currentTotal: 0 };
    room.activePlayerId = null;
    room.controllingTeamId = null;
    room.lastSubmission = null;
    room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    room.phase = "NEXT_ROUND";

    this.roundsByRoom.delete(roomId);
    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Ends the game and shows the final scoreboard. */
  hostEndGame(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    room.phase = "GAME_RESULT";
    room.activePlayerId = null;
    room.controllingTeamId = null;
    room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    room.lastActivityAt = Date.now();
    return room;
  }

  /** Called only by the server's own scheduled timeout, never a client action. No-ops if the timer already moved on. */
  expireTimer(roomId: string, timerId: string): RoomSession | null {
    const room = this.roomsById.get(roomId);
    const round = this.roundsByRoom.get(roomId);
    if (!room || !round || room.timer.id !== timerId) return null;

    if (room.timer.kind === "QUESTION_INTRO" && room.phase === "FACE_OFF") {
      room.timer = { id: randomUUID(), kind: "BUZZ", durationMs: BUZZ_WINDOW_MS, startedAt: Date.now(), remainingMs: BUZZ_WINDOW_MS };
    } else if (room.timer.kind === "BUZZ" && room.phase === "FACE_OFF" && room.activePlayerId === null) {
      room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    } else if (room.timer.kind === "ANSWER" && room.phase === "FACE_OFF") {
      this.resolveFaceOffMiss(room, round);
    } else if (room.timer.kind === "STEAL_CONFERENCE") {
      room.phase = "STEAL_ATTEMPT";
      room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    } else {
      return null;
    }
    room.lastActivityAt = Date.now();
    return room;
  }

  getRoom(roomId: string): RoomSession | undefined {
    return this.roomsById.get(roomId);
  }

  private getRoomOrThrow(roomId: string): RoomSession {
    const room = this.roomsById.get(roomId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No such room");
    return room;
  }

  // ---------------------------------------------------------------------
  // Chat + talk-to-host mic (AI-host rooms). The mic is one per team: the
  // holder's audio streams to the room over WebRTC (signaled by the socket
  // layer) and their transcribed speech is posted here as VOICE chat.
  // ---------------------------------------------------------------------

  private pushChat(room: RoomSession, message: Omit<ChatMessage, "id" | "at">): ChatMessage {
    const full: ChatMessage = { ...message, id: randomUUID(), at: Date.now() };
    room.chat.push(full);
    if (room.chat.length > CHAT_HISTORY_LIMIT) room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
    room.lastActivityAt = Date.now();
    return full;
  }

  /** Any player in an AI-host room may chat, in any phase. VOICE posts must come from their team's current mic holder. */
  postPlayerChat(roomId: string, playerId: string, rawText: string, via: "TEXT" | "VOICE" = "TEXT"): { room: RoomSession; message: ChatMessage } {
    const room = this.getRoomOrThrow(roomId);
    if (room.hostMode !== "AI") throw new RoomError("NO_CHAT", "Chat is only available with the AI host");
    const player = room.players[playerId];
    if (!player) throw new RoomError("PLAYER_NOT_FOUND", "No such player in this room");
    const text = rawText.trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) throw new RoomError("EMPTY_MESSAGE", "Message cannot be blank");
    if (via === "VOICE" && (!player.teamId || room.micHolders[player.teamId] !== playerId)) {
      throw new RoomError("NO_MIC", "You don't have your team's mic");
    }
    // The stealing team's spoken huddle stays private: it belongs in team chat, not the room.
    if (via === "VOICE" && this.isStealHuddle(room) && player.teamId === room.controllingTeamId) {
      throw new RoomError("USE_TEAM_CHAT", "Your team is huddling — that goes to team chat");
    }
    const key = `${roomId}:${playerId}`;
    const now = Date.now();
    if (now - (this.lastChatAtByPlayer.get(key) ?? 0) < CHAT_MIN_INTERVAL_MS) {
      throw new RoomError("CHAT_TOO_FAST", "Slow down a little");
    }
    this.lastChatAtByPlayer.set(key, now);
    const message = this.pushChat(room, { from: "PLAYER", playerId, displayName: player.displayName, teamId: player.teamId, text, via });
    return { room, message };
  }

  /** The AI host's lines go into the chat too, so it reads as one conversation. */
  postHostChat(roomId: string, text: string): ChatMessage | null {
    const room = this.roomsById.get(roomId);
    if (!room || !text.trim()) return null;
    return this.pushChat(room, { from: "HOST", playerId: null, displayName: "AI Host", teamId: null, text: text.trim(), via: "TEXT" });
  }

  /** Takes the caller's team mic if it's free (re-claiming your own refreshes it). Returns a claim id for the auto-release. */
  claimMic(roomId: string, playerId: string): { room: RoomSession; claimId: string } {
    const room = this.getRoomOrThrow(roomId);
    if (room.hostMode !== "AI") throw new RoomError("NO_MIC", "The talk-to-host mic is only available with the AI host");
    const player = room.players[playerId];
    if (!player?.teamId) throw new RoomError("NOT_ON_A_TEAM", "Join a team to use the mic");
    const holder = room.micHolders[player.teamId];
    if (holder && holder !== playerId) {
      throw new RoomError("MIC_TAKEN", `${room.players[holder]?.displayName ?? "A teammate"} has your team's mic`);
    }
    room.micHolders[player.teamId] = playerId;
    const claimId = randomUUID();
    this.micClaimIds.set(`${roomId}:${player.teamId}`, claimId);
    room.lastActivityAt = Date.now();
    return { room, claimId };
  }

  /** Releases the caller's team mic if they hold it. With `claimId`, only that exact claim (used by the auto-release timeout). */
  releaseMic(roomId: string, playerId: string, claimId?: string): RoomSession | null {
    const room = this.roomsById.get(roomId);
    const teamId = room?.players[playerId]?.teamId;
    if (!room || !teamId || room.micHolders[teamId] !== playerId) return null;
    if (claimId && this.micClaimIds.get(`${roomId}:${teamId}`) !== claimId) return null;
    this.dropMic(room, playerId);
    room.lastActivityAt = Date.now();
    return room;
  }

  private dropMic(room: RoomSession, playerId: string): void {
    for (const [teamId, holder] of Object.entries(room.micHolders)) {
      if (holder === playerId) {
        room.micHolders[teamId] = null;
        this.micClaimIds.delete(`${room.roomId}:${teamId}`);
      }
    }
  }

  setPlayerConnected(roomId: string, playerId: string, connected: boolean): RoomSession | undefined {
    const room = this.roomsById.get(roomId);
    const player = room?.players[playerId];
    if (!room || !player) return undefined;
    player.connected = connected;
    if (!connected) this.dropMic(room, playerId);
    room.lastActivityAt = Date.now();
    return room;
  }

  touch(roomId: string): void {
    const room = this.roomsById.get(roomId);
    if (room) room.lastActivityAt = Date.now();
  }

  /** Removes every trace of a room's players, teams, scores, and board state. */
  destroyRoom(roomId: string): void {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    this.roomIdByCode.delete(room.roomCode);
    this.roomsById.delete(roomId);
    this.roundsByRoom.delete(roomId);
    this.askedQuestionIdsByRoom.delete(roomId);
    this.avatarsByRoom.delete(roomId);
    for (const key of [...this.lastChatAtByPlayer.keys(), ...this.micClaimIds.keys()]) {
      if (key.startsWith(`${roomId}:`)) {
        this.lastChatAtByPlayer.delete(key);
        this.micClaimIds.delete(key);
      }
    }
  }

  /** Destroys any room whose lastActivityAt is older than ttlSeconds. Returns destroyed room IDs. */
  sweepExpired(ttlSeconds: number, now: number = Date.now()): string[] {
    const ttlMs = ttlSeconds * 1000;
    const expired: string[] = [];
    for (const room of this.roomsById.values()) {
      if (now - room.lastActivityAt > ttlMs) {
        expired.push(room.roomId);
      }
    }
    for (const roomId of expired) {
      this.destroyRoom(roomId);
    }
    return expired;
  }

  size(): number {
    return this.roomsById.size;
  }
}
