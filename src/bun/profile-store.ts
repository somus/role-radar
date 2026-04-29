import type { Database } from "bun:sqlite";
import type { Profile, ProfilePreferences, ResumeParseResult } from "../shared/types";

export function storeProfile(
  db: Database,
  parsed: ResumeParseResult,
  resumeText: string,
  resumePdfPath?: string
): number {
  const existing = db.query("SELECT id FROM profiles LIMIT 1").get() as { id: number } | null;

  if (existing) {
    db.query(
      `UPDATE profiles SET roles = ?, skills_primary = ?, skills_secondary = ?,
       experience_years = ?, seniority = ?, domains = ?, preferences = ?,
       resume_text = ?, resume_pdf_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      JSON.stringify(parsed.roles),
      JSON.stringify(parsed.skills_primary),
      JSON.stringify(parsed.skills_secondary),
      parsed.experience_years,
      parsed.seniority,
      JSON.stringify(parsed.domains),
      JSON.stringify(parsed.preferences),
      resumeText,
      resumePdfPath ?? null,
      existing.id
    );
    return existing.id;
  }

  const result = db
    .query(
      `INSERT INTO profiles (roles, skills_primary, skills_secondary, experience_years, seniority, domains, preferences, resume_text, resume_pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      JSON.stringify(parsed.roles),
      JSON.stringify(parsed.skills_primary),
      JSON.stringify(parsed.skills_secondary),
      parsed.experience_years,
      parsed.seniority,
      JSON.stringify(parsed.domains),
      JSON.stringify(parsed.preferences),
      resumeText,
      resumePdfPath ?? null
    );

  return Number(result.lastInsertRowid);
}

export function getProfile(db: Database): Profile | null {
  const row = db.query("SELECT * FROM profiles LIMIT 1").get() as Record<string, unknown> | null;
  if (!row) return null;
  return deserializeProfile(row);
}

export function updateProfile(
  db: Database,
  fields: Partial<Pick<Profile, "roles" | "skills_primary" | "skills_secondary" | "experience_years" | "seniority" | "domains" | "preferences">>,
  resumeText?: string
): Profile {
  const profile = getProfile(db);
  if (!profile) throw new Error("No profile exists");

  const merged = {
    roles: fields.roles ?? profile.roles,
    skills_primary: fields.skills_primary ?? profile.skills_primary,
    skills_secondary: fields.skills_secondary ?? profile.skills_secondary,
    experience_years: fields.experience_years ?? profile.experience_years,
    seniority: fields.seniority ?? profile.seniority,
    domains: fields.domains ?? profile.domains,
    preferences: fields.preferences ?? profile.preferences,
  };

  db.query(
    `UPDATE profiles SET
       roles = ?, skills_primary = ?, skills_secondary = ?,
       experience_years = ?, seniority = ?, domains = ?, preferences = ?,
       resume_text = COALESCE(?, resume_text),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    JSON.stringify(merged.roles),
    JSON.stringify(merged.skills_primary),
    JSON.stringify(merged.skills_secondary),
    merged.experience_years,
    merged.seniority,
    JSON.stringify(merged.domains),
    JSON.stringify(merged.preferences),
    resumeText ?? null,
    profile.id
  );

  return getProfile(db)!;
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function deserializeProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as number,
    roles: safeParseJson(row.roles, []),
    skills_primary: safeParseJson(row.skills_primary, []),
    skills_secondary: safeParseJson(row.skills_secondary, []),
    experience_years: (row.experience_years as number) ?? 0,
    seniority: (row.seniority as string) ?? "",
    domains: safeParseJson(row.domains, []),
    preferences: {
      locations: [],
      remote: false,
      min_salary: null,
      company_sizes: [],
      ...safeParseJson<Partial<ProfilePreferences>>(row.preferences, {}),
    },
    career_intent: (row.career_intent as string) ?? null,
    dealbreakers: safeParseJson(row.dealbreakers, []),
    problem_solving_stories: safeParseJson(row.problem_solving_stories, []),
    technical_depth: safeParseJson(row.technical_depth, []),
    created_at: (row.created_at as string) ?? "",
    updated_at: (row.updated_at as string) ?? "",
  };
}
