import { randomUUID } from "node:crypto";
import {
  ANSWER_WINDOW_MS,
  BUZZ_WINDOW_MS,
  MAX_PLAYERS_PER_TEAM,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  STRIKES_TO_STEAL,
  TEAM_IDS,
} from "@zamily-feud/shared";
import type { HostBoardState, PlayerState, RoomSession, TeamState } from "@zamily-feud/shared";
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
}

export interface RoomStoreDeps {
  questionSource?: QuestionSource;
  embeddingProvider?: EmbeddingProvider;
  thresholds?: MatchThresholds;
  /** How long the stealing team gets to confer before their one steal attempt. Defaults to 20s. */
  stealConferenceMs?: number;
}

const DEFAULT_THRESHOLDS: MatchThresholds = { fuzzy: 0.82, vectorAccept: 0.9, vectorReject: 0.6 };

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

  constructor(private deps: RoomStoreDeps = {}) {}

  createRoom(displayName: string, ttlSeconds: number): { room: RoomSession; playerId: string } {
    const roomId = randomUUID();
    let roomCode = generateRoomCode();
    while (this.roomIdByCode.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerId = randomUUID();
    const teams = Object.fromEntries(TEAM_IDS.map((id, i) => [id, emptyTeam(id, `Team ${i + 1}`)]));
    const host: PlayerState = { id: playerId, displayName, teamId: null, connected: true, isHost: true, ready: false };

    const now = Date.now();
    const room: RoomSession = {
      roomId,
      roomCode,
      hostId: playerId,
      players: { [playerId]: host },
      teams,
      currentQuestionId: null,
      questionText: null,
      phase: "LOBBY",
      teamsLocked: false,
      activePlayerId: null,
      controllingTeamId: null,
      board: { slots: [], currentTotal: 0 },
      timer: { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 },
      lastSubmission: null,
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
    const player: PlayerState = { id: playerId, displayName, teamId: null, connected: true, isHost: false, ready: false };
    room.players[playerId] = player;

    room.lastActivityAt = Date.now();
    return { room, playerId };
  }

  /** Host-only. Moves a player onto a team (max 5) or back to the unassigned pool (teamId: null). */
  assignPlayerToTeam(roomId: string, requesterId: string, playerId: string, teamId: string | null): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
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

  /** Host-only. Randomly redistributes every player 50/50 across the two teams. */
  autoBalanceTeams(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    if (room.teamsLocked) throw new RoomError("TEAMS_LOCKED", "Teams are already locked");

    const teams = TEAM_IDS.map((id) => room.teams[id]);
    const shuffled = Object.values(room.players)
      .filter((p) => !p.isHost)
      .map((p) => p.id)
      .sort(() => Math.random() - 0.5);

    for (const team of teams) team.playerIds = [];
    shuffled.forEach((playerId, index) => {
      const team = teams[index % teams.length];
      team.playerIds.push(playerId);
      room.players[playerId].teamId = team.id;
    });
    for (const team of teams) recomputeCaptain(team);

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Renames a team (1-24 chars after trimming). */
  renameTeam(roomId: string, requesterId: string, teamId: string, name: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
    const team = room.teams[teamId];
    if (!team) throw new RoomError("TEAM_NOT_FOUND", "No such team");

    const trimmed = name.trim();
    if (!trimmed) throw new RoomError("INVALID_NAME", "Team name cannot be blank");
    team.name = trimmed.slice(0, MAX_TEAM_NAME_LENGTH);

    room.lastActivityAt = Date.now();
    return room;
  }

  /** Host-only. Closes the lobby: both teams must be non-empty. Advances phase to FACE_OFF. */
  lockTeams(roomId: string, requesterId: string): RoomSession {
    const room = this.getRoomOrThrow(roomId);
    requireHost(room, requesterId);
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
    room.phase = "FACE_OFF";
    room.activePlayerId = null;
    room.controllingTeamId = null;
    room.board = {
      slots: answers.map((a) => ({ answerId: a.answerId, answerText: null, points: a.points, rank: a.rank, revealed: false })),
      currentTotal: 0,
    };
    room.lastSubmission = null;
    room.timer = { id: randomUUID(), kind: "BUZZ", durationMs: BUZZ_WINDOW_MS, startedAt: Date.now(), remainingMs: BUZZ_WINDOW_MS };

    this.roundsByRoom.set(roomId, {
      questionId: picked.id,
      answers,
      faceOffAttemptedTeamIds: new Set(),
      boardOwnerTeamId: null,
      stealAttempted: false,
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
  async submitAnswer(roomId: string, requesterId: string, rawText: string): Promise<RoomSession> {
    const room = this.getRoomOrThrow(roomId);
    const round = this.roundsByRoom.get(roomId);
    if (!round) throw new RoomError("NO_ACTIVE_QUESTION", "No question is active");

    const text = rawText.trim().slice(0, 120);
    if (!text) throw new RoomError("EMPTY_ANSWER", "Answer cannot be blank");

    const player = room.players[requesterId];
    if (!player || !player.teamId) throw new RoomError("NOT_ON_A_TEAM", "You are not on a team");

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

    const unrevealed = round.answers.map((a, index) => ({ a, index })).filter(({ index }) => !room.board.slots[index].revealed);
    const matchable: MatchableAnswer[] = unrevealed.map(({ a }) => a);
    const thresholds = this.deps.thresholds ?? DEFAULT_THRESHOLDS;
    const embed = this.deps.embeddingProvider ? (t: string) => this.embedOne(t) : undefined;
    const match = await matchAnswer(text, matchable, thresholds, embed);
    const slotIndex = match.slotIndex !== null ? unrevealed[match.slotIndex].index : null;

    room.lastSubmission = {
      playerId: requesterId,
      teamId: player.teamId,
      displayName: player.displayName,
      text,
      suggestion: { ...match, slotIndex },
      submittedAt: Date.now(),
    };

    if (room.phase === "FACE_OFF") {
      room.timer = { id: null, kind: null, durationMs: 0, startedAt: null, remainingMs: 0 };
    }

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

    if (room.phase === "FACE_OFF") {
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

    if (room.timer.kind === "BUZZ" && room.phase === "FACE_OFF" && room.activePlayerId === null) {
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

  setPlayerConnected(roomId: string, playerId: string, connected: boolean): RoomSession | undefined {
    const room = this.roomsById.get(roomId);
    const player = room?.players[playerId];
    if (!room || !player) return undefined;
    player.connected = connected;
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
