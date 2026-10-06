import Anthropic from "@anthropic-ai/sdk";
import type { AgeCategory } from "@zamily-feud/shared";
import { buildSystemPrompt, buildTurnPrompt } from "./prompt.js";
import type { HostAction, HostActionName, HostBrain, HostTurn } from "./types.js";

const LINE_PROP = {
  line: { type: "string", description: "What you say out loud as you make this move. 1-2 short sentences, spoken by TTS." },
} as const;

function tool(name: HostActionName, description: string, extra: Record<string, unknown> = {}, extraRequired: string[] = []): Anthropic.Tool {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: "object",
      properties: { ...LINE_PROP, ...extra },
      required: ["line", ...extraRequired],
      additionalProperties: false,
    },
  };
}

/** Fixed order and content, so the tools prefix stays byte-stable; only the legal subset is sent each turn. */
const TOOLS: Record<HostActionName, Anthropic.Tool> = {
  say: tool("say", "Speak to the players without changing the game. Commentary, hype, reactions, reading the question."),
  start_question: tool(
    "start_question",
    "Pull the next survey question onto the board and open the face-off buzzer. Returns the question text; then use `say` to read it. `line` can be a short lead-in or empty.",
  ),
  reveal_answer: tool(
    "reveal_answer",
    "Rule the player's answer CORRECT: flip the hidden board slot it matches and award its points. Only hidden slots can be revealed.",
    { slot_number: { type: "integer", description: "The board slot number (#) the answer matches." } },
    ["slot_number"],
  ),
  mark_wrong: tool(
    "mark_wrong",
    "Rule the player's answer WRONG. In a face-off the other captain gets a shot; while playing the board it's a strike; on a steal the board owner keeps the points.",
  ),
  reopen_buzzer: tool("reopen_buzzer", "Re-open the face-off buzzer for captains who haven't attempted yet."),
  award_control: tool(
    "award_control",
    "Give a team control of the board (use when the face-off is stuck). That team's captain then chooses play or pass.",
    { team_id: { type: "string", description: "The team id, e.g. team-1." } },
    ["team_id"],
  ),
  next_round: tool("next_round", "Clear the board and move to the next round. `line` should recap the round and standings."),
  end_game: tool("end_game", "End the game and show the final scoreboard. `line` should announce the final result."),
  stay_quiet: {
    name: "stay_quiet",
    description: "Say nothing this time: players are chatting among themselves and don't need the host.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "A few words on why (for logs only; never shown)." } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
};

const MAX_STEPS = 4;
const MAX_LINE_CHARS = 280;

function toAction(name: string, input: unknown): HostAction | string {
  if (!(name in TOOLS)) return `Unknown tool ${name}`;
  const raw = (input ?? {}) as Record<string, unknown>;
  const line = typeof raw.line === "string" ? raw.line.trim().slice(0, MAX_LINE_CHARS) : "";
  switch (name as HostActionName) {
    case "reveal_answer": {
      const slotNumber = Number(raw.slot_number);
      if (!Number.isInteger(slotNumber)) return "slot_number must be an integer";
      return { name: "reveal_answer", line, slotNumber };
    }
    case "award_control":
      if (typeof raw.team_id !== "string") return "team_id must be a string";
      return { name: "award_control", line, teamId: raw.team_id };
    case "stay_quiet":
      return { name: "stay_quiet" };
    default:
      return { name: name as Exclude<HostActionName, "reveal_answer" | "award_control" | "stay_quiet">, line };
  }
}

export interface ClaudeBrainOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  effort?: "low" | "medium" | "high";
  /** Test seam: a stand-in for the HTTP layer. */
  fetch?: typeof fetch;
}

/** Models that take `output_config.effort`; Haiku 4.5 and the 4.5-generation models reject it. */
function supportsEffort(model: string): boolean {
  return !/haiku|-4-5|-4-1|-4-0|claude-3/.test(model);
}

/**
 * The AI host proper: a Claude tool-use loop over the game's legal moves.
 * One turn = one situation. The loop ends as soon as a move resolves the
 * situation; tool errors (illegal slot, stale answer, ...) go back to the model
 * so it can correct itself. Anything it can't finish is picked up by the
 * director's canned fallback, so a slow or failed call never stalls the game.
 */
export class ClaudeHostBrain implements HostBrain {
  readonly name = "LLM" as const;
  private client: Anthropic;
  private systemByPersona = new Map<AgeCategory, string>();

  constructor(private options: ClaudeBrainOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1, fetch: options.fetch });
  }

  async takeTurn(turn: HostTurn): Promise<void> {
    const tools = turn.situation.allowed.map((name) => TOOLS[name]);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildTurnPrompt(turn) }];
    const effort = this.options.effort ?? "low";

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await this.client.messages.create({
        model: this.options.model,
        max_tokens: 2048,
        system: [{ type: "text", text: this.system(turn.persona), cache_control: { type: "ephemeral" } }],
        tools,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages,
        ...(supportsEffort(this.options.model) ? { output_config: { effort } } : {}),
      });

      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
        throw new Error(`AI host turn stopped early: ${response.stop_reason}`);
      }

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        // Talked without a tool. If that's all the moment needs, speak it; otherwise nudge once more.
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join(" ")
          .trim();
        if (!turn.situation.requiresAction || turn.actionDone()) {
          if (text) await turn.execute({ name: "say", line: text.slice(0, MAX_LINE_CHARS) });
          return;
        }
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: `You must make a move with one of these tools now: ${turn.situation.allowed.join(", ")}.` });
        continue;
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      let resolved = false;
      for (const use of toolUses) {
        const action = toAction(use.name, use.input);
        const outcome = typeof action === "string" ? { ok: false as const, error: action } : await turn.execute(action);
        if (outcome.ok && outcome.resolved) resolved = true;
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: outcome.ok ? outcome.result : outcome.error,
          ...(outcome.ok ? {} : { is_error: true }),
        });
      }
      if (resolved) return;
      messages.push({ role: "user", content: results });
    }
  }

  private system(persona: AgeCategory): string {
    let prompt = this.systemByPersona.get(persona);
    if (!prompt) {
      prompt = buildSystemPrompt(persona);
      this.systemByPersona.set(persona, prompt);
    }
    return prompt;
  }
}
