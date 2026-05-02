import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { GeminiClient } from "../gemini-client";
import { storeProfile, getProfile } from "../profile-store";
import { generateSearchQueries, mapSeniorityToLinkedIn } from "../query-generator";
import type { ResumeParseResult } from "../../shared/types";

const migrationsDir = join(import.meta.dir, "../../../migrations");
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
const migrationSql = migrationFiles.map(f => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");

const parseResult: ResumeParseResult = {
  roles: ["Backend Engineer", "Staff SRE"],
  skills_primary: ["TypeScript", "Go", "PostgreSQL"],
  skills_secondary: ["Python", "Redis"],
  experience_years: 8,
  seniority: "Senior",
  domains: ["Fintech", "AdTech"],
  preferences: {
    locations: ["San Francisco"],
    remote: true,
    min_salary: null,
    company_sizes: [],
    country: null,
  },
};

const sparseParseResult: ResumeParseResult = {
  roles: ["Software Engineer"],
  skills_primary: ["JavaScript"],
  skills_secondary: [],
  experience_years: 2,
  seniority: "Junior",
  domains: [],
  preferences: {
    locations: [],
    remote: false,
    min_salary: null,
    company_sizes: [],
    country: null,
  },
};

function geminiResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200 }
  );
}

function makeQueryResponse(): string {
  return JSON.stringify({
    queries: [
      { keywords: ["Backend Engineer", "PostgreSQL"], location: "San Francisco", experienceLevel: "4", strategy: "precise" },
      { keywords: ["Backend Engineer", "TypeScript", "Go"], experienceLevel: "4", strategy: "broad" },
      { keywords: ["SRE", "Kubernetes"], strategy: "exploratory" },
    ],
  });
}

describe("mapSeniorityToLinkedIn", () => {
  test("maps all seniority levels", () => {
    expect(mapSeniorityToLinkedIn("Junior")).toBe("2");
    expect(mapSeniorityToLinkedIn("Mid")).toBe("3");
    expect(mapSeniorityToLinkedIn("Senior")).toBe("4");
    expect(mapSeniorityToLinkedIn("Staff")).toBe("4");
    expect(mapSeniorityToLinkedIn("Principal")).toBe("5");
    expect(mapSeniorityToLinkedIn("Executive")).toBe("6");
  });

  test("returns undefined for unknown seniority", () => {
    expect(mapSeniorityToLinkedIn("Intern")).toBeUndefined();
  });
});

describe("generateSearchQueries", () => {
  let mockFetch: ReturnType<typeof mock>;
  let gemini: GeminiClient;
  let db: Database;

  beforeEach(() => {
    mockFetch = mock();
    gemini = new GeminiClient("test-key", mockFetch as any);
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("generates 3 queries from complete profile", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));

    const queries = await generateSearchQueries(db, profile, gemini);

    expect(queries).toHaveLength(3);
    expect(queries[0]!.keywords).toContain("Backend Engineer");
    expect(queries[0]!.location).toBe("San Francisco");
    expect(queries[0]!.experienceLevel).toBe("4");
  });

  test("prompt includes profile fields", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));

    await generateSearchQueries(db, profile, gemini);

    const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
    const prompt = body.contents[0].parts[0].text as string;

    expect(prompt).toContain("Backend Engineer");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("Fintech");
    expect(prompt).toContain("Senior");
    expect(prompt).toContain("San Francisco");
  });

  test("stores queries in search_queries table", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));

    await generateSearchQueries(db, profile, gemini);

    const rows = db.query("SELECT * FROM search_queries WHERE profile_id = ?").all(profile.id) as any[];
    expect(rows).toHaveLength(3);
    expect(rows[0].query_type).toBe("precise");
    expect(rows[1].query_type).toBe("broad");
    expect(rows[2].query_type).toBe("exploratory");
  });

  test("applies default experience level from seniority when LLM omits it", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    const response = JSON.stringify({
      queries: [
        { keywords: ["SRE"], strategy: "exploratory" },
        { keywords: ["Backend"], strategy: "broad" },
        { keywords: ["Go Engineer"], strategy: "precise" },
      ],
    });
    mockFetch.mockResolvedValueOnce(geminiResponse(response));

    const queries = await generateSearchQueries(db, profile, gemini);

    for (const q of queries) {
      expect(q.experienceLevel).toBe("4");
    }
  });

  test("works with sparse profile", async () => {
    storeProfile(db, sparseParseResult, "basic resume");
    const profile = getProfile(db)!;

    const response = JSON.stringify({
      queries: [
        { keywords: ["Software Engineer", "JavaScript"], strategy: "precise" },
        { keywords: ["Frontend Developer"], strategy: "broad" },
        { keywords: ["Web Developer"], strategy: "exploratory" },
      ],
    });
    mockFetch.mockResolvedValueOnce(geminiResponse(response));

    const queries = await generateSearchQueries(db, profile, gemini);
    expect(queries).toHaveLength(3);
    expect(queries[0]!.experienceLevel).toBe("2");
  });

  test("sets remote flag from profile preferences", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));

    const queries = await generateSearchQueries(db, profile, gemini);

    for (const q of queries) {
      expect(q.remote).toBe(true);
    }
  });

  test("returns cached queries on second call without hitting LLM", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));

    const first = await generateSearchQueries(db, profile, gemini);
    const second = await generateSearchQueries(db, profile, gemini);

    expect(second).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("regenerates queries when profile is updated", async () => {
    storeProfile(db, parseResult, "resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));
    await generateSearchQueries(db, profile, gemini);

    db.query("UPDATE profiles SET seniority = 'Staff', updated_at = datetime('now', '+1 second') WHERE id = ?").run(profile.id);
    const updatedProfile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(geminiResponse(makeQueryResponse()));
    await generateSearchQueries(db, updatedProfile, gemini);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
