import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSearchResults, parseJobDetail } from "../html-rewriter-parser";
import type { DetailSelectorConfig, SelectorConfig } from "../../shared/types";

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

const detailSelectors: DetailSelectorConfig = {
  description: "div.show-more-less-html__markup",
  criteriaList: "li.description__job-criteria-item",
  criteriaLabel: "h3.description__job-criteria-subheader",
  criteriaValue: "span.description__job-criteria-text",
};

describe("parseJobDetail", () => {
  test("extracts description text and all four criteria fields", async () => {
    const html = readFileSync(join(fixtureDir, "job-detail.html"), "utf-8");
    const detail = await parseJobDetail(html, detailSelectors);

    expect(detail.description).toContain("Senior Backend Engineer");
    expect(detail.description).toContain("Go or Rust");
    expect(detail.seniority).toBe("Mid-Senior level");
    expect(detail.employmentType).toBe("Full-time");
    expect(detail.function).toBe("Engineering and Information Technology");
    expect(detail.industry).toBe("Software Development");
  });

  test("converts LinkedIn description paragraphs and bullets to markdown", async () => {
    const html = readFileSync(join(fixtureDir, "job-detail.html"), "utf-8");
    const detail = await parseJobDetail(html, detailSelectors);

    expect(detail.description).toContain("We are looking for a Senior Backend Engineer");
    expect(detail.description).toContain("\n\nYou will design distributed systems");
    expect(detail.description).toContain("\n\n- 5+ years experience with Go or Rust");
    expect(detail.description).toContain("\n- Strong knowledge of SQL and Postgres");
  });

  test("preserves direct description text around markdown bullets", async () => {
    const html = `
      <div class="show-more-less-html__markup">
        Direct intro before any paragraph.
        <br>
        <strong>Responsibilities</strong>
        <ul>
          <li>Build APIs</li>
          <li>Own services</li>
        </ul>
      </div>
    `;

    const detail = await parseJobDetail(html, detailSelectors);

    expect(detail.description).toContain("Direct intro before any paragraph.");
    expect(detail.description).toContain("Responsibilities");
    expect(detail.description).toContain("\n\n- Build APIs");
    expect(detail.description).toContain("\n\n- Own services");
  });

  test("returns null fields when page lacks description and criteria", async () => {
    const html = readFileSync(join(fixtureDir, "job-detail-empty.html"), "utf-8");
    const detail = await parseJobDetail(html, detailSelectors);

    expect(detail.description).toBeNull();
    expect(detail.seniority).toBeNull();
    expect(detail.employmentType).toBeNull();
    expect(detail.function).toBeNull();
    expect(detail.industry).toBeNull();
  });

  test("partial criteria leaves missing fields null", async () => {
    const html = `
      <ul class="description__job-criteria-list">
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Employment type</h3>
          <span class="description__job-criteria-text">Contract</span>
        </li>
      </ul>
    `;
    const detail = await parseJobDetail(html, detailSelectors);

    expect(detail.employmentType).toBe("Contract");
    expect(detail.seniority).toBeNull();
    expect(detail.function).toBeNull();
    expect(detail.industry).toBeNull();
  });
});
