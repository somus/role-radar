import type { Database } from "bun:sqlite";
import type { GeminiClient } from "./gemini-client";
import type { Profile, EnrichmentQuestion, EnrichmentAnswer } from "../shared/types";
import { EnrichmentQuestionsSchema, EnrichmentExtractionSchema } from "../shared/types";
import { getProfile } from "./profile-store";

const QUESTIONS_PROMPT = `Generate 5 short questions to learn about a job seeker's preferences and experience. NOT interview questions — you're getting to know them to find better job matches.

Tone: casual, friendly, direct. Like a recruiter chat, not a job interview.
- DON'T ask "Can you share an example of..." or "How do you typically handle..."
- DO ask "What kind of...", "What matters most to you about...", "What did you enjoy most about..."

Categories (exactly this distribution):
- career_intent (2): What they want next, what they'd reject, work environment preferences
- problem_solving (2): What kind of work energizes them, proudest accomplishments from past roles mentioned in their profile
- technical_depth (1): Which of their listed skills they're deepest in, what they want to learn

Each question needs: question, category, guided_prompt (one-line hint to help them think).

Profile: {seniority} with {experience_years}y experience. Roles: {roles}. Skills: {skills_primary}. Domains: {domains}.

JSON: { "questions": [{ "question": "...", "category": "...", "guided_prompt": "..." }, ...] }
`;

export async function generateQuestions(
  db: Database,
  profile: Profile,
  gemini: GeminiClient
): Promise<EnrichmentQuestion[]> {
  const cached = db.query(
    "SELECT questions_json FROM enrichment_questions WHERE profile_id = ? AND profile_updated_at = ?"
  ).get(profile.id, profile.updated_at) as { questions_json: string } | null;

  if (cached) {
    return JSON.parse(cached.questions_json);
  }

  const prompt = QUESTIONS_PROMPT
    .replace("{roles}", profile.roles.join(", "))
    .replace("{skills_primary}", profile.skills_primary.join(", "))
    .replace("{experience_years}", String(profile.experience_years))
    .replace("{seniority}", profile.seniority)
    .replace("{domains}", profile.domains.join(", "));

  const result = await gemini.infer(prompt, EnrichmentQuestionsSchema);

  db.query(
    `INSERT INTO enrichment_questions (profile_id, profile_updated_at, questions_json)
     VALUES (?, ?, ?)
     ON CONFLICT(profile_id) DO UPDATE SET profile_updated_at = excluded.profile_updated_at, questions_json = excluded.questions_json`
  ).run(profile.id, profile.updated_at, JSON.stringify(result.questions));

  return result.questions;
}

const EXTRACTION_PROMPT = `You are a data extraction engine. Given a job seeker's answers to enrichment questions, extract structured data.

Extract:
- career_intent: A single sentence summarizing what they want next (null if not answered)
- dealbreakers: Array of hard constraints that would make them reject a job
- problem_solving_stories: Array of concise summaries of problem-solving examples
- technical_depth: Array of specific technical competencies beyond resume bullets

Questions and answers:
{qa_pairs}

Respond with JSON: { "career_intent": "...", "dealbreakers": [...], "problem_solving_stories": [...], "technical_depth": [...] }
`;

export async function submitEnrichmentAnswers(
  db: Database,
  profileId: number,
  answers: EnrichmentAnswer[],
  gemini: GeminiClient
): Promise<Profile> {
  if (answers.length === 0) return getProfile(db)!;

  db.query("DELETE FROM enrichment_answers WHERE profile_id = ?").run(profileId);

  for (const a of answers) {
    db.query(
      "INSERT INTO enrichment_answers (profile_id, question, answer, category) VALUES (?, ?, ?, ?)"
    ).run(profileId, a.question, a.answer, a.category);
  }

  const qaPairs = answers
    .map((a) => `Q [${a.category}]: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");
  const prompt = EXTRACTION_PROMPT.replace("{qa_pairs}", qaPairs);

  const extracted = await gemini.infer(prompt, EnrichmentExtractionSchema);

  db.query(
    `UPDATE profiles SET
       career_intent = ?, dealbreakers = ?,
       problem_solving_stories = ?, technical_depth = ?
     WHERE id = ?`
  ).run(
    extracted.career_intent,
    JSON.stringify(extracted.dealbreakers),
    JSON.stringify(extracted.problem_solving_stories),
    JSON.stringify(extracted.technical_depth),
    profileId
  );

  const updated = getProfile(db);
  if (!updated) throw new Error("Profile was deleted during enrichment");
  return updated;
}
