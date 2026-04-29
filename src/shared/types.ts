import { z } from "zod/v4";

export const SeniorityLevel = z.enum([
  "Junior",
  "Mid",
  "Senior",
  "Staff",
  "Principal",
  "Executive",
]);

export const ResumeParseResultSchema = z.object({
  roles: z.array(z.string()).min(1),
  skills_primary: z.array(z.string()).min(1),
  skills_secondary: z.array(z.string()),
  experience_years: z.number().int().nonnegative(),
  seniority: SeniorityLevel,
  domains: z.array(z.string()),
  preferences: z.object({
    locations: z.array(z.string()).default([]),
    remote: z.boolean().default(false),
    min_salary: z.number().nullable().default(null),
    company_sizes: z.array(z.string()).default([]),
  }).default(() => ({ locations: [], remote: false, min_salary: null, company_sizes: [] })),
});

export type ResumeParseResult = z.infer<typeof ResumeParseResultSchema>;

export type OllamaModelInfo = {
  name: string;
  size: number;
  parameterSize: string;
};

export type UploadResumeResult = {
  profile: Profile;
  resumeText: string;
};

export type PipelineEvent =
  | { type: "resume:extracting"; payload: null }
  | { type: "resume:parsing"; payload: null }
  | { type: "resume:storing"; payload: null }
  | { type: "resume:complete"; payload: null }
  | { type: "resume:error"; payload: { message: string } }
  | { type: "resume:cancelled"; payload: null }
  | { type: "pull:progress"; payload: { status: string; completed?: number; total?: number } }
  | { type: "enrichment:generating"; payload: null }
  | { type: "enrichment:questions"; payload: { questions: EnrichmentQuestion[] } }
  | { type: "enrichment:extracting"; payload: null }
  | { type: "enrichment:complete"; payload: { profile: Profile } }
  | { type: "enrichment:error"; payload: { message: string } };

type UpdateProfileParams = {
  fields: Partial<Pick<Profile, "roles" | "skills_primary" | "skills_secondary" | "experience_years" | "seniority" | "domains" | "preferences">>;
  resumeText?: string;
};

export type AppRPCSchema = {
  bun: {
    requests: {
      getHealth: { params: undefined; response: { ollama: boolean; db: boolean } };
      getProfile: { params: undefined; response: Profile | null };
      getResumeText: { params: undefined; response: string | null };
      resetProfile: { params: undefined; response: void };
      updateProfile: { params: UpdateProfileParams; response: Profile };
      runMigrations: { params: undefined; response: { applied: number } };
      listOllamaModels: { params: undefined; response: OllamaModelInfo[] };
      checkOllama: { params: undefined; response: boolean };
      pullOllamaModel: { params: { name: string }; response: { success: boolean; error?: string } };
      setSelectedModel: { params: { model: string }; response: void };
      getSelectedModel: { params: undefined; response: string };
      getEnrichmentAnswers: { params: { profileId: number }; response: EnrichmentAnswer[] };
    };
    messages: {
      log: { level: string; msg: string };
      pickAndProcessResume: {};
      generateEnrichmentQuestions: { profileId: number };
      processEnrichmentAnswers: { profileId: number; answers: EnrichmentAnswer[] };
    };
  };
  webview: {
    requests: {};
    messages: {
      pipelineUpdate: { type: string; payload: unknown };
    };
  };
};

export type Profile = {
  id: number;
  roles: string[];
  skills_primary: string[];
  skills_secondary: string[];
  experience_years: number;
  seniority: string;
  domains: string[];
  preferences: ProfilePreferences;
  career_intent: string | null;
  dealbreakers: string[];
  problem_solving_stories: string[];
  technical_depth: string[];
  created_at: string;
  updated_at: string;
};

export type ProfilePreferences = {
  locations: string[];
  remote: boolean;
  min_salary: number | null;
  company_sizes: string[];
};

export type EnrichmentCategory = "career_intent" | "problem_solving" | "technical_depth";

const VALID_CATEGORIES: EnrichmentCategory[] = ["career_intent", "problem_solving", "technical_depth"];

function normalizeCategory(raw: string): EnrichmentCategory {
  const lower = raw.toLowerCase().replace(/[-\s]/g, "_");
  if (VALID_CATEGORIES.includes(lower as EnrichmentCategory)) return lower as EnrichmentCategory;
  if (lower.includes("career") || lower.includes("intent") || lower.includes("dealbreak")) return "career_intent";
  if (lower.includes("problem") || lower.includes("solving") || lower.includes("story") || lower.includes("stories")) return "problem_solving";
  return "technical_depth";
}

export const EnrichmentQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: z.string().transform(normalizeCategory),
      guided_prompt: z.string(),
    })
  ).length(5),
});

export type EnrichmentQuestion = {
  question: string;
  category: EnrichmentCategory;
  guided_prompt: string;
};

export type EnrichmentAnswer = {
  question: string;
  answer: string;
  category: string;
};

export const EnrichmentExtractionSchema = z.object({
  career_intent: z.string().nullable(),
  dealbreakers: z.array(z.string()),
  problem_solving_stories: z.array(z.string()),
  technical_depth: z.array(z.string()),
});

export type EnrichmentExtractionResult = z.infer<typeof EnrichmentExtractionSchema>;
