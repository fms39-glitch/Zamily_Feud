export type MatchMethod = "EXACT" | "FUZZY" | "VECTOR" | "LLM" | "NO_MATCH";

export interface EvaluationResult {
  matched: boolean;
  answerId?: string;
  matchedAnswer?: string;
  points?: number;
  rank?: number;
  method: MatchMethod;
  similarity?: number;
  latencyMs: number;
}

export interface VectorMatch {
  answerId: string;
  answerText: string;
  points: number;
  rank: number;
  similarity: number;
}

export type MatchDecision = "MATCH" | "NO_MATCH";

export interface LlmMatchRequest {
  userAnswer: string;
  candidateAnswer: string;
  question: string;
}

export interface LlmMatchResponse {
  match: boolean;
  confidence: number;
  reason: string;
}
