import { z } from "zod/v4";
import type { FitResult, FitWeights, Job, MatchType, Profile } from "../shared/types";

const matchTypeSchema = z.enum(["exact", "inferred", "partial"] satisfies MatchType[]);

export const FitResultSchema = z.object({
  skills_score: z.number().min(0).max(100),
  seniority_score: z.number().min(0).max(100),
  domain_score: z.number().min(0).max(100),
  location_score: z.number().min(0).max(100),
  overqualified: z.boolean(),
  matches: z.array(
    z.object({
      skill: z.string().min(1),
      type: matchTypeSchema,
      context: z.string().min(1),
    }),
  ),
  gaps: z.array(
    z.object({
      skill: z.string().min(1),
      type: matchTypeSchema,
      context: z.string().min(1),
    }),
  ),
  summary: z.string().min(1),
});

export type StructuredInferenceClient = {
  inferStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    model?: string,
  ): Promise<{ data: T; rawText: string; model: string }>;
};

export type ScoreJobResult = {
  result: FitResult;
  prompt: string;
  rawResponse: string;
  model: string;
};

const DEFAULT_WEIGHTS: FitWeights = {
  skills: 40,
  seniority: 20,
  domain: 15,
  location: 25,
};

export function calculateComposite(
  scores: Pick<FitResult, "skills_score" | "seniority_score" | "domain_score" | "location_score">,
  weights: FitWeights = DEFAULT_WEIGHTS,
): number {
  return Number((
    (
      (scores.skills_score * weights.skills) +
      (scores.seniority_score * weights.seniority) +
      (scores.domain_score * weights.domain) +
      (scores.location_score * weights.location)
    ) / 100
  ).toFixed(2));
}

export async function scoreJob(
  job: Job,
  profile: Profile,
  resumeText: string,
  client: StructuredInferenceClient,
  model?: string,
): Promise<ScoreJobResult> {
  const prompt = buildScoringPrompt(job, profile, resumeText);
  const inference = await client.inferStructured(prompt, FitResultSchema, model);
  return {
    result: inference.data,
    prompt,
    rawResponse: inference.rawText,
    model: inference.model,
  };
}

function buildScoringPrompt(job: Job, profile: Profile, resumeText: string): string {
  return [
    "You are scoring a job fit between a candidate profile and a job posting.",
    "Return JSON only.",
    "",
    "Calibration rubric:",
    "90+ = near-perfect match",
    "70-89 = strong fit",
    "50-69 = possible with growth",
    "<50 = poor fit",
    "",
    "Instructions:",
    "- Score skills, seniority, domain, and location independently on a 0-100 scale.",
    "- Set overqualified=true if the candidate's seniority clearly exceeds the role.",
    "- Matches and gaps must be structured objects with skill, type, and short context.",
    "- Summary should be 1-2 sentences and explain the overall fit.",
    "",
    `Job title: ${job.title}`,
    `Company: ${job.company ?? ""}`,
    `Location: ${job.location ?? ""}`,
    `Job seniority: ${job.seniority_level ?? ""}`,
    `Employment type: ${job.employment_type ?? ""}`,
    `Function: ${job.job_function ?? ""}`,
    `Industry: ${job.industry ?? ""}`,
    `Description:\n${job.description ?? ""}`,
    "",
    `Profile roles: ${profile.roles.join(", ")}`,
    `Primary skills: ${profile.skills_primary.join(", ")}`,
    `Secondary skills: ${profile.skills_secondary.join(", ")}`,
    `Experience years: ${profile.experience_years}`,
    `Profile seniority: ${profile.seniority}`,
    `Domains: ${profile.domains.join(", ")}`,
    `Preferences: ${JSON.stringify(profile.preferences)}`,
    `Career intent: ${profile.career_intent ?? ""}`,
    `Dealbreakers: ${profile.dealbreakers.join(", ")}`,
    `Problem solving stories: ${profile.problem_solving_stories.join(" | ")}`,
    `Technical depth: ${profile.technical_depth.join(" | ")}`,
    "",
    `Resume text:\n${resumeText}`,
  ].join("\n");
}
