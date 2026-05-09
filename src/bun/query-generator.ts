import type { Database } from "bun:sqlite";
import type { GeminiClient } from "./gemini-client";
import type { Profile, SearchQuery } from "../shared/types";
import { GenerateQueriesResultSchema } from "../shared/types";
import { storeSearchQuery } from "./job-store";

export type QueryStrategy = "precise" | "broad" | "exploratory";
export type GeneratedSearchQuery = SearchQuery & { strategy: QueryStrategy };

const SENIORITY_TO_LINKEDIN: Record<string, string> = {
  Junior: "2",
  Mid: "3",
  Senior: "4",
  Staff: "4",
  Principal: "5",
  Executive: "6",
};

export function mapSeniorityToLinkedIn(seniority: string): string | undefined {
  return SENIORITY_TO_LINKEDIN[seniority];
}

function buildPrompt(profile: Profile): string {
  const profileData = {
    roles: profile.roles,
    skills_primary: profile.skills_primary,
    skills_secondary: profile.skills_secondary,
    experience_years: profile.experience_years,
    seniority: profile.seniority,
    domains: profile.domains,
    locations: profile.preferences.locations,
    remote: profile.preferences.remote,
    career_intent: profile.career_intent,
  };

  return `You are a job search optimizer. Generate 3-5 LinkedIn search queries for this candidate.

<profile>
${JSON.stringify(profileData, null, 2)}
</profile>

<rules>
- If locations array is non-empty, ALL queries MUST set location to the candidate's preferred location. No exceptions.
- Mix strategies: 1-2 precise, 1-2 broad, 0-1 exploratory.
- PRECISE: exact role title + 1-2 primary skills + location
- BROAD: role + wider skill mix + location
- EXPLORATORY: adjacent roles from domains/skills + location
</rules>

<linkedin_experience_codes>
1=Internship, 2=Entry, 3=Associate, 4=Mid-Senior, 5=Director, 6=Executive
</linkedin_experience_codes>

<output_schema>
{ "queries": [{ "keywords": ["string"], "location": "string|omit", "experienceLevel": "1-6|omit", "strategy": "precise|broad|exploratory" }] }
</output_schema>`;
}

export async function generateSearchQueries(
  db: Database,
  profile: Profile,
  gemini: GeminiClient,
  options: { force?: boolean } = {}
): Promise<GeneratedSearchQuery[]> {
  const cached = options.force ? null : db.query(
    "SELECT queries_json FROM generated_queries WHERE profile_id = ? AND profile_updated_at = ?"
  ).get(profile.id, profile.updated_at) as { queries_json: string } | null;

  if (cached) {
    return deserializeGeneratedQueries(cached.queries_json);
  }

  const prompt = buildPrompt(profile);
  const result = await gemini.infer(prompt, GenerateQueriesResultSchema);

  const defaultLevel = mapSeniorityToLinkedIn(profile.seniority);
  const defaultLocation = profile.preferences.locations[0] ?? undefined;
  const remoteLocation = profile.preferences.country ?? undefined;

  const queries = result.queries.map((q): GeneratedSearchQuery => {
    const location = q.location ?? defaultLocation;
    const searchQuery: GeneratedSearchQuery = {
      keywords: q.keywords,
      location,
      experienceLevel: q.experienceLevel ?? defaultLevel,
      remote: profile.preferences.remote || undefined,
      remoteLocation,
      strategy: q.strategy,
    };

    return searchQuery;
  });

  const persist = db.transaction((generated: GeneratedSearchQuery[]) => {
    db.query("DELETE FROM search_queries WHERE profile_id = ?").run(profile.id);

    for (const query of generated) {
      storeSearchQuery(db, profile.id, query, query.strategy);
    }

    db.query(
      `INSERT INTO generated_queries (profile_id, profile_updated_at, queries_json)
       VALUES (?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET profile_updated_at = excluded.profile_updated_at, queries_json = excluded.queries_json`
    ).run(profile.id, profile.updated_at, JSON.stringify(generated));
  });

  persist(queries);

  return queries;
}

export function getStoredSearchQueries(db: Database, profile: Pick<Profile, "id" | "updated_at">): GeneratedSearchQuery[] {
  const cached = db.query(
    "SELECT queries_json FROM generated_queries WHERE profile_id = ? AND profile_updated_at = ?"
  ).get(profile.id, profile.updated_at) as { queries_json: string } | null;

  return cached ? deserializeGeneratedQueries(cached.queries_json) : [];
}

function deserializeGeneratedQueries(queriesJson: string): GeneratedSearchQuery[] {
  return (JSON.parse(queriesJson) as (SearchQuery & { strategy?: string })[]).map((q) => ({
    ...q,
    strategy: isQueryStrategy(q.strategy) ? q.strategy : "precise",
  }));
}

function isQueryStrategy(value: unknown): value is QueryStrategy {
  return value === "precise" || value === "broad" || value === "exploratory";
}
