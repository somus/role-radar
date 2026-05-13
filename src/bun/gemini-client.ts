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
    const result = await this.inferStructured(prompt, schema, model);
    return result.data;
  }

  async inferStructured<T>(
    prompt: string,
    schema: ZodType<T>,
    model: string = DEFAULT_MODEL,
  ): Promise<{ data: T; rawText: string; model: string }> {
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
      const started = performance.now();
      const attemptNumber = attempt + 1;

      let res: Response;
      try {
        console.log(
          `[gemini] request model=${model} attempt=${attemptNumber}/${MAX_RETRIES} promptChars=${prompt.length} schema=${jsonSchema ? "json-schema" : "json-only"}`,
        );
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

      console.log(
        `[gemini] response model=${model} attempt=${attemptNumber}/${MAX_RETRIES} status=${res.status} in ${(
          (performance.now() - started) /
          1000
        ).toFixed(1)}s`,
      );

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
        console.warn(`[gemini] retry model=${model} attempt=${attemptNumber}/${MAX_RETRIES} reason=json-parse`);
        currentPrompt = `${prompt}\n\nYour previous response was not valid JSON. Please respond with valid JSON only.`;
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return { data: result.data, rawText: text, model };
      }

      lastError = new Error(`Validation failed: ${JSON.stringify(result.error)}`);
      console.warn(`[gemini] retry model=${model} attempt=${attemptNumber}/${MAX_RETRIES} reason=validation`);
      currentPrompt = `${prompt}\n\nYour previous response had validation errors: ${lastError.message}. Please fix and respond with valid JSON.`;
    }

    throw lastError ?? new Error("Inference failed after retries");
  }
}
