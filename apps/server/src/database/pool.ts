import { Pool } from "pg";
import type { AppConfig } from "../config/env.js";

/** Any Postgres with pgvector works here — Supabase is just the hosted default. */
export function createPool(config: AppConfig): Pool {
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Set it in .env before running dataset scripts.");
  }
  return new Pool({ connectionString: config.DATABASE_URL });
}
