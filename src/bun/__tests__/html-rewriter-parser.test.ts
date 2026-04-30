import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSearchResults } from "../html-rewriter-parser";
import type { SelectorConfig } from "../../shared/types";

const selectors: SelectorConfig = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../config/linkedin-selectors.json"), "utf-8")
);

const fixtureDir = join(import.meta.dir, "fixtures/linkedin");

describe("parseSearchResults", () => {
  test("extracts title, company, location, sourceId, url from a single job card", async () => {
    const html = readFileSync(join(fixtureDir, "search-results.html"), "utf-8");
    const jobs = await parseSearchResults(html, selectors);

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const first = jobs[0]!;
    expect(first.title).toBe("Senior Backend Engineer");
    expect(first.company).toBe("Acme Corp");
    expect(first.location).toBe("San Francisco, CA");
    expect(first.sourceId).toBe("3901234567");
    expect(first.url).toContain("/jobs/view/3901234567");
    expect(first.status).toBe("discovered");
  });

  test("extracts multiple job cards from HTML", async () => {
    const html = readFileSync(join(fixtureDir, "search-results.html"), "utf-8");
    const jobs = await parseSearchResults(html, selectors);

    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.title).toBe("Senior Backend Engineer");
    expect(jobs[1]!.title).toBe("Staff Platform Engineer");
    expect(jobs[1]!.sourceId).toBe("3902345678");
    expect(jobs[1]!.company).toBe("MegaCorp");
    expect(jobs[2]!.title).toBe("Backend Developer");
    expect(jobs[2]!.location).toBe("Remote");
  });

  test("marks jobs with missing title as parse_failed", async () => {
    const html = readFileSync(join(fixtureDir, "search-results-missing-fields.html"), "utf-8");
    const jobs = await parseSearchResults(html, selectors);

    const valid = jobs.filter(j => j.status === "discovered");
    const failed = jobs.filter(j => j.status === "parse_failed");

    expect(valid.length).toBeGreaterThanOrEqual(1);
    expect(valid[0]!.title).toBe("Valid Job With Title");
    expect(failed.length).toBeGreaterThanOrEqual(1);
  });

  test("marks jobs with missing jobId as parse_failed", async () => {
    const html = readFileSync(join(fixtureDir, "search-results-missing-fields.html"), "utf-8");
    const jobs = await parseSearchResults(html, selectors);

    const noIdJob = jobs.find(j => j.title === "No Job ID Card");
    expect(noIdJob?.status).toBe("parse_failed");
  });

  test("returns empty array when selectors do not match (changed HTML structure)", async () => {
    const html = `<div class="completely-different-structure"><p>No jobs here</p></div>`;
    const jobs = await parseSearchResults(html, selectors);

    expect(jobs).toHaveLength(0);
  });
});
