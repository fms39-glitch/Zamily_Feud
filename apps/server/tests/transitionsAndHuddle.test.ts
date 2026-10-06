import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import { RoomError, RoomStore } from "../src/rooms/roomStore.js";
import { CannedHostBrain } from "../src/host/cannedBrain.js";
import { createSocketServer } from "../src/realtime/socketServer.js";
import { loadConfig } from "../src/config/env.js";
import type { QuestionSource } from "../src/dataset/questionSource.js";

const PETS: QuestionSource = {
  async pickQuestion() {
    return {
      id: "q-pets",
      questionText: "Name a pet",
      answers: [
        { answerId: "p1", answerText: "Dog", normalizedAnswer: "dog", points: 50, rank: 1, embedding: null },
        { answerId: "p2", answerText: "Cat", normalizedAnswer: "cat", points: 30, rank: 2, embedding: null },
        { answerId: "p3", answerText: "Fish", normalizedAnswer: "fish", points: 10, rank: 3, embedding: null },
      ],
    };
  },
};

/** An AI room (two players per team), already through the face-off and three strikes: team-2 is huddling to steal. */
async function stealHuddleRoom() {
  const store = new RoomStore({ questionSource: PETS, questionIntroMs: 0, aiTotalRounds: 3 });
  const { room, playerId: ann } = store.createRoom("Ann", 3600, { hostMode: "AI" });
  const roomId = room.roomId;
  const amy = store.joinRoom(room.roomCode, "Amy").playerId;
  const bob = store.joinRoom(room.roomCode, "Bob").playerId;
  const ben = store.joinRoom(room.roomCode, "Ben").playerId;
  for (const [p, t] of [[ann, "team-1"], [amy, "team-1"], [bob, "team-2"], [ben, "team-2"]] as const) store.assignPlayerToTeam(roomId, ann, p, t);
  store.lockTeams(roomId, ann);
  await store.startQuestion(roomId, "ai-host");
  store.buzz(roomId, ann);
  await store.submitAnswer(roomId, ann, "dog");
  store.hostReveal(roomId, "ai-host", 0);
  store.choosePlay(roomId, ann);
  for (let i = 0; i < 3; i++) {
    await store.submitAnswer(roomId, ann, `wrong ${i}`);
    store.hostWrong(roomId, "ai-host");
  }
  return { store, roomId, ann, amy, bob, ben, room: () => store.getRoom(roomId)! };
}

describe("question transitions (AI rooms)", () => {
  it("shows the question before opening the buzzer, then opens it when the intro ends", async () => {
    const store = new RoomStore({ questionSource: PETS, questionIntroMs: 4500 });
    const { room, playerId: ann } = store.createRoom("Ann", 3600, { hostMode: "AI" });
    const bob = store.joinRoom(room.roomCode, "Bob").playerId;
    store.assignPlayerToTeam(room.roomId, ann, ann, "team-1");
    store.assignPlayerToTeam(room.roomId, ann, bob, "team-2");
    store.lockTeams(room.roomId, ann);
    const started = await store.startQuestion(room.roomId, "ai-host");
    expect(started.questionText).toBe("Name a pet");
    expect(started.timer).toMatchObject({ kind: "QUESTION_INTRO", durationMs: 4500 });
    expect(() => store.buzz(room.roomId, ann)).toThrow(/buzzer isn't open/);

    store.expireTimer(room.roomId, started.timer.id!);
    expect(store.getRoom(room.roomId)!.timer.kind).toBe("BUZZ");
    expect(store.buzz(room.roomId, ann).activePlayerId).toBe(ann);
  });

  it("keeps human-hosted rooms instant, and tells AI rooms how many rounds there are", async () => {
    const store = new RoomStore({ questionSource: PETS, aiTotalRounds: 7 });
    const human = store.createRoom("Host", 3600);
    expect(human.room.totalRounds).toBeNull();
    expect(store.createRoom("Ann", 3600, { hostMode: "AI" }).room.totalRounds).toBe(7);
  });

  it("flips the answers nobody got when a round ends, without scoring them", async () => {
    const { store, roomId, bob, room } = await stealHuddleRoom();
    store.endStealHuddle(roomId, bob);
    await store.submitAnswer(roomId, bob, "hamster");
    store.hostWrong(roomId, "ai-host"); // failed steal: team-1 banks the 50
    expect(room().phase).toBe("ROUND_RESULT");
    expect(room().teams["team-1"].score).toBe(50);
    expect(room().board.slots.map((s) => [s.answerText, s.revealed, s.missed])).toEqual([
      ["Dog", true, false],
      ["Cat", true, true],
      ["Fish", true, true],
    ]);
  });
});

describe("steal huddle", () => {
  it("lets only the stealing team end the discussion early", async () => {
    const { store, roomId, ann, ben, room } = await stealHuddleRoom();
    expect(room().phase).toBe("STEAL_CONFERENCE");
    expect(() => store.endStealHuddle(roomId, ann)).toThrow(/Only the stealing team/);
    store.endStealHuddle(roomId, ben);
    expect(room().phase).toBe("STEAL_ATTEMPT");
    expect(room().timer.kind).toBeNull();
    expect(() => store.endStealHuddle(roomId, ben)).toThrow(RoomError);
  });

  it("keeps the team chat to the stealing team, and only during the steal", async () => {
    const { store, roomId, ann, bob, ben } = await stealHuddleRoom();
    const { message, recipientIds } = store.postTeamChat(roomId, bob, "I think it's cat");
    expect(message).toMatchObject({ displayName: "Bob", text: "I think it's cat", teamId: "team-2" });
    expect(recipientIds.sort()).toEqual([bob, ben].sort());
    expect(() => store.postTeamChat(roomId, ann, "we can hear you")).toThrow(/stealing team/);
  });

  it("routes the stealing team's mic privately: transcripts to team chat, audio to teammates only", async () => {
    const { store, roomId, ann, amy, bob, ben } = await stealHuddleRoom();
    store.claimMic(roomId, bob);
    expect(() => store.postPlayerChat(roomId, bob, "it's cat", "VOICE")).toThrow(/team chat/);
    expect(store.canHearMic(roomId, bob, ben)).toBe(true);
    expect(store.canHearMic(roomId, bob, ann)).toBe(false);
    store.claimMic(roomId, amy);
    expect(store.canHearMic(roomId, amy, bob)).toBe(true); // the other team's mic still reaches everyone
  });
});

describe("player pictures", () => {
  const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

  it("stores small images in memory and drops them with the room", () => {
    const store = new RoomStore();
    const { room, playerId } = store.createRoom("Ann", 3600, { hostMode: "AI" });
    store.setAvatar(room.roomId, playerId, TINY_JPEG);
    expect(store.getRoom(room.roomId)!.players[playerId].hasAvatar).toBe(true);
    expect(store.getAvatars(room.roomId)).toEqual({ [playerId]: TINY_JPEG });
    store.setAvatar(room.roomId, playerId, null);
    expect(store.getAvatars(room.roomId)).toEqual({});
    store.setAvatar(room.roomId, playerId, TINY_JPEG);
    store.destroyRoom(room.roomId);
    expect(store.getAvatars(room.roomId)).toEqual({});
  });

  it("rejects anything that isn't a small image data URL", () => {
    const store = new RoomStore();
    const { room, playerId } = store.createRoom("Ann", 3600);
    for (const bad of ["https://example.com/a.png", "data:text/html;base64,PHNjcmlwdD4=", `data:image/png;base64,${"A".repeat(70_000)}`, 42]) {
      expect(() => store.setAvatar(room.roomId, playerId, bad)).toThrow(/picture/);
    }
  });
});

describe("over real sockets", () => {
  let http: HttpServer | null = null;
  const sockets: Socket[] = [];
  afterEach(() => {
    sockets.forEach((s) => s.close());
    sockets.length = 0;
    http?.close();
    http = null;
  });

  it("delivers huddle messages to the stealing team only, and pictures to everyone", async () => {
    const store = new RoomStore({ questionSource: PETS, questionIntroMs: 0 });
    http = createServer();
    createSocketServer(http, loadConfig({ NODE_ENV: "test" }), store, { llm: null, canned: new CannedHostBrain() });
    await new Promise<void>((r) => http!.listen(0, r));
    const url = `http://localhost:${(http.address() as AddressInfo).port}`;
    const client = () => {
      const s = connect(url, { transports: ["websocket"] });
      sockets.push(s);
      return s;
    };
    const emit = <T,>(s: Socket, ev: string, payload: unknown) => new Promise<T>((r) => s.emit(ev, payload, r));

    const [ann, bob, ben] = [client(), client(), client()];
    const created = await emit<{ roomId: string; roomCode: string; playerId: string }>(ann, "ROOM_CREATE", { displayName: "Ann", hostMode: "AI" });
    const bobId = (await emit<{ playerId: string }>(bob, "ROOM_JOIN", { roomCode: created.roomCode, displayName: "Bob" })).playerId;
    const benId = (await emit<{ playerId: string }>(ben, "ROOM_JOIN", { roomCode: created.roomCode, displayName: "Ben" })).playerId;

    const avatarsSeenByBen: Record<string, string>[] = [];
    ben.on("PLAYER_AVATARS", (p: { avatars: Record<string, string> }) => avatarsSeenByBen.push(p.avatars));
    expect(await emit(bob, "PLAYER_SET_AVATAR", { image: "data:image/jpeg;base64,/9j/4AAQ" })).toEqual({ ok: true });

    // Put team-2 (Bob, Ben) into a steal huddle directly through the store.
    const roomId = created.roomId;
    store.assignPlayerToTeam(roomId, created.playerId, created.playerId, "team-1");
    store.assignPlayerToTeam(roomId, created.playerId, bobId, "team-2");
    store.assignPlayerToTeam(roomId, created.playerId, benId, "team-2");
    store.lockTeams(roomId, created.playerId);
    await store.startQuestion(roomId, "ai-host");
    store.buzz(roomId, created.playerId);
    await store.submitAnswer(roomId, created.playerId, "dog");
    store.hostReveal(roomId, "ai-host", 0);
    store.choosePlay(roomId, created.playerId);
    for (let i = 0; i < 3; i++) {
      await store.submitAnswer(roomId, created.playerId, `nope ${i}`);
      store.hostWrong(roomId, "ai-host");
    }

    const got = { ann: [] as string[], bob: [] as string[], ben: [] as string[] };
    ann.on("TEAM_CHAT_MESSAGE", (m: { text: string }) => got.ann.push(m.text));
    bob.on("TEAM_CHAT_MESSAGE", (m: { text: string }) => got.bob.push(m.text));
    ben.on("TEAM_CHAT_MESSAGE", (m: { text: string }) => got.ben.push(m.text));
    expect(await emit(bob, "TEAM_CHAT_SEND", { text: "cat?" })).toEqual({ ok: true });
    expect(await emit(ann, "TEAM_CHAT_SEND", { text: "spying" })).toMatchObject({ code: "NO_HUDDLE" });
    await new Promise((r) => setTimeout(r, 150));

    expect(got).toEqual({ ann: [], bob: ["cat?"], ben: ["cat?"] });
    expect(avatarsSeenByBen.at(-1)).toEqual({ [bobId]: "data:image/jpeg;base64,/9j/4AAQ" });
    expect(await emit(ben, "STEAL_READY", {})).toEqual({ ok: true });
    expect(store.getRoom(roomId)!.phase).toBe("STEAL_ATTEMPT");
  });
});
