import type { Database } from "bun:sqlite";
import { getSecret } from "./secret-store";

export const API_KEY_NAME = "gemini_api_key_enc";

type EnvSource = Record<string, string | undefined>;

export function getConfiguredGeminiKey(
  db: Database,
  env: EnvSource = process.env,
): string | null {
  const stored = getSecret(db, API_KEY_NAME);
  if (stored) return stored;
  return env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? null;
}

export function hasConfiguredGeminiKey(
  db: Database,
  env: EnvSource = process.env,
): boolean {
  return getConfiguredGeminiKey(db, env) !== null;
}
