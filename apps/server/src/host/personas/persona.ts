/**
 * A complete on-air personality for the AI host. Every section of the system
 * prompt that's about *how* the host talks comes from here, so switching
 * persona changes the whole show — not just one paragraph. The rules that keep
 * the game fair and safe (judging, hidden answers, tools) live in ../prompt.ts and
 * are the same for everyone.
 */
export interface Persona {
  /** The host's stage identity, in one breath. */
  identity: string;
  /** Delivery: rhythm, vocabulary, energy. */
  voice: string[];
  /** The comedic techniques this host reaches for. */
  humor: string[];
  /** The twist-based tricks only this host pulls: the surprise that makes a line land. */
  signature: string[];
  /** How this host plays each kind of moment in the show. */
  moments: {
    /** The lobby, before teams lock: keeping the waiting room fun. */
    lobby: string;
    /** Someone joins the room. */
    arrival: string;
    /** Someone leaves, in the lobby or mid-game. */
    departure: string;
    opening: string;
    question: string;
    correct: string;
    topAnswer: string;
    wrong: string;
    strikeOut: string;
    steal: string;
    playOrPass: string;
    stall: string;
    recap: string;
    finale: string;
  };
  /** How this host talks with players in the chat and on the mic. */
  chat: string[];
  /** Where this host's line is — on top of the shared safety rules. */
  boundaries: string[];
  /** Overused moves this host should steer clear of. */
  avoid: string[];
  /** Style reference only — the model is told never to reuse these verbatim. */
  examples: string[];
}

/** Renders one persona as the "who you are" half of the system prompt. */
export function renderPersona(p: Persona): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  const m = p.moments;
  return `## Who you are
${p.identity}

## Your voice
${list(p.voice)}

## Your comedy toolkit
${list(p.humor)}

## Your signature tricks (yours alone; rotate them, and never telegraph the twist)
${list(p.signature)}

## How you play each moment
- The lobby (waiting for players): ${m.lobby}
- Someone joins: ${m.arrival}
- Someone leaves: ${m.departure}
- Opening the show: ${m.opening}
- Reading a new question: ${m.question}
- Correct answer: ${m.correct}
- Number one answer: ${m.topAnswer}
- Wrong answer: ${m.wrong}
- Third strike: ${m.strikeOut}
- Steal: ${m.steal}
- Play or pass: ${m.playOrPass}
- Nobody's buzzing: ${m.stall}
- End of a round: ${m.recap}
- End of the game: ${m.finale}

## Talking with players
${list(p.chat)}

## Your limits (on top of the house rules below)
${list(p.boundaries)}

## Avoid
${list(p.avoid)}

## Lines you've already used on past shows (style reference only: saying one again, or one close to it, is a rerun)
${list(p.examples)}`;
}
