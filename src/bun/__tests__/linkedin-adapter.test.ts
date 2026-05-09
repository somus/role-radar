import { describe, test, expect, beforeEach, mock } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { LinkedInAdapter } from "../linkedin-adapter";
import type { SearchQuery, SelectorConfig } from "../../shared/types";

const selectors: SelectorConfig = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../config/linkedin-selectors.json"), "utf-8")
);
const fixtureHtml = readFileSync(
  join(import.meta.dir, "fixtures/linkedin/search-results.html"), "utf-8"
);
const detailHtml = readFileSync(
  join(import.meta.dir, "fixtures/linkedin/job-detail.html"), "utf-8"
);

describe("LinkedInAdapter", () => {
  describe("buildSearchUrl", () => {
    const adapter = new LinkedInAdapter({ fetchFn: mock() as any, selectors, delayMs: 0 });

    test("encodes keywords and location into guest API URL", () => {
      const url = adapter.buildSearchUrl("backend engineer", { keywords: ["backend engineer"], location: "San Francisco" });

      expect(url).toContain("/jobs-guest/jobs/api/seeMoreJobPostings/search");
      expect(url).toContain("keywords=backend+engineer");
      expect(url).toContain("location=San+Francisco");
    });

    test("includes experience level as f_E param", () => {
      const url = adapter.buildSearchUrl("dev", { keywords: ["dev"], experienceLevel: "4" });

      expect(url).toContain("f_E=4");
    });

    test("includes f_TPR time filter by default (1 week)", () => {
      const url = adapter.buildSearchUrl("dev", { keywords: ["dev"] });

      expect(url).toContain("f_TPR=r604800");
    });

    test("uses custom maxAgeSecs for f_TPR", () => {
      const customAdapter = new LinkedInAdapter({ fetchFn: mock() as any, selectors, delayMs: 0, maxAgeSecs: 86400 });
      const url = customAdapter.buildSearchUrl("dev", { keywords: ["dev"] });

      expect(url).toContain("f_TPR=r86400");
    });

    test("does not include f_WT when remote is false", () => {
      const url = adapter.buildSearchUrl("dev", { keywords: ["dev"], remote: false });

      expect(url).not.toContain("f_WT");
    });
  });

  describe("search", () => {
    let mockFetch: ReturnType<typeof mock>;
    let adapter: LinkedInAdapter;

    beforeEach(() => {
      mockFetch = mock();
      adapter = new LinkedInAdapter({ fetchFn: mockFetch as any, selectors, delayMs: 0 });
    });

    test("fetches HTML and returns parsed jobs", async () => {
      mockFetch.mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["backend"] });

      expect(jobs).toHaveLength(3);
      expect(jobs[0]!.title).toBe("Senior Backend Engineer");
      expect(jobs[0]!.sourceId).toBe("3901234567");
      expect(jobs[0]!.status).toBe("discovered");
    });

    test("retries with exponential backoff on 429", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("", { status: 429 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["test"] });

      expect(jobs).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("retries on 403 same as 429", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("", { status: 403 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["test"] });

      expect(jobs).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("throws after max retries exhausted", async () => {
      for (let i = 0; i < 6; i++) {
        mockFetch.mockResolvedValueOnce(new Response("", { status: 429 }));
      }

      await expect(adapter.search({ keywords: ["test"] })).rejects.toThrow();
    });

    test("fires second query with f_WT=2 when remote=true", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["backend"], remote: true, location: "Bangalore, India" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondUrl = (mockFetch.mock.calls[1]![0] as string);
      expect(secondUrl).toContain("f_WT=2");
      expect(jobs.length).toBeGreaterThan(0);
    });

    test("fires 4 requests for 2 keywords + remote", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["backend", "frontend"], remote: true, location: "Bangalore, India" });

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(jobs).toHaveLength(12);
      const urls = mockFetch.mock.calls.map((c: any) => c[0] as string);
      expect(urls[0]).toContain("keywords=backend");
      expect(urls[0]).not.toContain("f_WT");
      expect(urls[1]).toContain("keywords=backend");
      expect(urls[1]).toContain("f_WT=2");
      expect(urls[2]).toContain("keywords=frontend");
      expect(urls[3]).toContain("f_WT=2");
    });

    test("skips remote search when location is not set", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["backend"], remote: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = (mockFetch.mock.calls[0]![0] as string);
      expect(url).not.toContain("f_WT");
    });

    test("fetchDetails: hits guest jobPosting URL with the source id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(detailHtml, { status: 200 }));

      const detail = await adapter.fetchDetails("3901234567");
      expect(detail.seniority).toBe("Mid-Senior level");
      expect(detail.employmentType).toBe("Full-time");
      expect(detail.description).toContain("Senior Backend Engineer");

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain("/jobs-guest/jobs/api/jobPosting/3901234567");
    });

    test("fetchDetails: retries on 429 then succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("", { status: 429 }))
        .mockResolvedValueOnce(new Response(detailHtml, { status: 200 }));

      const detail = await adapter.fetchDetails("3901234567");
      expect(detail.industry).toBe("Software Development");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("fetchDetails: throws after max retries", async () => {
      for (let i = 0; i < 6; i++) {
        mockFetch.mockResolvedValueOnce(new Response("", { status: 429 }));
      }
      await expect(adapter.fetchDetails("xx")).rejects.toThrow();
    });

    test("fetchDetails: throws if selectors.detail missing", async () => {
      const { detail: _drop, ...selectorsNoDetail } = selectors;
      const a = new LinkedInAdapter({ fetchFn: mockFetch as any, selectors: selectorsNoDetail as any, delayMs: 0 });
      await expect(a.fetchDetails("xx")).rejects.toThrow(/detail selectors/i);
    });

    test("fires sequential queries for multiple keywords", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }))
        .mockResolvedValueOnce(new Response(fixtureHtml, { status: 200 }));

      const jobs = await adapter.search({ keywords: ["backend", "frontend"] });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const firstUrl = mockFetch.mock.calls[0]![0] as string;
      const secondUrl = mockFetch.mock.calls[1]![0] as string;
      expect(firstUrl).toContain("keywords=backend");
      expect(secondUrl).toContain("keywords=frontend");
      expect(jobs).toHaveLength(6);
    });
  });
});
