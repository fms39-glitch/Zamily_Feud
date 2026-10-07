import { describe, expect, it } from "vitest";
import { AI_HOST_ID, type HostCommentary } from "@zamily-feud/shared";
import { RoomError, RoomStore } from "../src/rooms/roomStore.js";
import { AiHostDirector } from "../src/host/aiHostDirector.js";
import { CannedHostBrain } from "../src/host/cannedBrain.js";
import type { HostBrain, HostTurn } from "../src/host/types.js";
import type { QuestionSource, QuestionWithAnswers } from "../src/dataset/questionSource.js";

const QUESTIONS: QuestionWithAnswers[] = [
  {
    id: "q-egypt",
    questionText: "Name something you associate with Egypt",
    answers: [
      { answerId: "a1", answerText: "Pyramids", normalizedAnswer: "pyramid", points: 40, rank: 1, embedding: null },
      { answerId: "a2", answerText: "Sphinx", normalizedAnswer: "sphinx", points: 25, rank: 2, embedding: null },
    ],
  },
  {
    id: "q-river",
    questionText: "Name a river",
    answers: [{ answerId: "b1", answerText: "Nile", normalizedAnswer: "nile", points: 50, rank: 1, embedding: null }],
  },
];

function questionSource(): QuestionSource {
  return {
    async pickQuestion(excludeIds) {
      const excluded = new Set(excludeIds);
      return QUESTIONS.find((q) => !excluded.has(q.id)) ?? null;
    },
  };
}

function setup(llm: HostBrain | null = null, totalRounds = 2) {
  // These tests buzz straight away; the question intro has its own test.
  const store = new RoomStore({ questionSource: questionSource(), questionIntroMs: 0 });
  const { room, playerId: ownerId } = store.createRoom("Owner", 3600, { hostMode: "AI", hostPersona: "GEN_Z" });
  const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
  store.assignPlayerToTeam(room.roomId, ownerId, ownerId, "team-1");
  store.assignPlayerToTeam(room.roomId, ownerId, bobId, "team-2");

  const said: HostCommentary[] = [];
  const strikes: number[] = [];
  const director: AiHostDirector = new AiHostDirector(
    store,
    {
      commit: (roomId) => director.notify(roomId), // mirrors broadcastRoom → notify in the socket server
      broadcast: (roomId) => director.notify(roomId),
      say: (_roomId, c) => said.push(c),
      slotRevealed: () => {},
      strike: (_roomId, _teamId, n) => strikes.push(n),
      error: () => {},
    },
    { llm, canned: new CannedHostBrain() },
    { totalRounds, sleep: async () => {} },
  );

  const roomId = room.roomId;
  const step = async () => {
    director.notify(roomId);
    await director.idle(roomId);
  };
  return { store, director, roomId, ownerId, bobId, said, strikes, step, room: () => store.getRoom(roomId)! };
}

describe("AI host mode — room setup", () => {
  it("makes the creator a team-eligible player and the virtual AI the host", () => {
    const { room, ownerId } = setup();
    expect(room().hostId).toBe(AI_HOST_ID);
    expect(room().ownerId).toBe(ownerId);
    expect(room().players[ownerId].isHost).toBe(false);
    expect(room().players[ownerId].teamId).toBe("team-1");
    expect(room().hostPersona).toBe("GEN_Z");
  });

  it("lets the creator manage the lobby but not run the game", async () => {
    const { store, roomId, ownerId, bobId } = setup();
    expect(() => store.assignPlayerToTeam(roomId, bobId, bobId, "team-1")).toThrow(RoomError);
    store.lockTeams(roomId, ownerId);
    await expect(store.startQuestion(roomId, ownerId)).rejects.toThrow(RoomError);
  });

  it("keeps HUMAN mode unchanged by default", () => {
    const store = new RoomStore();
    const { room, playerId } = store.createRoom("Host", 3600);
    expect(room.hostMode).toBe("HUMAN");
    expect(room.hostId).toBe(playerId);
    expect(room.ownerId).toBe(playerId);
    expect(room.players[playerId].isHost).toBe(true);
  });

  it("blocks a second answer while the AI host is still judging one", async () => {
    const { store, roomId, ownerId, bobId, step } = setup();
    store.lockTeams(roomId, ownerId);
    await step();
    store.buzz(roomId, ownerId);
    await store.submitAnswer(roomId, ownerId, "camels"); // not judged yet: nothing has notified the director
    await expect(store.submitAnswer(roomId, bobId, "sand")).rejects.toMatchObject({ code: "HOST_JUDGING" });
  });
});

describe("AI host director — canned brain runs a whole game", () => {
  it("opens, judges, strikes, steals, advances rounds, and ends the game on its own", async () => {
    const { store, roomId, ownerId, bobId, said, strikes, step, room } = setup(null, 2);

    store.lockTeams(roomId, ownerId);
    await step();
    expect(room().roundNumber).toBe(1);
    expect(room().questionText).toBe(QUESTIONS[0].questionText);
    expect(room().timer.kind).toBe("BUZZ");
    expect(said.length).toBeGreaterThanOrEqual(2); // cold open + reading the question
    expect(said.every((c) => c.source === "CANNED")).toBe(true);

    // Face-off: owner buzzes and nails the top answer → their team gets control.
    store.buzz(roomId, ownerId);
    await store.submitAnswer(roomId, ownerId, "pyramids");
    await step();
    expect(room().board.slots[0].revealed).toBe(true);
    expect(room().phase).toBe("CONTROL_DECISION");
    expect(room().lastSubmission).toBeNull();

    store.choosePlay(roomId, ownerId);
    await step();

    // Three wrong answers → strikes → steal huddle for Bob's team.
    for (const guess of ["camels", "sand", "mummies"]) {
      await store.submitAnswer(roomId, ownerId, guess);
      await step();
    }
    expect(strikes).toEqual([1, 2, 3]);
    expect(room().phase).toBe("STEAL_CONFERENCE");
    expect(room().controllingTeamId).toBe("team-2");

    // Steal lands during the huddle — the host opens the attempt and awards it.
    await store.submitAnswer(roomId, bobId, "sphinx");
    await step();
    // ROUND_RESULT → host recaps and moves on → next question is up.
    expect(room().teams["team-2"].score).toBe(65);
    expect(room().roundNumber).toBe(2);
    expect(room().questionText).toBe(QUESTIONS[1].questionText);

    // Final round: Bob's team wins the face-off on a one-answer board, which banks it outright.
    store.buzz(roomId, bobId);
    await store.submitAnswer(roomId, bobId, "nile");
    await step();
    expect(room().teams["team-2"].score).toBe(115);
    expect(room().phase).toBe("GAME_RESULT");
    expect(said.at(-1)?.eventType).toBe("GAME_COMPLETE");
  });

  it("reopens a dead buzzer, then awards control if captains keep stalling", async () => {
    const { store, roomId, ownerId, step, room } = setup();
    store.lockTeams(roomId, ownerId);
    await step();
    for (let i = 0; i < 2; i++) {
      store.expireTimer(roomId, room().timer.id!);
      await step();
      expect(room().timer.kind).toBe("BUZZ");
    }
    store.expireTimer(roomId, room().timer.id!);
    await step();
    expect(room().phase).toBe("CONTROL_DECISION");
    expect(room().controllingTeamId).not.toBeNull();
  });
});

describe("AI host director — LLM brain safety nets", () => {
  async function toJudging(llm: HostBrain) {
    const ctx = setup(llm);
    ctx.store.lockTeams(ctx.roomId, ctx.ownerId);
    await ctx.step();
    ctx.store.buzz(ctx.roomId, ctx.ownerId);
    await ctx.store.submitAnswer(ctx.roomId, ctx.ownerId, "pyramids");
    await ctx.step();
    return ctx;
  }

  it("falls back to the canned host when the LLM call throws", async () => {
    const failing: HostBrain = {
      name: "LLM",
      takeTurn: async () => {
        throw new Error("timeout");
      },
    };
    const { room, said } = await toJudging(failing);
    expect(room().phase).toBe("CONTROL_DECISION");
    expect(said.some((c) => c.source === "CANNED")).toBe(true);
  });

  it("gives the LLM a second try at a game move before any canned line is used", async () => {
    let judgeCalls = 0;
    const flaky: HostBrain = {
      name: "LLM",
      async takeTurn(turn: HostTurn) {
        if (turn.situation.kind !== "JUDGE_ANSWER") {
          if (turn.situation.allowed.includes("start_question")) await turn.execute({ name: "start_question", line: "Let's go!" });
          return;
        }
        if (++judgeCalls === 1) throw new Error("timeout");
        await turn.execute({ name: "reveal_answer", slotNumber: 1, line: "Pyramids, on the second try!" });
      },
    };
    const { room, said } = await toJudging(flaky);
    expect(judgeCalls).toBe(2);
    expect(room().board.slots[0].revealed).toBe(true);
    expect(said.every((c) => c.source === "LLM")).toBe(true);
  });

  it("rejects illegal moves with a readable error and lets the LLM correct itself", async () => {
    const errors: string[] = [];
    const llm: HostBrain = {
      name: "LLM",
      async takeTurn(turn: HostTurn) {
        if (turn.situation.kind !== "JUDGE_ANSWER") {
          if (turn.situation.allowed.includes("start_question")) {
            await turn.execute({ name: "start_question", line: "Let's go!" });
            await turn.execute({ name: "say", line: `Here it is: ${turn.room.questionText}` });
          }
          return;
        }
        const illegal = await turn.execute({ name: "next_round", line: "skip!" });
        if (!illegal.ok) errors.push(illegal.error);
        const badSlot = await turn.execute({ name: "reveal_answer", slotNumber: 9, line: "?" });
        if (!badSlot.ok) errors.push(badSlot.error);
        await turn.execute({ name: "reveal_answer", slotNumber: 1, line: "Pyramids! Number one!" });
      },
    };
    const { room, said } = await toJudging(llm);
    expect(errors[0]).toMatch(/isn't a legal move/);
    expect(errors[1]).toMatch(/no slot #9/);
    expect(room().board.slots[0].revealed).toBe(true);
    expect(said.map((c) => c.text)).toContain("Pyramids! Number one!");
    expect(said.every((c) => c.source === "LLM")).toBe(true);
  });

  it("finishes a required move the LLM only talked about", async () => {
    const chatty: HostBrain = {
      name: "LLM",
      async takeTurn(turn) {
        await turn.execute({ name: "say", line: "Ooh, interesting answer..." });
      },
    };
    const { room } = await toJudging(chatty);
    expect(room().board.slots[0].revealed).toBe(true);
  });
});

describe("AI host — slow answer matching (regression)", () => {
  it("judges and moves on even when matching outlasts the face-off answer window", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = new RoomStore({
      questionIntroMs: 0,
      questionSource: {
        async pickQuestion() {
          return {
            id: "q-emb",
            questionText: "Name a pet",
            answers: [
              { answerId: "e1", answerText: "Dog", normalizedAnswer: "dog", points: 50, rank: 1, embedding: [1, 0, 0] },
              { answerId: "e2", answerText: "Cat", normalizedAnswer: "cat", points: 30, rank: 2, embedding: [0, 1, 0] },
            ],
          };
        },
      },
      // Like the local model's first call: embedding takes longer than the 3s answer window.
      embeddingProvider: { modelName: "slow", dimension: 3, embed: async (t) => (await gate, t.map(() => [0, 0, 1])) },
    });
    const { room, playerId: ownerId } = store.createRoom("Owner", 3600, { hostMode: "AI" });
    const { playerId: bobId } = store.joinRoom(room.roomCode, "Bob");
    store.assignPlayerToTeam(room.roomId, ownerId, ownerId, "team-1");
    store.assignPlayerToTeam(room.roomId, ownerId, bobId, "team-2");
    store.lockTeams(room.roomId, ownerId);
    const director: AiHostDirector = new AiHostDirector(
      store,
      { commit: (id) => director.notify(id), broadcast: (id) => director.notify(id), say: () => {}, slotRevealed: () => {}, strike: () => {}, error: () => {} },
      { llm: null, canned: new CannedHostBrain() },
      { totalRounds: 3, sleep: async () => {} },
    );
    const step = async () => (director.notify(room.roomId), await director.idle(room.roomId));
    await step();

    store.buzz(room.roomId, ownerId);
    const answerTimerId = store.getRoom(room.roomId)!.timer.id!;
    const submitting = store.submitAnswer(room.roomId, ownerId, "hamster");
    store.expireTimer(room.roomId, answerTimerId); // the 3s window fires mid-matching
    release();
    await submitting;
    await step();

    const after = store.getRoom(room.roomId)!;
    expect(after.lastSubmission).toBeNull(); // judged, not stuck
    expect(after.phase).toBe("FACE_OFF");
    expect(after.timer.kind).toBe("BUZZ"); // Bob's captain gets their shot
    expect(store.getFaceOffAttemptedTeamIds(room.roomId)).toEqual(["team-1"]);
  });
});

describe("spoken answers", () => {
  it("matches on a speech-to-text runner-up guess when the top transcript misses", async () => {
    const { store, roomId, ownerId, step, room } = setup();
    store.lockTeams(roomId, ownerId);
    await step();
    store.buzz(roomId, ownerId);
    expect(room().timer.durationMs).toBe(10_000); // long enough to say or type an answer
    await store.submitAnswer(roomId, ownerId, "spanks", ["sphinx", "sphynx", "spinks", "extra", "ignored"]);
    const sub = room().lastSubmission!;
    expect(sub.text).toBe("spanks"); // everyone still sees what was actually heard
    expect(sub.alternatives).toEqual(["sphinx", "sphynx", "spinks"]); // capped at 3
    expect(sub.matchedOn).toBe("sphinx");
    expect(sub.suggestion).toMatchObject({ slotIndex: 1, autoAccept: true });
    await step();
    expect(room().board.slots[1].revealed).toBe(true);
  });

  it("ignores junk alternatives from the client", async () => {
    const { store, roomId, ownerId, step, room } = setup();
    store.lockTeams(roomId, ownerId);
    await step();
    store.buzz(roomId, ownerId);
    await store.submitAnswer(roomId, ownerId, "camels", [42, "", "  ", "CAMELS", { x: 1 }] as unknown as string[]);
    expect(room().lastSubmission!.alternatives).toEqual([]);
    expect(room().lastSubmission!.matchedOn).toBe("camels");
  });
});
