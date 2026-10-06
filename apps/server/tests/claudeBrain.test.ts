import { describe, expect, it } from "vitest";
import type { RoomSession } from "@zamily-feud/shared";
import { ClaudeHostBrain } from "../src/host/claudeBrain.js";
import type { ActionOutcome, HostAction, HostTurn, Situation } from "../src/host/types.js";

/** Minimal Messages API stand-in: records each request body and replies with the next scripted content. */
function fakeApi(replies: unknown[][]) {
  const requests: Record<string, any>[] = [];
  const fetchFn = (async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const content = replies.shift() ?? [{ type: "text", text: "..." }];
    const stop_reason = content.some((b: any) => b.type === "tool_use") ? "tool_use" : "end_turn";
    return new Response(
      JSON.stringify({
        id: `msg_${requests.length}`,
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content,
        stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { fetchFn, requests };
}

function judgeTurn(execute: (a: HostAction) => Promise<ActionOutcome>): HostTurn {
  const room = {
    roomId: "r",
    hostMode: "AI",
    hostPersona: "MILLENNIAL",
    phase: "PLAYING_BOARD",
    roundNumber: 1,
    questionText: "Name something you associate with Egypt",
    controllingTeamId: "team-1",
    players: { p1: { id: "p1", displayName: "Alice" } },
    teams: {
      "team-1": { id: "team-1", name: "Cats", playerIds: ["p1"], captainId: "p1", score: 0, strikes: 0 },
      "team-2": { id: "team-2", name: "Dogs", playerIds: [], captainId: null, score: 0, strikes: 0 },
    },
    board: { slots: [], currentTotal: 0 },
    lastSubmission: {
      playerId: "p1",
      teamId: "team-1",
      displayName: "Alice",
      text: "the big triangles",
      alternatives: [],
      matchedOn: "the big triangles",
      submittedAt: 1,
      suggestion: { matched: false, method: "NO_MATCH", latencyMs: 0, slotIndex: null, autoAccept: false },
    },
  } as unknown as RoomSession;
  const situation: Situation = {
    kind: "JUDGE_ANSWER",
    key: "judge",
    eventType: "BANTER",
    brief: "Judge it.",
    allowed: ["reveal_answer", "mark_wrong"],
    requiresAction: true,
  };
  let done = false;
  return {
    room,
    hostBoard: {
      questionId: "q",
      slots: [
        { answerId: "a1", answerText: "Pyramids", points: 40, rank: 1, revealed: false },
        { answerId: "a2", answerText: "Sphinx", points: 25, rank: 2, revealed: true },
      ],
    },
    persona: "MILLENNIAL",
    situation,
    totalRounds: 5,
    faceOffAttemptedTeamIds: [],
    showLog: [],
    buzzerReopens: 0,
    execute: async (a) => {
      const out = await execute(a);
      if (out.ok && a.name !== "say") done = true;
      return out;
    },
    actionDone: () => done,
  };
}

describe("ClaudeHostBrain", () => {
  it("offers only the legal tools, hides nothing it needs, and executes the chosen move", async () => {
    const { fetchFn, requests } = fakeApi([
      [{ type: "tool_use", id: "t1", name: "reveal_answer", input: { slot_number: 1, line: "Big triangles? That's Pyramids!" } }],
    ]);
    const executed: HostAction[] = [];
    const brain = new ClaudeHostBrain({ apiKey: "test", model: "claude-haiku-4-5", timeoutMs: 1000, fetch: fetchFn });
    await brain.takeTurn(judgeTurn(async (a) => (executed.push(a), { ok: true, resolved: true, result: "done" })));

    expect(executed).toEqual([{ name: "reveal_answer", slotNumber: 1, line: "Big triangles? That's Pyramids!" }]);
    expect(requests).toHaveLength(1);
    const body = requests[0];
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.tools.map((t: any) => t.name)).toEqual(["reveal_answer", "mark_wrong"]);
    expect(body.tools.every((t: any) => t.strict === true)).toBe(true);
    expect(body.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(body.output_config).toBeUndefined(); // Haiku 4.5 rejects effort
    expect(body.messages[0].content).toContain("#1 Pyramids — 40 pts — hidden");
    expect(body.messages[0].content).toContain("<answer>the big triangles</answer>");
  });

  it("feeds tool errors back so the model can correct itself", async () => {
    const { fetchFn, requests } = fakeApi([
      [{ type: "tool_use", id: "t1", name: "reveal_answer", input: { slot_number: 2, line: "Sphinx!" } }],
      [{ type: "tool_use", id: "t2", name: "mark_wrong", input: { line: "Already up there, bestie." } }],
    ]);
    const brain = new ClaudeHostBrain({ apiKey: "test", model: "claude-opus-5-5", timeoutMs: 1000, fetch: fetchFn });
    const executed: string[] = [];
    await brain.takeTurn(
      judgeTurn(async (a) => {
        executed.push(a.name);
        return a.name === "reveal_answer" ? { ok: false, error: "#2 is already revealed" } : { ok: true, resolved: true, result: "ok" };
      }),
    );
    expect(executed).toEqual(["reveal_answer", "mark_wrong"]);
    const retry = requests[1].messages.at(-1).content[0];
    expect(retry).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: true, content: "#2 is already revealed" });
    expect(requests[0].output_config).toEqual({ effort: "low" });
  });

  it("nudges once when the model talks instead of making a required move", async () => {
    const { fetchFn, requests } = fakeApi([
      [{ type: "text", text: "Hmm, let me think about triangles." }],
      [{ type: "tool_use", id: "t1", name: "reveal_answer", input: { slot_number: 1, line: "Pyramids!" } }],
    ]);
    const brain = new ClaudeHostBrain({ apiKey: "test", model: "claude-haiku-4-5", timeoutMs: 1000, fetch: fetchFn });
    const executed: string[] = [];
    await brain.takeTurn(judgeTurn(async (a) => (executed.push(a.name), { ok: true, resolved: true, result: "ok" })));
    expect(executed).toEqual(["reveal_answer"]);
    expect(requests[1].messages.at(-1).content).toMatch(/must make a move/);
  });
});
