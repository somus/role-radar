import { describe, test, expect } from "bun:test";
import { scoreJob, calculateComposite, type StructuredInferenceClient } from "../llm-scorer";
import type { Job, Profile, FitResult } from "../../shared/types";
import { makeTestJob } from "./test-utils";

const baseJob: Job = makeTestJob({
  id: 10,
  source_id: "job-10",
  title: "Senior Backend Engineer",
  url: "https://example.com/jobs/10",
  posted_at: "2026-05-10T00:00:00Z",
  posted_at_ts: Date.UTC(2026, 4, 10),
  posted_at_confidence: "exact",
  status: "ready_for_scoring",
  description: "Build backend systems with TypeScript, Bun, and Postgres.",
  seniority_level: "Senior",
  employment_type: "Full-time",
  job_function: "Engineering",
  industry: "Software",
  heuristic_score: 0.93,
  created_at: "",
  updated_at: "",
});

const baseProfile: Profile = {
  id: 1,
  roles: ["Backend Engineer"],
  skills_primary: ["TypeScript", "Postgres", "Bun"],
  skills_secondary: ["React"],
  experience_years: 8,
  seniority: "Staff",
  domains: ["Developer Tools"],
  preferences: {
    locations: ["San Francisco"],
    remote: true,
    min_salary: null,
    company_sizes: [],
    country: "US",
  },
  career_intent: "Stay close to backend platform work.",
  dealbreakers: ["No onsite-only"],
  problem_solving_stories: ["Scaled an internal job ingestion pipeline."],
  technical_depth: ["Distributed systems", "SQL query tuning"],
  resume_json: null,
  created_at: "",
  updated_at: "",
};

const fitResult: FitResult = {
  skills_score: 88,
  seniority_score: 82,
  domain_score: 75,
  location_score: 90,
  overqualified: false,
  matches: [
    { skill: "TypeScript", type: "exact", context: "Resume and role both emphasize TypeScript backend work." },
  ],
  gaps: [
    { skill: "Kubernetes", type: "partial", context: "Relevant platform background but Kubernetes is not explicit." },
  ],
  dealbreaker_violations: [
    { dealbreaker: "No onsite-only", reason: "The role is hybrid in San Francisco." },
  ],
  summary: "Strong backend fit with one infrastructure gap.",
};

describe("scoreJob", () => {
  test("returns validated structured fit result and captures raw reasoning", async () => {
    let calls = 0;
    const client: StructuredInferenceClient = {
      inferStructured: async <T>() => {
        calls += 1;
        return {
          data: fitResult as T,
          rawText: JSON.stringify(fitResult),
          model: "gemini-2.5-flash",
        };
      },
    };

    const scored = await scoreJob(baseJob, baseProfile, "resume text here", client);

    expect(scored.result).toEqual(fitResult);
    expect(scored.rawResponse).toContain("\"skills_score\":88");
    expect(scored.model).toBe("gemini-2.5-flash");
    expect(calls).toBe(1);
  });

  test("prompt includes calibration rubric and overqualified instruction", async () => {
    let prompt = "";
    const client: StructuredInferenceClient = {
      inferStructured: async <T>(incomingPrompt: string) => {
        prompt = incomingPrompt;
        return {
          data: fitResult as T,
          rawText: JSON.stringify(fitResult),
          model: "gemini-2.5-flash",
        };
      },
    };

    await scoreJob(baseJob, baseProfile, "resume text here", client);

    expect(prompt).toContain("90+ = near-perfect match");
    expect(prompt).toContain("70-89 = strong fit");
    expect(prompt).toContain("50-69 = possible with growth");
    expect(prompt).toContain("<50 = poor fit");
    expect(prompt).toContain("Set overqualified=true if the candidate's seniority clearly exceeds the role");
  });

  test("prompt asks for dealbreaker violations in the same scoring response", async () => {
    let prompt = "";
    const client: StructuredInferenceClient = {
      inferStructured: async <T>(incomingPrompt: string) => {
        prompt = incomingPrompt;
        return {
          data: fitResult as T,
          rawText: JSON.stringify(fitResult),
          model: "gemini-2.5-flash",
        };
      },
    };

    const scored = await scoreJob(baseJob, baseProfile, "resume text here", client);

    expect(prompt).toContain("Dealbreaker violations must be returned as objects with dealbreaker and reason");
    expect(prompt).toContain("Do not run a separate dealbreaker check");
    expect(scored.result.dealbreaker_violations).toEqual([
      { dealbreaker: "No onsite-only", reason: "The role is hybrid in San Francisco." },
    ]);
  });
});

describe("calculateComposite", () => {
  test("matches manual weighted math with default weights", () => {
    const composite = calculateComposite({
      skills_score: 80,
      seniority_score: 60,
      domain_score: 70,
      location_score: 90,
    });

    expect(composite).toBe(77);
  });

  test("supports custom weight overrides", () => {
    const composite = calculateComposite(
      {
        skills_score: 80,
        seniority_score: 60,
        domain_score: 70,
        location_score: 90,
      },
      {
        skills: 25,
        seniority: 25,
        domain: 25,
        location: 25,
      },
    );

    expect(composite).toBe(75);
  });
});
