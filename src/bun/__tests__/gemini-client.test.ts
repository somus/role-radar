import { describe, test, expect, beforeEach, mock } from "bun:test";
import { z } from "zod/v4";
import { GeminiClient } from "../gemini-client";

function geminiResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200 }
  );
}

describe("GeminiClient", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: GeminiClient;

  beforeEach(() => {
    mockFetch = mock();
    client = new GeminiClient("test-api-key", mockFetch as any);
  });

  test("checkHealth returns true on 200", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await client.checkHealth()).toBe(true);
  });

  test("checkHealth returns false on error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    expect(await client.checkHealth()).toBe(false);
  });

  test("checkHealth passes API key in header", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await client.checkHealth();
    const headers = (mockFetch.mock.calls[0] as any[])[1]?.headers;
    expect(headers?.["x-goog-api-key"]).toBe("test-api-key");
  });

  test("infer parses valid structured response", async () => {
    const schema = z.object({ name: z.string(), score: z.number() });
    mockFetch.mockResolvedValueOnce(
      geminiResponse(JSON.stringify({ name: "test", score: 85 }))
    );

    const result = await client.infer("test prompt", schema);
    expect(result).toEqual({ name: "test", score: 85 });
  });

  test("infer sends correct request shape", async () => {
    const schema = z.object({ value: z.string() });
    mockFetch.mockResolvedValueOnce(
      geminiResponse(JSON.stringify({ value: "ok" }))
    );

    await client.infer("my prompt", schema);

    const [url, opts] = mockFetch.mock.calls[0] as any[];
    expect(url).toContain(":generateContent");
    const body = JSON.parse(opts.body);
    expect(body.contents[0].parts[0].text).toBe("my prompt");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toBeDefined();
    expect(opts.headers["x-goog-api-key"]).toBe("test-api-key");
  });

  test("infer retries on JSON parse failure", async () => {
    const schema = z.object({ value: z.string() });
    mockFetch.mockResolvedValueOnce(geminiResponse("not json"));
    mockFetch.mockResolvedValueOnce(
      geminiResponse(JSON.stringify({ value: "ok" }))
    );

    const result = await client.infer("prompt", schema);
    expect(result).toEqual({ value: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("infer retries on Zod validation failure", async () => {
    const schema = z.object({ value: z.string() });
    mockFetch.mockResolvedValueOnce(
      geminiResponse(JSON.stringify({ value: 123 }))
    );
    mockFetch.mockResolvedValueOnce(
      geminiResponse(JSON.stringify({ value: "fixed" }))
    );

    const result = await client.infer("prompt", schema);
    expect(result).toEqual({ value: "fixed" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("infer throws after max retries", async () => {
    const schema = z.object({ value: z.string() });
    mockFetch.mockResolvedValueOnce(geminiResponse("bad json"));
    mockFetch.mockResolvedValueOnce(geminiResponse("bad json"));
    mockFetch.mockResolvedValueOnce(geminiResponse("bad json"));

    await expect(client.infer("prompt", schema)).rejects.toThrow("JSON parse failed");
  });

  test("infer throws on API error", async () => {
    const schema = z.object({ value: z.string() });
    mockFetch.mockResolvedValueOnce(
      new Response("Forbidden", { status: 403 })
    );

    await expect(client.infer("prompt", schema)).rejects.toThrow("Gemini API error (403)");
  });

  test("infer throws on empty response", async () => {
    const schema = z.object({ value: z.string() });
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 })
    );

    await expect(client.infer("prompt", schema)).rejects.toThrow("empty response");
  });
});
