import { type ZodType, toJSONSchema } from "zod/v4";

type FetchFn = typeof globalThis.fetch;

export const GEMINI_FLASH = "gemini-2.5-flash";
export const GEMINI_FLASH_LITE = "gemini-2.5-flash-lite";

const DEFAULT_MODEL = GEMINI_FLASH;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MAX_RETRIES = 3;
const TIMEOUT_MS = 120_000;

export class GeminiClient {
  constructor(
    private apiKey: string,
    private fetchFn: FetchFn = globalThis.fetch
  ) {}

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${BASE_URL}/models/${DEFAULT_MODEL}`, {
        headers: { "x-goog-api-key": this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async infer<T>(prompt: string, schema: ZodType<T>, model: string = DEFAULT_MODEL): Promise<T> {
    let jsonSchema: object | undefined;
    try {
      jsonSchema = toJSONSchema(schema);
    } catch {
      console.log("[gemini] Schema has transforms, falling back to JSON-only mode (no responseJsonSchema)");
    }
    let lastError: Error | null = null;
    let currentPrompt = prompt;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let res: Response;
      try {
        res = await this.fetchFn(
          `${BASE_URL}/models/${model}:generateContent`,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: currentPrompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                ...(jsonSchema ? { responseJsonSchema: jsonSchema } : {}),
              },
            }),
          }
        );
      } catch (e: any) {
        clearTimeout(timer);
        if (e.name === "AbortError") throw new Error("Gemini request timed out (2 min).");
        throw e;
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errorBody}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        lastError = new Error(`JSON parse failed: ${text}`);
        currentPrompt = `${prompt}\n\nYour previous response was not valid JSON. Please respond with valid JSON only.`;
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }

      lastError = new Error(`Validation failed: ${JSON.stringify(result.error)}`);
      currentPrompt = `${prompt}\n\nYour previous response had validation errors: ${lastError.message}. Please fix and respond with valid JSON.`;
    }

    throw lastError ?? new Error("Inference failed after retries");
  }
}
