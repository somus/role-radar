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

export const StructuredResumeSchema = z.object({
  contact: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    github: z.string().default(""),
    linkedin: z.string().default(""),
    personal_site: z.string().default(""),
    links: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).default([]),
  }),
  summary: z.string(),
  experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    location: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    current: z.boolean(),
    bullets: z.array(z.string()).default([]),
  })),
  skills: z.array(z.object({
    category: z.string(),
    items: z.array(z.string()).default([]),
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    gpa: z.string().default(""),
    location: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    details: z.array(z.string()).default([]),
  })),
  projects: z.array(z.object({
    name: z.string(),
    role: z.string(),
    url: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    bullets: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
  })).default([]),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    date: z.string(),
    url: z.string(),
  })).default([]),
  extracurriculars: z.array(z.object({
    activity: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    bullets: z.array(z.string()).default([]),
  })).default([]),
  additional_sections: z.array(z.object({
    title: z.string(),
    items: z.array(z.string()).default([]),
  })).default([]),
  section_order: z.array(z.enum([
    "contact",
    "summary",
    "experience",
    "skills",
    "education",
    "projects",
    "certifications",
    "extracurriculars",
    "additional_sections",
  ])).default(["contact", "summary", "experience", "skills", "education"]),
});

export const ResumeUploadParseResultSchema = z.object({
  profile: ResumeParseResultSchema,
  resume: StructuredResumeSchema,
});

export type StructuredResume = z.infer<typeof StructuredResumeSchema>;
export type ResumeUploadParseResult = z.infer<typeof ResumeUploadParseResultSchema>;


export type UploadResumeResult = {
  profile: Profile;
  resumeText: string;
  resumeJson: StructuredResume | null;
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
  | { type: "job:searching"; payload: { query: SearchQuery; source: JobSourceId } }
  | { type: "job:discovered"; payload: { count: number; source: JobSourceId } }
  | { type: "job:search:complete"; payload: { total: number; source: JobSourceId; inserted: number; failed: number } }
  | { type: "job:search:error"; payload: { message: string; source: JobSourceId } }
  | { type: "queries:generating"; payload: null }
  | { type: "queries:generated"; payload: { count: number } }
  | { type: "queries:progress"; payload: { current: number; total: number; query: string; strategy: string; source: JobSourceId } }
  | { type: "queries:search:complete"; payload: { queriesRun: number; jobsDiscovered: number } }
  | { type: "queries:error"; payload: { message: string } }
  | { type: "source:quarantined"; payload: { source: JobSourceId; reason: string } }
  | { type: "source:restored"; payload: { source: JobSourceId } }
  | { type: "fetchmore:searching"; payload: null }
  | { type: "fetchmore:complete"; payload: { jobsDiscovered: number } }
  | { type: "fetchmore:error"; payload: { message: string } }
  | { type: "detail:queued"; payload: { count: number } }
  | { type: "detail:fetching"; payload: { jobId: number; sourceId: string } }
  | { type: "detail:ready"; payload: { jobId: number } }
  | { type: "detail:failed"; payload: { jobId: number; message: string } }
  | { type: "detail:circuit_open"; payload: {} }
  | { type: "detail:complete"; payload: { ready: number; failed: number } }
  | { type: "score:queued"; payload: { count: number } }
  | { type: "score:scoring"; payload: { jobId: number } }
  | { type: "score:ready"; payload: { jobId: number; composite: number; group: ScoreGroup; overqualified: boolean } }
  | { type: "score:failed"; payload: { jobId: number; message: string } }
  | { type: "score:complete"; payload: { ready: number; failed: number } };

type UpdateProfileParams = {
  fields: Partial<Pick<Profile, "roles" | "skills_primary" | "skills_secondary" | "experience_years" | "seniority" | "domains" | "preferences">>;
  resumeText?: string;
  resumeJson?: StructuredResume;
};

export type AppRPCSchema = {
  bun: {
    requests: {
      getHealth: { params: undefined; response: { gemini: boolean; db: boolean } };
      getProfile: { params: undefined; response: Profile | null };
      getResumeText: { params: undefined; response: string | null };
      getResumeJson: { params: undefined; response: StructuredResume | null };
      resetProfile: { params: undefined; response: void };
      updateProfile: { params: UpdateProfileParams; response: Profile };
      runMigrations: { params: undefined; response: { applied: number } };
      hasApiKey: { params: undefined; response: boolean };
      setApiKey: { params: { key: string }; response: { valid: boolean } };
      getEnrichmentAnswers: { params: { profileId: number }; response: EnrichmentAnswer[] };
      getJobFeed: { params: JobFeedParams; response: JobFeedResult };
      getJobDetail: { params: { jobId: number }; response: JobDetail | null };
      getJobReasoning: { params: { jobId: number }; response: JobReasoning | null };
      getWeights: { params: undefined; response: FitWeights };
      updateWeights: { params: FitWeights; response: FitWeights };
      getJobFeedFilters: { params: undefined; response: JobFeedFilters };
      updateJobFeedFilters: { params: JobFeedFilters; response: JobFeedFilters };
      searchCities: { params: { query: string }; response: CityResult[] };
    };
    messages: {
      log: { level: string; msg: string };
      uiReady: {};
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
  resume_json: StructuredResume | null;
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

export const JOB_SOURCE_IDS = [
  "linkedin",
  "naukri",
  "indeed",
  "foundit",
  "shine",
  "timesjobs",
  "freshersworld",
  "internshala",
  "cutshort",
  "apna",
] as const;

export type JobSourceId = typeof JOB_SOURCE_IDS[number];

export type PostedAtConfidence = "exact" | "relative" | "estimated" | "missing";

export type SortMode = "best_match" | "most_recent";

export type Job = {
  id: number;
  source: JobSourceId;
  source_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  posted_at: string | null;
  posted_at_ts: number | null;
  posted_at_confidence: PostedAtConfidence;
  posted_text: string | null;
  description_excerpt_only: boolean;
  canonical_job_id: number | null;
  dedup_key: string | null;
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
  source: JobSourceId;
  sourceId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  postedAt: string | null;
  postedText: string | null;
  postedAtConfidence: PostedAtConfidence;
  descriptionExcerptOnly: boolean;
  status: "discovered" | "parse_failed";
};

export type MatchType = "exact" | "inferred" | "partial";

export type Match = {
  skill: string;
  type: MatchType;
  context: string;
};

export type Gap = {
  skill: string;
  type: MatchType;
  context: string;
};

export type DealbreakerViolation = {
  dealbreaker: string;
  reason: string;
};

export type FitResult = {
  skills_score: number;
  seniority_score: number;
  domain_score: number;
  location_score: number;
  overqualified: boolean;
  matches: Match[];
  gaps: Gap[];
  dealbreaker_violations: DealbreakerViolation[];
  summary: string;
};

export type FitWeights = {
  skills: number;
  seniority: number;
  domain: number;
  location: number;
};

export type JobFeedFilters = {
  minScore: number;
  hideDealbreakers: boolean;
  enabledSources: JobSourceId[];
  sortMode: SortMode;
};

export const DEFAULT_JOB_FEED_FILTERS: JobFeedFilters = Object.freeze({
  minScore: 0,
  hideDealbreakers: false,
  enabledSources: Object.freeze([...JOB_SOURCE_IDS]) as unknown as JobSourceId[],
  sortMode: "best_match",
}) as JobFeedFilters;

export type ScoreGroup = "Top" | "Good" | "Others";

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
  detail?: DetailSelectorConfig;
};

export type DetailSelectorConfig = {
  description: string;
  criteriaList: string;
  criteriaLabel: string;
  criteriaValue: string;
};

export type ParsedJobDetail = {
  description: string | null;
  seniority: string | null;
  employmentType: string | null;
  function: string | null;
  industry: string | null;
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
  filters?: JobFeedFilters;
};

export type JobFeedItem = Job & {
  skills_score: number | null;
  seniority_score: number | null;
  domain_score: number | null;
  location_score: number | null;
  composite: number | null;
  weighted_composite: number | null;
  score_group: ScoreGroup | null;
  overqualified: boolean | null;
  matches: Match[];
  gaps: Gap[];
  summary: string | null;
  dealbreaker_violations: DealbreakerViolation[];
};

export type JobDetail = JobFeedItem;

export type JobReasoning = {
  prompt: string;
  response: string;
  model: string;
};

export type JobFeedResult = {
  jobs: JobFeedItem[];
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
