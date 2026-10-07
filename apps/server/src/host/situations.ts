import type { RoomSession } from "@zamily-feud/shared";
import type { Situation } from "./types.js";

/** Lets the cinematic intro (~3.8s on the client) finish before the host starts talking. */
export const OPENING_DELAY_MS = 4_200;
/** Lets the last flip, the missed answers, and the score bump land before the host moves on. */
export const ROUND_OVER_DELAY_MS = 5_500;
/** After the board clears, a short breath before the next question appears. */
export const NEXT_QUESTION_DELAY_MS = 1_800;
/** Lets the lobby render before the host's first hello. */
export const LOBBY_WELCOME_DELAY_MS = 1_200;

export interface SituationContext {
  faceOffAttemptedTeamIds: string[];
  totalRounds: number;
  /** The team that won the face-off for the current question (seen in CONTROL_DECISION), used to tell play from pass. */
  faceOffWinnerTeamId: string | null;
  /** The team that banks the board if a steal fails. */
  boardOwnerTeamId: string | null;
}

function teamName(room: RoomSession, teamId: string | null): string {
  return teamId ? room.teams[teamId]?.name ?? teamId : "nobody";
}

function otherTeam(room: RoomSession, teamId: string): string {
  return Object.keys(room.teams).find((id) => id !== teamId) ?? teamId;
}

/**
 * What, if anything, the AI host needs to do right now. Pure function of room
 * state: the director dedupes on `key`, so the same moment is never handled twice
 * and a moment the host already acted on disappears from here by itself.
 */
export function detectSituation(room: RoomSession, ctx: SituationContext): Situation | null {
  if (room.hostMode !== "AI") return null;
  const qid = room.currentQuestionId;

  if (room.phase === "LOBBY") {
    const creator = room.players[room.ownerId]?.displayName ?? "the creator";
    return {
      kind: "LOBBY_WELCOME",
      key: "lobby:welcome",
      eventType: "BANTER",
      brief: `${creator} just opened room ${room.roomCode} and is waiting for friends to join. Introduce yourself in character and warm up the room: friends join with the room code, ${creator} sorts the teams, and you'll run the show once teams are locked.`,
      allowed: ["say"],
      requiresAction: false,
      delayMs: LOBBY_WELCOME_DELAY_MS,
    };
  }

  if (room.phase === "GAME_RESULT") {
    // A team can only be empty here if its last player walked out mid-game (leaveRoom ends the game then).
    const walkout = Object.values(room.teams).find((t) => t.playerIds.length === 0);
    const winner = walkout ? Object.values(room.teams).find((t) => t.id !== walkout.id) : null;
    return {
      kind: "GAME_OVER",
      key: "game-over",
      eventType: "GAME_COMPLETE",
      brief:
        walkout && winner
          ? `The game ended early: everyone on ${walkout.name} left, so ${winner.name} wins by forfeit with ${winner.score} points. Sign off with a joke about the walkout (tease the exit, never the people), crown ${winner.name}, thank everyone.`
          : "The game is over. Deliver a short sign-off: crown the winner (or call the tie), toast the losers kindly, thank everyone.",
      allowed: ["say"],
      requiresAction: false,
    };
  }

  const sub = room.lastSubmission;
  if (sub && qid) {
    const team = teamName(room, sub.teamId);
    let stakes: string;
    if (room.phase === "FACE_OFF") {
      stakes = `This is the face-off. Correct = ${team} wins control of the board. Wrong = ${
        ctx.faceOffAttemptedTeamIds.length > 0 ? "both captains have now missed, and you'll have to award control" : "the other captain gets a shot"
      }.`;
    } else if (room.phase === "PLAYING_BOARD") {
      const strikes = room.teams[sub.teamId]?.strikes ?? 0;
      stakes = `${team} is playing the board with ${strikes} strike(s). Wrong = strike ${strikes + 1} of 3${
        strikes + 1 >= 3 ? `, and ${teamName(room, otherTeam(room, sub.teamId))} gets to steal` : ""
      }.`;
    } else {
      stakes = `This is ${team}'s ONE steal attempt for ${room.board.currentTotal} points. Correct = they steal the bank. Wrong = ${teamName(
        room,
        ctx.boardOwnerTeamId,
      )} keeps it.`;
    }
    return {
      kind: "JUDGE_ANSWER",
      key: `judge:${qid}:${sub.submittedAt}:${sub.playerId}`,
      eventType: "BANTER",
      brief: `${sub.displayName} (${team}) answered "${sub.text}". ${stakes} Decide: reveal the matching hidden answer, or mark it wrong.`,
      allowed: ["reveal_answer", "mark_wrong"],
      requiresAction: true,
    };
  }

  if (room.phase === "FACE_OFF" && qid === null) {
    return {
      kind: "OPEN_GAME",
      key: "start:1",
      eventType: "GAME_STARTED",
      brief: `The game is starting. Teams: ${Object.values(room.teams)
        .map((t) => t.name)
        .join(" vs ")}. Welcome everyone with a quick, funny cold open, then start the first question and read it out.`,
      allowed: ["say", "start_question", "end_game"],
      requiresAction: true,
      delayMs: OPENING_DELAY_MS,
    };
  }

  if (room.phase === "NEXT_ROUND") {
    const next = room.roundNumber + 1;
    return {
      kind: "START_QUESTION",
      key: `start:${next}`,
      eventType: "QUESTION_REVEALED",
      brief: `Time for round ${next} of ${ctx.totalRounds}${next === ctx.totalRounds ? " — the FINAL round" : ""}. Start the next question and read it out with some flair. (Only use end_game if start_question fails because the questions ran out.)`,
      allowed: ["say", "start_question", "end_game"],
      requiresAction: true,
      delayMs: NEXT_QUESTION_DELAY_MS,
    };
  }

  if (room.phase === "FACE_OFF" && qid && room.activePlayerId === null && room.timer.kind === null && room.controllingTeamId === null) {
    const remaining = Object.keys(room.teams).filter((id) => !ctx.faceOffAttemptedTeamIds.includes(id));
    if (remaining.length === 0) {
      return {
        kind: "FACE_OFF_DEADLOCK",
        key: `deadlock:${qid}`,
        eventType: "CONTROL_AWARDED",
        brief: "Both captains missed the face-off. Nobody can buzz again on this question, so you must award control of the board to one team — your call, but make it entertaining.",
        allowed: ["award_control"],
        requiresAction: true,
      };
    }
    return {
      kind: "BUZZER_IDLE",
      key: `idle:${qid}:${room.lastActivityAt}`,
      eventType: "BUZZ_TIMEOUT",
      brief: `The buzzer window closed and nobody is answering. Captains who can still buzz: ${remaining
        .map((id) => teamName(room, id))
        .join(", ")}. Reopen the buzzer (tease them), or if they keep stalling, award control to a team.`,
      allowed: ["reopen_buzzer", "award_control"],
      requiresAction: true,
    };
  }

  if (room.phase === "PLAYING_BOARD" && qid && room.controllingTeamId) {
    const passed = ctx.faceOffWinnerTeamId !== null && ctx.faceOffWinnerTeamId !== room.controllingTeamId;
    const playing = teamName(room, room.controllingTeamId);
    return {
      kind: "BOARD_DECISION",
      key: `board:${qid}`,
      eventType: passed ? "PASS_CHOSEN" : "PLAY_CHOSEN",
      brief: passed
        ? `${teamName(room, ctx.faceOffWinnerTeamId)} won the face-off but PASSED the board to ${playing}. React to that bold (or cowardly) move — ${playing} is now playing.`
        : `${playing} chose to PLAY the board. Hype them up; any of them can now type answers.`,
      allowed: ["say"],
      requiresAction: false,
    };
  }

  if (room.phase === "STEAL_CONFERENCE" && qid && room.controllingTeamId) {
    return {
      kind: "STEAL_HUDDLE",
      key: `steal:${qid}`,
      eventType: "STEAL_STARTED",
      brief: `${teamName(room, ctx.boardOwnerTeamId)} struck out with three strikes! ${teamName(
        room,
        room.controllingTeamId,
      )} gets ONE guess to steal all ${room.board.currentTotal} points. They're huddling now. Build the tension.`,
      allowed: ["say"],
      requiresAction: false,
    };
  }

  if (room.phase === "ROUND_RESULT" && qid) {
    const isFinal = room.roundNumber >= ctx.totalRounds;
    return {
      kind: "ROUND_OVER",
      key: `result:${qid}`,
      eventType: isFinal ? "GAME_COMPLETE" : "ROUND_COMPLETE",
      brief: isFinal
        ? `That was the final round (${room.roundNumber} of ${ctx.totalRounds}). End the game with a line that announces the final scores.`
        : `Round ${room.roundNumber} of ${ctx.totalRounds} is over. Recap it in one quick line (who banked what, current standings) and move to the next round.`,
      allowed: isFinal ? ["end_game"] : ["next_round"],
      requiresAction: true,
      delayMs: ROUND_OVER_DELAY_MS,
    };
  }

  return null;
}
