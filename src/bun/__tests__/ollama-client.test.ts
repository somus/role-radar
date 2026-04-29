import { describe, it, expect, mock, beforeEach } from "bun:test";
import { z } from "zod/v4";
import { OllamaClient } from "../ollama-client";

describe("OllamaClient", () => {
  let client: OllamaClient;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock();
    client = new OllamaClient("http://localhost:11434", mockFetch as any);
  });

  describe("checkHealth", () => {
    it("returns true when Ollama responds at /api/tags", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 })
      );

      const result = await client.checkHealth();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/api/tags");
    });

    it("returns false when Ollama is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await client.checkHealth();

      expect(result).toBe(false);
    });
  });

  describe("listModels", () => {
    it("parses model list from /api/tags response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: "qwen2.5:7b", size: 4700000000, details: { parameter_size: "7B" } },
              { name: "llama3.1:8b", size: 5200000000, details: { parameter_size: "8B" } },
            ],
          }),
          { status: 200 }
        )
      );

      const models = await client.listModels();

      expect(models).toHaveLength(2);
      expect(models[0]!.name).toBe("qwen2.5:7b");
      expect(models[1]!.name).toBe("llama3.1:8b");
    });

    it("returns empty array when no models installed", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 })
      );

      const models = await client.listModels();

      expect(models).toEqual([]);
    });
  });

  describe("infer", () => {
    const testSchema = z.object({
      name: z.string(),
      score: z.number(),
    });

    it("sends prompt with JSON format and validates response with Zod", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: JSON.stringify({ name: "test", score: 85 }),
          }),
          { status: 200 }
        )
      );

      const result = await client.infer("test prompt", testSchema, "qwen2.5:7b");

      expect(result).toEqual({ name: "test", score: 85 });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/generate",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        })
      );

      const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
      expect(body.format).toBe("json");
      expect(body.prompt).toBe("test prompt");
      expect(body.model).toBe("qwen2.5:7b");
    });

    it("retries up to 3 times when JSON is malformed, injecting error feedback", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ response: "not json {{{" }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ response: "still broken" }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: JSON.stringify({ name: "recovered", score: 50 }) }),
            { status: 200 }
          )
        );

      const result = await client.infer("test prompt", testSchema, "qwen2.5:7b");

      expect(result).toEqual({ name: "recovered", score: 50 });
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const secondBody = JSON.parse((mockFetch.mock.calls[1] as any[])[1].body);
      expect(secondBody.prompt).toContain("not valid JSON");
    });

    it("throws after 3 failed retries with malformed JSON", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ response: "bad1" }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ response: "bad2" }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ response: "bad3" }), { status: 200 })
        );

      await expect(
        client.infer("test prompt", testSchema, "qwen2.5:7b")
      ).rejects.toThrow("JSON parse failed");
    });

    it("throws after 3 failed retries with Zod validation errors", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: JSON.stringify({ wrong: "a" }) }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: JSON.stringify({ also: "wrong" }) }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: JSON.stringify({ still: "wrong" }) }),
            { status: 200 }
          )
        );

      await expect(
        client.infer("test prompt", testSchema, "qwen2.5:7b")
      ).rejects.toThrow("validation");
    });

    it("retries when Zod validation fails with valid JSON but wrong shape", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: JSON.stringify({ wrong: "shape" }) }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ response: JSON.stringify({ name: "fixed", score: 70 }) }),
            { status: 200 }
          )
        );

      const result = await client.infer("test prompt", testSchema, "qwen2.5:7b");

      expect(result).toEqual({ name: "fixed", score: 70 });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const secondBody = JSON.parse((mockFetch.mock.calls[1] as any[])[1].body);
      expect(secondBody.prompt).toContain("validation errors");
    });
  });

  describe("pullModel", () => {
    it("calls /api/pull and collects progress events", async () => {
      const lines = [
        JSON.stringify({ status: "pulling manifest" }),
        JSON.stringify({ status: "downloading", completed: 50, total: 100 }),
        JSON.stringify({ status: "success" }),
      ];
      const body = new ReadableStream({
        start(controller) {
          for (const line of lines) {
            controller.enqueue(new TextEncoder().encode(line + "\n"));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }));

      const events: any[] = [];
      for await (const event of client.pullModel("qwen2.5:7b")) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0]!.status).toBe("pulling manifest");
      expect(events[1]!.completed).toBe(50);
      expect(events[2]!.status).toBe("success");

      const body2 = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
      expect(body2.name).toBe("qwen2.5:7b");
    });
  });
});
