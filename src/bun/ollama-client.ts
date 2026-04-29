import type { ZodType } from "zod/v4";

type FetchFn = typeof globalThis.fetch;

export type OllamaModel = {
  name: string;
  size: number;
  parameterSize: string;
};

const MAX_RETRIES = 3;

export class OllamaClient {
  constructor(
    private baseUrl: string = "http://localhost:11434",
    private fetchFn: FetchFn = globalThis.fetch
  ) {}

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await this.fetchFn(`${this.baseUrl}/api/tags`);
    const data = (await res.json()) as {
      models: Array<{ name: string; size: number; details: { parameter_size: string } }>;
    };
    return data.models.map((m) => ({
      name: m.name,
      size: m.size,
      parameterSize: m.details.parameter_size,
    }));
  }

  async infer<T>(prompt: string, schema: ZodType<T>, model: string): Promise<T> {
    let lastError: Error | null = null;
    let currentPrompt = prompt;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await this.fetchFn(`${this.baseUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify({
          model,
          prompt: currentPrompt,
          format: "json",
          stream: false,
        }),
      });

      const data = (await res.json()) as { response: string };
      let parsed: unknown;

      try {
        parsed = JSON.parse(data.response);
      } catch (e) {
        lastError = new Error(`JSON parse failed: ${data.response}`);
        currentPrompt = `${prompt}\n\nYour previous response was not valid JSON. Error: ${lastError.message}. Please respond with valid JSON only.`;
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }

      lastError = new Error(`Zod validation failed: ${JSON.stringify(result.error)}`);
      currentPrompt = `${prompt}\n\nYour previous response had validation errors: ${lastError.message}. Please fix and respond with valid JSON.`;
    }

    throw lastError ?? new Error("Inference failed after retries");
  }
}
