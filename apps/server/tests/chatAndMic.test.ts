import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import { HOST_PERSONAS, type HostCommentary, type RoomSession } from "@zamily-feud/shared";
import { RoomError, RoomStore } from "../src/rooms/roomStore.js";
import { AiHostDirector } from "../src/host/aiHostDirector.js";
import { CannedHostBrain } from "../src/host/cannedBrain.js";
import { buildSystemPrompt } from "../src/host/prompt.js";
import { PERSONAS } from "../src/host/personas/index.js";
import { createSocketServer } from "../src/realtime/socketServer.js";
import { loadConfig } from "../src/config/env.js";

const ONE_QUESTION = {
  async pickQuestion() {
    return {
      id: "q1",
      questionText: "Name a pet",
      answers: [
        { answerId: "a1", answerText: "Dog", normalizedAnswer: "dog", points: 50, rank: 1, embedding: null },
        { answerId: "a2", answerText: "Cat", normalizedAnswer: "cat", points: 30, rank: 2, embedding: null },
      ],
    };
  },
};

function aiRoom() {
  const store = new RoomStore({ questionSource: ONE_QUESTION, questionIntroMs: 0 });
  const { room, playerId: ann } = store.createRoom("Ann", 3600, { hostMode: "AI", hostPersona: "SASSY" });
  const { playerId: amy } = store.joinRoom(room.roomCode, "Amy");
  const { playerId: bob } = store.joinRoom(room.roomCode, "Bob");
  store.assignPlayerToTeam(room.roomId, ann, ann, "team-1");
  store.assignPlayerToTeam(room.roomId, ann, amy, "team-1");
  store.assignPlayerToTeam(room.roomId, ann, bob, "team-2");
  return { store, roomId: room.roomId, ann, amy, bob, room: () => store.getRoom(room.roomId)! };
}

describe("persona prompts", () => {
  it("gives every persona a full, distinct personality on top of the same house rules", () => {
    const prompts = HOST_PERSONAS.map((p) => buildSystemPrompt(p.id));
    expect(new Set(prompts).size).toBe(HOST_PERSONAS.length);
    for (const [i, p] of HOST_PERSONAS.entries()) {
      const persona = PERSONAS[p.id];
      expect(prompts[i]).toContain(persona.identity);
      for (const moment of Object.values(persona.moments)) expect(prompts[i]).toContain(moment);
      expect(prompts[i]).toContain("# House rules");
      expect(prompts[i]).toContain("## Chatting with players");
    }
    // Every section differs between personas, not just the intro.
    const [a, b] = [PERSONAS.FAMILY_FRIENDLY, PERSONAS.SASSY];
    for (const key of Object.keys(a.moments) as (keyof typeof a.moments)[]) expect(a.moments[key]).not.toBe(b.moments[key]);
    expect(a.chat).not.toEqual(b.chat);
    expect(a.boundaries).not.toEqual(b.boundaries);
  });
});

describe("chat", () => {
  it("lets any player chat in AI rooms, with a per-player rate limit", () => {
    const { store, roomId, bob, room } = aiRoom();
    store.postPlayerChat(roomId, bob, "hi host!");
    expect(room().chat.at(-1)).toMatchObject({ from: "PLAYER", displayName: "Bob", teamId: "team-2", text: "hi host!", via: "TEXT" });
    expect(() => store.postPlayerChat(roomId, bob, "again")).toThrow(/Slow down/);
  });

  it("is AI-host only, and voice messages require holding your team's mic", () => {
    const human = new RoomStore();
    const { room, playerId } = human.createRoom("Host", 3600);
    expect(() => human.postPlayerChat(room.roomId, playerId, "hello")).toThrow(RoomError);

    const { store, roomId, bob } = aiRoom();
    expect(() => store.postPlayerChat(roomId, bob, "spoken", "VOICE")).toThrow(/mic/);
    store.claimMic(roomId, bob);
    expect(store.postPlayerChat(roomId, bob, "spoken", "VOICE").message.via).toBe("VOICE");
  });
});

describe("team mic", () => {
  it("allows one holder per team, and each team has its own", () => {
    const { store, roomId, ann, amy, bob, room } = aiRoom();
    store.claimMic(roomId, ann);
    expect(() => store.claimMic(roomId, amy)).toThrow(/Ann has your team's mic/);
    store.claimMic(roomId, bob); // other team, independent
    expect(room().micHolders).toEqual({ "team-1": ann, "team-2": bob });
    store.releaseMic(roomId, ann);
    store.claimMic(roomId, amy);
    expect(room().micHolders["team-1"]).toBe(amy);
  });

  it("frees the mic on disconnect or team change, and a stale auto-release can't drop a newer claim", () => {
    const { store, roomId, ann, amy, room } = aiRoom();
    const first = store.claimMic(roomId, ann).claimId;
    store.releaseMic(roomId, ann);
    store.claimMic(roomId, ann);
    expect(store.releaseMic(roomId, ann, first)).toBeNull(); // the old timeout fires: ignored
    expect(room().micHolders["team-1"]).toBe(ann);

    store.setPlayerConnected(roomId, ann, false);
    expect(room().micHolders["team-1"]).toBeNull();

    store.claimMic(roomId, amy);
    store.assignPlayerToTeam(roomId, ann, amy, "team-2");
    expect(room().micHolders).toEqual({ "team-1": null, "team-2": null });
  });

  it("needs a team", () => {
    const { store, roomId, ann } = aiRoom();
    store.assignPlayerToTeam(roomId, ann, ann, null);
    expect(() => store.claimMic(roomId, ann)).toThrow(/Join a team/);
  });
});

describe("AI host in the chat", () => {
  function withDirector() {
    const ctx = aiRoom();
    const said: HostCommentary[] = [];
    const director: AiHostDirector = new AiHostDirector(
      ctx.store,
      {
        commit: (id) => director.notify(id),
        broadcast: (id) => director.notify(id),
        say: (_id, c) => said.push(c),
        slotRevealed: () => {},
        strike: () => {},
        error: () => {},
      },
      { llm: null, canned: new CannedHostBrain() },
      { totalRounds: 3, sleep: async () => {} },
    );
    const step = async () => (director.notify(ctx.roomId), await director.idle(ctx.roomId));
    return { ...ctx, said, step };
  }

  it("answers when addressed (even in the lobby), stays quiet otherwise, and posts its lines to the chat", async () => {
    const { store, roomId, bob, ann, said, step, room } = withDirector();
    store.postPlayerChat(roomId, bob, "lol nice one ann");
    await step();
    // The host is live in the lobby: a welcome, then one line for the two arrivals; the side chat gets no reply.
    expect(said).toHaveLength(2);
    const intro = said.length;

    store.postPlayerChat(roomId, ann, "host, how do I steal?");
    await step();
    expect(said).toHaveLength(intro + 1);
    expect(said.at(-1)!.text).toMatch(/steal/i); // the rules answer
    expect(room().chat.at(-1)).toMatchObject({ from: "HOST", text: said.at(-1)!.text });
  });

  it("jokes about an exit, and a walkout that empties a team ends the game with one sign-off", async () => {
    const { store, roomId, ann, amy, bob, said, step, room } = withDirector();
    await step();
    const before = said.length;
    store.leaveRoom(roomId, amy);
    await step();
    expect(said).toHaveLength(before + 1);
    expect(said.at(-1)!.text).toContain("Amy");

    store.lockTeams(roomId, ann);
    await step();
    const midGame = said.length;
    store.leaveRoom(roomId, bob); // team-2 is now empty
    await step();
    expect(room().phase).toBe("GAME_RESULT");
    expect(said).toHaveLength(midGame + 1); // the forfeit sign-off covers the exit; no second joke
    expect(said.at(-1)!.eventType).toBe("GAME_COMPLETE");
  });

  it("puts game moments ahead of chat, and keeps chatting while a team plays the board", async () => {
    const { store, roomId, ann, bob, said, step, room } = withDirector();
    store.lockTeams(roomId, ann);
    store.postPlayerChat(roomId, bob, "are you ready host?");
    await step();
    // The opening comes before the chat reply, even though the chat message arrived first.
    expect(said[0].eventType).toBe("GAME_STARTED");
    expect(said.at(-1)?.eventType).toBe("BANTER");

    store.buzz(roomId, ann);
    await store.submitAnswer(roomId, ann, "dog");
    await step();
    store.choosePlay(roomId, ann);
    await step();
    expect(room().phase).toBe("PLAYING_BOARD");
    const before = said.length;
    await new Promise((r) => setTimeout(r, 750)); // past the per-player chat rate limit
    store.postPlayerChat(roomId, bob, "host, you're rooting for them aren't you?");
    await step();
    expect(said.length).toBe(before + 1);
    expect(said.at(-1)?.eventType).toBe("BANTER");
    expect(room().chat.filter((m) => m.from === "HOST").length).toBe(said.length);
  });
});

describe("mic audio signaling (real sockets)", () => {
  let http: HttpServer | null = null;
  const sockets: Socket[] = [];
  afterEach(() => {
    sockets.forEach((s) => s.close());
    sockets.length = 0;
    http?.close();
    http = null;
  });

  async function start() {
    http = createServer();
    createSocketServer(http, loadConfig({ NODE_ENV: "test" }), new RoomStore(), { llm: null, canned: new CannedHostBrain() });
    await new Promise<void>((r) => http!.listen(0, r));
    const url = `http://localhost:${(http.address() as AddressInfo).port}`;
    const client = () => {
      const s = connect(url, { transports: ["websocket"] });
      sockets.push(s);
      return s;
    };
    const emit = <T,>(s: Socket, ev: string, payload: unknown) => new Promise<T>((r) => s.emit(ev, payload, r));
    return { client, emit };
  }

  it("relays signals only to the named player in the same room", async () => {
    const { client, emit } = await start();
    const ann = client();
    const bob = client();
    const eve = client();
    const created = await emit<{ roomCode: string; playerId: string }>(ann, "ROOM_CREATE", { displayName: "Ann", hostMode: "AI" });
    const bobJoin = await emit<{ playerId: string }>(bob, "ROOM_JOIN", { roomCode: created.roomCode, displayName: "Bob" });
    await emit(eve, "ROOM_CREATE", { displayName: "Eve", hostMode: "AI" }); // a different room

    const received: unknown[] = [];
    const eveGot: unknown[] = [];
    bob.on("RTC_SIGNAL", (p) => received.push(p));
    eve.on("RTC_SIGNAL", (p) => eveGot.push(p));

    const signal = { kind: "description", description: { type: "offer", sdp: "v=0" } };
    ann.emit("RTC_SIGNAL", { peerId: bobJoin.playerId, direction: "toListener", signal });
    eve.emit("RTC_SIGNAL", { peerId: bobJoin.playerId, direction: "toListener", signal }); // cross-room: dropped
    ann.emit("RTC_SIGNAL", { peerId: bobJoin.playerId, direction: "toListener", signal: { junk: "x".repeat(20_000) } }); // oversized: dropped
    await new Promise((r) => setTimeout(r, 150));

    expect(received).toEqual([{ peerId: created.playerId, direction: "toListener", signal }]);
    expect(eveGot).toEqual([]);
  });

  it("leaving updates everyone else's room, and a human host leaving sends everyone home", async () => {
    const { client, emit } = await start();
    const ann = client();
    const bob = client();
    const created = await emit<{ roomCode: string; playerId: string }>(ann, "ROOM_CREATE", { displayName: "Ann", hostMode: "AI" });
    const bobJoin = await emit<{ playerId: string }>(bob, "ROOM_JOIN", { roomCode: created.roomCode, displayName: "Bob" });
    let annRoom: RoomSession | null = null;
    ann.on("ROOM_UPDATED", ({ room }: { room: RoomSession }) => (annRoom = room));
    expect(await emit(bob, "ROOM_LEAVE", {})).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(annRoom!.players[bobJoin.playerId]).toBeUndefined();
    expect(await emit(bob, "CHAT_SEND", { text: "still here?" })).toMatchObject({ code: "NOT_IN_ROOM" });

    const host = client();
    const pat = client();
    const human = await emit<{ roomCode: string }>(host, "ROOM_CREATE", { displayName: "Host" });
    await emit(pat, "ROOM_JOIN", { roomCode: human.roomCode, displayName: "Pat" });
    const closed = new Promise<{ reason: string }>((r) => pat.once("ROOM_CLOSED", r));
    await emit(host, "ROOM_LEAVE", {});
    expect((await closed).reason).toMatch(/host left/i);
    expect(await emit(pat, "CHAT_SEND", { text: "hello?" })).toMatchObject({ code: "NOT_IN_ROOM" });
  });
});
