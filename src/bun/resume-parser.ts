import type { GeminiClient } from "./gemini-client";
import {
  ResumeUploadParseResultSchema,
  type ResumeUploadParseResult,
} from "../shared/types";

export async function extractText(pdfBytes: Uint8Array): Promise<string> {
  const { writeFileSync, unlinkSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const { extractFileSync } = await import("@kreuzberg/node");

  const tempPath = join(tmpdir(), `resume-${Date.now()}.pdf`);
  writeFileSync(tempPath, pdfBytes);

  try {
    const result = extractFileSync(tempPath, null, {
      ocr: {
        backend: "tesseract",
        language: "eng",
      },
    });

    if (!result.content || result.content.trim().length === 0) {
      throw new Error("Could not extract text from PDF — file may be empty or unreadable");
    }

    return result.content;
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
}

const PARSE_PROMPT = `You are a resume parser. Extract structured data from the following resume text.

Rules:
- Return a JSON object with exactly two top-level keys: profile and resume.
- profile.roles: job titles the person targets or has held (e.g., "Backend Engineer", "Staff SRE")
- profile.skills_primary: core technical skills prominently featured
- profile.skills_secondary: supporting skills mentioned less prominently
- profile.experience_years: total years of professional experience (integer)
- profile.seniority: one of exactly: "Junior", "Mid", "Senior", "Staff", "Principal", "Executive"
- profile.domains: industries or verticals (e.g., "Fintech", "Healthcare", "AdTech")
- profile.preferences.locations: cities/regions mentioned in resume header or context
- profile.preferences.remote: true if resume mentions remote work preference, false otherwise
- profile.preferences.country: infer the country from locations/address in resume (e.g., "India", "United States", "Germany"). null if cannot be determined
- profile.preferences.min_salary: always null (cannot be inferred from resume)
- profile.preferences.company_sizes: always empty array (cannot be inferred from resume)
- resume must preserve the whole renderable resume for later Typst generation.
- Use empty strings for missing scalar resume fields and empty arrays for missing optional sections.
- Put GitHub, LinkedIn, and personal website URLs in resume.contact.github, resume.contact.linkedin, and resume.contact.personal_site when present.
- Put other contact links in resume.contact.links.
- Preserve company names, job titles, institutions, dates, links, and bullet claims exactly as written when possible.
- Do not invent missing contact fields, roles, dates, metrics, skills, projects, certifications, or education.
- section_order should list the resume sections in the order they appear, using these keys where present: contact, summary, experience, skills, education, projects, certifications, extracurriculars, additional_sections.

Resume text:
`;

export async function parseResume(
  text: string,
  gemini: GeminiClient
): Promise<ResumeUploadParseResult> {
  return gemini.infer(PARSE_PROMPT + text, ResumeUploadParseResultSchema);
}
