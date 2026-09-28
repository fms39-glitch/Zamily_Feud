import { beforeEach, describe, expect, it } from "vitest";
import { RoomError, RoomStore } from "../src/rooms/roomStore.js";
import type { QuestionSource, QuestionWithAnswers } from "../src/dataset/questionSource.js";
import type { EmbeddingProvider } from "../src/providers/embedding/EmbeddingProvider.js";

const EGYPT_QUESTION: QuestionWithAnswers = {
  id: "q-egypt",
  questionText: "Name something you associate with Egypt",
  answers: [
    { answerId: "a1", answerText: "Pyramids", normalizedAnswer: "pyramid", points: 40, rank: 1, embedding: null },
    { answerId: "a2", answerText: "Sphinx", normalizedAnswer: "sphinx", points: 25, rank: 2, embedding: null },
    { answerId: "a3", answerText: "Camels", normalizedAnswer: "camel", points: 15, rank: 3, embedding: null },
  ],
};

const NILE_QUESTION: QuestionWithAnswers = {
  id: "q-nile",
  questionText: "Name a river",
  answers: [{ answerId: "b1", answerText: "Nile", normalizedAnswer: "nile", points: 50, rank: 1, embedding: null }],
};

function fakeQuestionSource(questions: QuestionWithAnswers[]): QuestionSource {
  return {
    async pickQuestion(excludeIds) {
      const excluded = new Set(excludeIds);
      return questions.find((q) => !excluded.has(q.id)) ?? null;
    },
  };
}

function fakeEmbeddingProvider(vectors: Record<string, number[]>): EmbeddingProvider {
  return {
    modelName: "fake",
    dimension: 3,
    async embed(texts) {
      return texts.map((t) => vectors[t] ?? [0, 0, 0]);
    },
  };
}

describe("RoomStore game engine", () => {
  let store: RoomStore;

  function setupTwoTeamRoom() {
    store = new RoomStore({ questionSource: fakeQuestionSource([EGYPT_QUESTION, NILE_QUESTION]) });
    const { room, playerId: hostId } = store.createRoom("Host", 3600);
    const { playerId: aliceId } = store.joinRoom(room.roomCode, "Alice");
    const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
    store.assignPlayerToTeam(room.roomId, hostId, aliceId, "team-1");
    store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-2");
    store.lockTeams(room.roomId, hostId);
    return { roomId: room.roomId, hostId, aliceId, bobId };
  }

  beforeEach(() => {
    store = new RoomStore();
  });

  it("opens the buzzer with a hidden board once the host starts a question", async () => {
    const { roomId, hostId } = setupTwoTeamRoom();
    const room = await store.startQuestion(roomId, hostId);
    expect(room.phase).toBe("FACE_OFF");
    expect(room.questionText).toBe(EGYPT_QUESTION.questionText);
    expect(room.timer.kind).toBe("BUZZ");
    expect(room.board.slots).toHaveLength(3);
    expect(room.board.slots.every((s) => s.answerText === null && !s.revealed)).toBe(true);

    const hostBoard = store.getHostBoard(roomId);
    expect(hostBoard?.slots.map((s) => s.answerText)).toEqual(["Pyramids", "Sphinx", "Camels"]);
  });

  it("only lets the team captain buzz", async () => {
    const { roomId, hostId, aliceId, bobId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    expect(() => store.buzz(roomId, hostId)).toThrow(RoomError);

    const room = store.buzz(roomId, aliceId);
    expect(room.activePlayerId).toBe(aliceId);
    expect(room.controllingTeamId).toBe("team-1");
    expect(room.timer.kind).toBe("ANSWER");
    expect(() => store.buzz(roomId, bobId)).toThrow(RoomError);
  });

  it("suggests a match on submit without revealing it, then reveals on host command", async () => {
    const { roomId, hostId, aliceId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);

    const afterSubmit = await store.submitAnswer(roomId, aliceId, "pyramids");
    expect(afterSubmit.lastSubmission?.suggestion.slotIndex).toBe(0);
    expect(afterSubmit.lastSubmission?.suggestion.matched).toBe(true);
    expect(afterSubmit.board.slots[0].revealed).toBe(false); // matching never reveals by itself

    const revealed = store.hostReveal(roomId, hostId, 0);
    expect(revealed.board.slots[0]).toMatchObject({ answerText: "Pyramids", revealed: true });
    expect(revealed.board.currentTotal).toBe(40);
    expect(revealed.phase).toBe("CONTROL_DECISION");
    expect(revealed.controllingTeamId).toBe("team-1");
  });

  it("rejects a reveal/wrong call from anyone but the host", async () => {
    const { roomId, hostId, aliceId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);
    expect(() => store.hostReveal(roomId, aliceId, 0)).toThrow(RoomError);
    expect(() => store.hostWrong(roomId, aliceId)).toThrow(RoomError);
  });

  it("gives the other captain a shot after a face-off miss, with no strike recorded", async () => {
    const { roomId, hostId, aliceId, bobId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);
    const afterWrong = store.hostWrong(roomId, hostId);
    expect(afterWrong.teams["team-1"].strikes).toBe(0);
    expect(afterWrong.timer.kind).toBe("BUZZ");
    expect(afterWrong.activePlayerId).toBeNull();

    expect(() => store.buzz(roomId, aliceId)).toThrow(RoomError); // team-1 already attempted
    const room = store.buzz(roomId, bobId);
    expect(room.controllingTeamId).toBe("team-2");
  });

  it("requires the host to manually assign control once both face-off attempts miss", async () => {
    const { roomId, hostId, aliceId, bobId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);
    store.hostWrong(roomId, hostId);
    store.buzz(roomId, bobId);
    const afterSecondMiss = store.hostWrong(roomId, hostId);
    expect(afterSecondMiss.timer.kind).toBeNull();
    expect(afterSecondMiss.phase).toBe("FACE_OFF");

    const assigned = store.hostAssignControl(roomId, hostId, "team-2");
    expect(assigned.phase).toBe("CONTROL_DECISION");
    expect(assigned.controllingTeamId).toBe("team-2");
  });

  it("runs a full board: play, strike to a steal, and a successful steal banks the whole total", async () => {
    const { roomId, hostId, aliceId, bobId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);
    await store.submitAnswer(roomId, aliceId, "pyramids");
    store.hostReveal(roomId, hostId, 0); // team-1 controls, board total = 40

    expect(() => store.choosePlay(roomId, bobId)).toThrow(RoomError); // not their decision
    const playing = store.choosePlay(roomId, aliceId);
    expect(playing.phase).toBe("PLAYING_BOARD");

    await store.submitAnswer(roomId, aliceId, "sphinx");
    store.hostReveal(roomId, hostId, 1); // total = 65

    for (let i = 0; i < 3; i++) {
      const room = store.hostWrong(roomId, hostId);
      if (i < 2) expect(room.teams["team-1"].strikes).toBe(i + 1);
    }
    const afterThirdStrike = store.getRoom(roomId)!;
    expect(afterThirdStrike.phase).toBe("STEAL_CONFERENCE");
    expect(afterThirdStrike.controllingTeamId).toBe("team-2");

    const attempting = store.hostAdvanceSteal(roomId, hostId);
    expect(attempting.phase).toBe("STEAL_ATTEMPT");

    await store.submitAnswer(roomId, bobId, "camels");
    const final = store.hostReveal(roomId, hostId, 2);
    expect(final.phase).toBe("ROUND_RESULT");
    expect(final.teams["team-2"].score).toBe(80); // full board total, not just the last slot's points
    expect(final.teams["team-1"].score).toBe(0);
  });

  it("banks to the original team when a steal attempt fails", async () => {
    const { roomId, hostId, aliceId, bobId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);
    await store.submitAnswer(roomId, aliceId, "pyramids");
    store.hostReveal(roomId, hostId, 0);
    store.choosePlay(roomId, aliceId);
    for (let i = 0; i < 3; i++) store.hostWrong(roomId, hostId);
    store.hostAdvanceSteal(roomId, hostId);

    await store.submitAnswer(roomId, bobId, "nonsense");
    const failed = store.hostWrong(roomId, hostId);
    expect(failed.phase).toBe("ROUND_RESULT");
    expect(failed.teams["team-1"].score).toBe(40);
    expect(failed.teams["team-2"].score).toBe(0);
  });

  it("moves on to a fresh face-off with a new question after hostNextRound", async () => {
    const { roomId, hostId, aliceId } = setupTwoTeamRoom();
    await store.startQuestion(roomId, hostId);
    store.buzz(roomId, aliceId);
    await store.submitAnswer(roomId, aliceId, "pyramids");
    store.hostReveal(roomId, hostId, 0);
    store.choosePlay(roomId, aliceId);
    for (let i = 0; i < 3; i++) store.hostWrong(roomId, hostId);
    store.hostAdvanceSteal(roomId, hostId);
    store.hostWrong(roomId, hostId); // steal fails, banks to team-1, phase ROUND_RESULT

    const next = store.hostNextRound(roomId, hostId);
    expect(next.phase).toBe("NEXT_ROUND");
    expect(next.teams["team-1"].strikes).toBe(0);
    expect(next.currentQuestionId).toBeNull();

    const secondQuestion = await store.startQuestion(roomId, hostId);
    expect(secondQuestion.questionText).toBe(NILE_QUESTION.questionText);
  });

  it("times out an unanswered buzz window without recording a strike", async () => {
    const { roomId, hostId, aliceId } = setupTwoTeamRoom();
    const started = await store.startQuestion(roomId, hostId);
    const originalBuzzTimerId = started.timer.id; // room is mutated in place, so snapshot the id now
    store.buzz(roomId, aliceId);
    const answerTimerId = store.getRoom(roomId)!.timer.id!;

    const expired = store.expireTimer(roomId, answerTimerId);
    expect(expired?.timer.kind).toBe("BUZZ"); // reopened for the other team
    expect(expired?.teams["team-1"].strikes).toBe(0);
    expect(store.expireTimer(roomId, originalBuzzTimerId!)).toBeNull(); // stale timer id is a no-op
  });

  it("uses the embedding tier to auto-accept a synonym once fuzzy matching misses", async () => {
    const embeddedQuestion: QuestionWithAnswers = {
      ...EGYPT_QUESTION,
      answers: EGYPT_QUESTION.answers.map((a, i) => ({ ...a, embedding: [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0] })),
    };
    store = new RoomStore({
      questionSource: fakeQuestionSource([embeddedQuestion]),
      embeddingProvider: fakeEmbeddingProvider({ boat: [1, 0, 0] }),
      thresholds: { fuzzy: 0.82, vectorAccept: 0.9, vectorReject: 0.6 },
    });
    const { room, playerId: hostId } = store.createRoom("Host", 3600);
    const { playerId: aliceId } = store.joinRoom(room.roomCode, "Alice");
    const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
    store.assignPlayerToTeam(room.roomId, hostId, aliceId, "team-1");
    store.assignPlayerToTeam(room.roomId, hostId, bobId, "team-2");
    store.lockTeams(room.roomId, hostId);
    await store.startQuestion(room.roomId, hostId);
    store.buzz(room.roomId, aliceId);

    const afterSubmit = await store.submitAnswer(room.roomId, aliceId, "boat"); // not fuzzy-close to any answer text
    expect(afterSubmit.lastSubmission?.suggestion.method).toBe("VECTOR");
    expect(afterSubmit.lastSubmission?.suggestion.slotIndex).toBe(0);
    expect(afterSubmit.lastSubmission?.suggestion.autoAccept).toBe(true);
  });
});
