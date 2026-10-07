import { describe, expect, it } from "vitest";
import { RoomStore } from "../src/rooms/roomStore.js";

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
  const { room, playerId: ann } = store.createRoom("Ann", 3600, { hostMode: "AI" });
  const { playerId: amy } = store.joinRoom(room.roomCode, "Amy");
  const { playerId: bob } = store.joinRoom(room.roomCode, "Bob");
  const { playerId: ben } = store.joinRoom(room.roomCode, "Ben");
  store.assignPlayerToTeam(room.roomId, ann, ann, "team-1");
  store.assignPlayerToTeam(room.roomId, ann, amy, "team-1");
  store.assignPlayerToTeam(room.roomId, ann, bob, "team-2");
  store.assignPlayerToTeam(room.roomId, ann, ben, "team-2");
  return { store, roomId: room.roomId, ann, amy, bob, ben, room: () => store.getRoom(room.roomId)! };
}

describe("leaving a room", () => {
  it("removes the player everywhere, passes the captaincy and room ownership on, and logs the exit", () => {
    const { store, roomId, ann, amy, room } = aiRoom();
    store.claimMic(roomId, ann);
    const { closed } = store.leaveRoom(roomId, ann);
    expect(closed).toBe(false);
    expect(room().players[ann]).toBeUndefined();
    expect(room().teams["team-1"].playerIds).toEqual([amy]);
    expect(room().teams["team-1"].captainId).toBe(amy);
    expect(room().ownerId).not.toBe(ann);
    expect(room().micHolders["team-1"]).toBeNull();
    expect(room().roomEvents.at(-1)).toMatchObject({ kind: "LEFT", playerName: "Ann", teamName: "Team 1" });
  });

  it("counts a face-off answerer who walks out as a miss, so the other captain can buzz", async () => {
    const { store, roomId, ann, bob, room } = aiRoom();
    store.lockTeams(roomId, ann);
    await store.startQuestion(roomId, "ai-host");
    store.buzz(roomId, ann);
    store.leaveRoom(roomId, ann);
    expect(room().phase).toBe("FACE_OFF");
    expect(room().activePlayerId).toBeNull();
    expect(room().timer.kind).toBe("BUZZ");
    expect(() => store.buzz(roomId, bob)).not.toThrow();
  });

  it("ends the game when a team has nobody left", async () => {
    const { store, roomId, ann, bob, ben, room } = aiRoom();
    store.lockTeams(roomId, ann);
    store.leaveRoom(roomId, bob);
    expect(room().phase).toBe("FACE_OFF");
    store.leaveRoom(roomId, ben);
    expect(room().phase).toBe("GAME_RESULT");
  });

  it("closes the room when a human host or the last player leaves", () => {
    const human = new RoomStore();
    const { room, playerId: host } = human.createRoom("Host", 3600);
    human.joinRoom(room.roomCode, "Pat");
    expect(human.leaveRoom(room.roomId, host).closed).toBe(true);
    expect(human.getRoom(room.roomId)).toBeUndefined();

    const solo = new RoomStore();
    const { room: aiOnly, playerId: only } = solo.createRoom("Solo", 3600, { hostMode: "AI" });
    expect(solo.leaveRoom(aiOnly.roomId, only).closed).toBe(true);
    expect(solo.size()).toBe(0);
  });

  it("logs joins, renames, and shuffles for the host to react to, but not a no-op rename", () => {
    const { store, roomId, ann, room } = aiRoom();
    store.renameTeam(roomId, ann, "team-1", "Team 1");
    expect(room().roomEvents.some((e) => e.kind === "TEAM_RENAMED")).toBe(false);
    store.renameTeam(roomId, ann, "team-1", "Tacos");
    store.autoBalanceTeams(roomId, ann);
    expect(room().roomEvents.map((e) => e.kind)).toEqual(["JOINED", "JOINED", "JOINED", "TEAM_RENAMED", "TEAMS_SHUFFLED"]);
    expect(room().roomEvents[3]).toMatchObject({ previousName: "Team 1", teamName: "Tacos" });
  });
});
