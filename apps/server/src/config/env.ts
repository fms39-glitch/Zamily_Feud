import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  ROOM_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  STEAL_TIMER_SECONDS: z.coerce.number().int().positive().default(20),
  FAST_MONEY_TARGET: z.coerce.number().int().positive().default(200),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  LLM_PROVIDER: z.string().default("anthropic"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-haiku-4-5"),

  EMBEDDING_PROVIDER: z.string().default("openai"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),

  EXACT_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(1.0),
  FUZZY_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.82),
  VECTOR_AUTO_ACCEPT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  VECTOR_AUTO_REJECT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),

  TTS_PROVIDER: z.string().default("mock"),
  TTS_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Fails fast on startup if the environment is misconfigured (spec §26). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
