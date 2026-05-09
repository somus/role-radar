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
    country: z.string().nullable().default(null),
  }).default(() => ({ locations: [], remote: false, min_salary: null, company_sizes: [], country: null })),
});

export type ResumeParseResult = z.infer<typeof ResumeParseResultSchema>;


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
  | { type: "enrichment:generating"; payload: null }
  | { type: "enrichment:questions"; payload: { questions: EnrichmentQuestion[] } }
  | { type: "enrichment:extracting"; payload: null }
  | { type: "enrichment:complete"; payload: { profile: Profile } }
  | { type: "enrichment:error"; payload: { message: string } }
  | { type: "job:searching"; payload: { query: SearchQuery } }
  | { type: "job:discovered"; payload: { count: number } }
  | { type: "job:search:complete"; payload: { total: number } }
  | { type: "job:search:error"; payload: { message: string } }
  | { type: "queries:generating"; payload: null }
  | { type: "queries:generated"; payload: { count: number } }
  | { type: "queries:progress"; payload: { current: number; total: number; query: string; strategy: string } }
  | { type: "queries:search:complete"; payload: { queriesRun: number; jobsDiscovered: number } }
  | { type: "queries:error"; payload: { message: string } }
  | { type: "fetchmore:searching"; payload: null }
  | { type: "fetchmore:complete"; payload: { jobsDiscovered: number } }
  | { type: "fetchmore:error"; payload: { message: string } };

type UpdateProfileParams = {
  fields: Partial<Pick<Profile, "roles" | "skills_primary" | "skills_secondary" | "experience_years" | "seniority" | "domains" | "preferences">>;
  resumeText?: string;
};

export type AppRPCSchema = {
  bun: {
    requests: {
      getHealth: { params: undefined; response: { gemini: boolean; db: boolean } };
      getProfile: { params: undefined; response: Profile | null };
      getResumeText: { params: undefined; response: string | null };
      resetProfile: { params: undefined; response: void };
      updateProfile: { params: UpdateProfileParams; response: Profile };
      runMigrations: { params: undefined; response: { applied: number } };
      hasApiKey: { params: undefined; response: boolean };
      setApiKey: { params: { key: string }; response: { valid: boolean } };
      getEnrichmentAnswers: { params: { profileId: number }; response: EnrichmentAnswer[] };
      getJobFeed: { params: JobFeedParams; response: JobFeedResult };
      searchCities: { params: { query: string }; response: CityResult[] };
    };
    messages: {
      log: { level: string; msg: string };
      pickAndProcessResume: {};
      generateEnrichmentQuestions: { profileId: number };
      processEnrichmentAnswers: { profileId: number; answers: EnrichmentAnswer[] };
      searchJobs: SearchQuery;
      generateAndSearch: { profileId: number };
      refreshSearch: { profileId: number };
      regenerateQueries: { profileId: number };
      fetchMoreJobs: { profileId: number };
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
  country: string | null;
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

export type Job = {
  id: number;
  source: string;
  source_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  posted_at: string | null;
  status: string;
  description: string | null;
  seniority_level: string | null;
  employment_type: string | null;
  job_function: string | null;
  industry: string | null;
  heuristic_score: number | null;
  resume_generated: boolean;
  is_new: boolean;
  created_at: string;
  updated_at: string;
};

export type ParsedJob = {
  sourceId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  postedAt: string | null;
  status: "discovered" | "parse_failed";
};

export type SelectorConfig = {
  jobCard: string;
  title: string;
  company: string;
  location: string;
  url: string;
  postedTime: string;
  idAttribute: string;
  idPattern: string;
  maxAgeDays?: number;
  pagesPerQuery?: number;
};

export type SearchQuery = {
  keywords: string[];
  location?: string;
  geoId?: string;
  experienceLevel?: string;
  remote?: boolean;
  remoteLocation?: string;
  jobTypes?: string[];
};

export type CityResult = {
  id: string;
  name: string;
  country: string;
};

export type JobFeedParams = {
  limit: number;
  offset: number;
};

export type JobFeedResult = {
  jobs: Job[];
  total: number;
  hasMore: boolean;
  failedCount: number;
};

export const GeneratedQuerySchema = z.object({
  keywords: z.array(z.string()).min(1).max(5),
  location: z.string().optional(),
  experienceLevel: z.string().optional(),
  strategy: z.enum(["precise", "broad", "exploratory"]),
});

export const GenerateQueriesResultSchema = z.object({
  queries: z.array(GeneratedQuerySchema).min(3).max(5),
});
