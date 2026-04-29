import type { ZodType } from "zod/v4";

type FetchFn = typeof globalThis.fetch;

export type OllamaModel = {
  name: string;
  size: number;
  parameterSize: string;
};

export type PullProgress = {
  status: string;
  completed?: number;
  total?: number;
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

  async *pullModel(name: string): AsyncGenerator<PullProgress> {
    const res = await this.fetchFn(`${this.baseUrl}/api/pull`, {
      method: "POST",
      body: JSON.stringify({ name, stream: true }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          yield JSON.parse(line) as PullProgress;
        }
      }
    }

    if (buffer.trim()) {
      yield JSON.parse(buffer) as PullProgress;
    }
  }
}
