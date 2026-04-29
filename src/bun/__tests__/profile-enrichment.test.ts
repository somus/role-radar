import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mock } from "bun:test";
import { z } from "zod/v4";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { OllamaClient } from "../ollama-client";
import { storeProfile, getProfile } from "../profile-store";
import { generateQuestions, submitEnrichmentAnswers } from "../profile-enrichment";
import type { Profile, ResumeParseResult, EnrichmentQuestion, EnrichmentAnswer } from "../../shared/types";
import { EnrichmentQuestionsSchema } from "../../shared/types";

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
  },
};

function makeOllamaQuestionResponse(): string {
  return JSON.stringify({
    questions: [
      { question: "What kind of role are you looking for next, and what are your absolute dealbreakers?", category: "career_intent", guided_prompt: "Think about company size, culture, and work style preferences." },
      { question: "What constraints would make you reject an otherwise perfect job?", category: "career_intent", guided_prompt: "Consider location, compensation, industry, or team dynamics." },
      { question: "Describe a challenging backend system you built at your Fintech role.", category: "problem_solving", guided_prompt: "Focus on the technical tradeoffs and what you learned." },
      { question: "Tell me about a time you debugged a critical production issue.", category: "problem_solving", guided_prompt: "Walk through your debugging process step by step." },
      { question: "How deep is your PostgreSQL expertise — query optimization, replication, extensions?", category: "technical_depth", guided_prompt: "Give specific examples of advanced usage." },
    ],
  });
}

describe("generateQuestions", () => {
  let mockFetch: ReturnType<typeof mock>;
  let ollama: OllamaClient;
  let db: Database;

  beforeEach(() => {
    mockFetch = mock();
    ollama = new OllamaClient("http://localhost:11434", mockFetch as any);
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("returns 5 questions across 3 categories from profile context", async () => {
    storeProfile(db, parseResult, "Jane Doe resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaQuestionResponse() }),
        { status: 200 }
      )
    );

    const questions = await generateQuestions(db, profile, ollama, "qwen2.5:7b");

    expect(questions).toHaveLength(5);

    const categories = questions.map((q) => q.category);
    expect(categories).toContain("career_intent");
    expect(categories).toContain("problem_solving");
    expect(categories).toContain("technical_depth");

    for (const q of questions) {
      expect(q.question).toBeTruthy();
      expect(q.guided_prompt).toBeTruthy();
    }
  });

  test("includes profile-specific content in LLM prompt", async () => {
    storeProfile(db, parseResult, "Jane Doe resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaQuestionResponse() }),
        { status: 200 }
      )
    );

    await generateQuestions(db, profile, ollama, "qwen2.5:7b");

    const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
    const prompt = body.prompt as string;

    expect(prompt).toContain("Backend Engineer");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("Fintech");
    expect(prompt).toContain("Senior");
  });

  test("returns cached questions on second call without hitting LLM", async () => {
    storeProfile(db, parseResult, "Jane Doe resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaQuestionResponse() }),
        { status: 200 }
      )
    );

    const first = await generateQuestions(db, profile, ollama, "qwen2.5:7b");
    const second = await generateQuestions(db, profile, ollama, "qwen2.5:7b");

    expect(second).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("regenerates questions when profile is updated", async () => {
    storeProfile(db, parseResult, "Jane Doe resume text");
    const profile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaQuestionResponse() }),
        { status: 200 }
      )
    );

    await generateQuestions(db, profile, ollama, "qwen2.5:7b");

    // simulate profile update (updated_at changes)
    db.query("UPDATE profiles SET seniority = 'Staff', updated_at = datetime('now', '+1 second') WHERE id = ?").run(profile.id);
    const updatedProfile = getProfile(db)!;

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaQuestionResponse() }),
        { status: 200 }
      )
    );

    await generateQuestions(db, updatedProfile, ollama, "qwen2.5:7b");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

const sampleAnswers: EnrichmentAnswer[] = [
  { question: "What role are you looking for?", answer: "Staff-level backend at a mid-size company, fully remote.", category: "career_intent" },
  { question: "What are your dealbreakers?", answer: "No onsite, no startups under 20 people, minimum 200k.", category: "career_intent" },
  { question: "Describe a challenging system you built.", answer: "Built a real-time payment reconciliation system handling 50k TPS.", category: "problem_solving" },
  { question: "Tell me about a production incident.", answer: "Diagnosed a cascading failure in our microservices caused by a connection pool leak.", category: "problem_solving" },
  { question: "How deep is your PostgreSQL expertise?", answer: "Advanced query optimization, pg_stat tracking, logical replication setup.", category: "technical_depth" },
];

function makeOllamaExtractionResponse(): string {
  return JSON.stringify({
    career_intent: "Staff-level backend engineer at a mid-size company, fully remote",
    dealbreakers: ["no onsite", "no startups under 20 people", "minimum 200k salary"],
    problem_solving_stories: [
      "Built real-time payment reconciliation system handling 50k TPS",
      "Diagnosed cascading microservices failure from connection pool leak",
    ],
    technical_depth: [
      "Advanced PostgreSQL query optimization and pg_stat tracking",
      "Logical replication setup and management",
    ],
  });
}

describe("submitEnrichmentAnswers", () => {
  let mockFetch: ReturnType<typeof mock>;
  let ollama: OllamaClient;
  let db: Database;

  beforeEach(() => {
    mockFetch = mock();
    ollama = new OllamaClient("http://localhost:11434", mockFetch as any);
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("saves raw answers to enrichment_answers table", async () => {
    const profileId = storeProfile(db, parseResult, "resume text");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaExtractionResponse() }),
        { status: 200 }
      )
    );

    await submitEnrichmentAnswers(db, profileId, sampleAnswers, ollama, "qwen2.5:7b");

    const rows = db.query("SELECT * FROM enrichment_answers WHERE profile_id = ?").all(profileId) as any[];
    expect(rows).toHaveLength(5);
    expect(rows[0].question).toBe("What role are you looking for?");
    expect(rows[0].answer).toBe("Staff-level backend at a mid-size company, fully remote.");
    expect(rows[0].category).toBe("career_intent");
  });

  test("calls LLM to extract structured enrichment data from answers", async () => {
    const profileId = storeProfile(db, parseResult, "resume text");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaExtractionResponse() }),
        { status: 200 }
      )
    );

    await submitEnrichmentAnswers(db, profileId, sampleAnswers, ollama, "qwen2.5:7b");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
    const prompt = body.prompt as string;
    expect(prompt).toContain("Staff-level backend at a mid-size company");
    expect(prompt).toContain("No onsite");
  });

  test("merges extracted data into profile and returns updated profile", async () => {
    const profileId = storeProfile(db, parseResult, "resume text");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaExtractionResponse() }),
        { status: 200 }
      )
    );

    const updated = await submitEnrichmentAnswers(db, profileId, sampleAnswers, ollama, "qwen2.5:7b");

    expect(updated.career_intent).toBe("Staff-level backend engineer at a mid-size company, fully remote");
    expect(updated.dealbreakers).toContain("no onsite");
    expect(updated.dealbreakers).toHaveLength(3);
    expect(updated.problem_solving_stories).toHaveLength(2);
    expect(updated.technical_depth).toHaveLength(2);

    // verify persisted in DB
    const fromDb = getProfile(db)!;
    expect(fromDb.career_intent).toBe(updated.career_intent);
    expect(fromDb.dealbreakers).toEqual(updated.dealbreakers);
  });

  test("replaces old answers on re-answer", async () => {
    const profileId = storeProfile(db, parseResult, "resume text");

    // first submission
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: makeOllamaExtractionResponse() }),
        { status: 200 }
      )
    );
    await submitEnrichmentAnswers(db, profileId, sampleAnswers, ollama, "qwen2.5:7b");

    // second submission with different answers
    const newAnswers: EnrichmentAnswer[] = [
      { question: "What role?", answer: "Principal engineer at FAANG.", category: "career_intent" },
    ];
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            career_intent: "Principal engineer at FAANG",
            dealbreakers: [],
            problem_solving_stories: [],
            technical_depth: [],
          }),
        }),
        { status: 200 }
      )
    );
    await submitEnrichmentAnswers(db, profileId, newAnswers, ollama, "qwen2.5:7b");

    const rows = db.query("SELECT * FROM enrichment_answers WHERE profile_id = ?").all(profileId) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("What role?");

    const profile = getProfile(db)!;
    expect(profile.career_intent).toBe("Principal engineer at FAANG");
    expect(profile.dealbreakers).toEqual([]);
  });
});
