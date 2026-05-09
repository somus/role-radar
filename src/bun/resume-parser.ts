import type { GeminiClient } from "./gemini-client";
import { ResumeParseResultSchema, type ResumeParseResult } from "../shared/types";

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
- roles: job titles the person targets or has held (e.g., "Backend Engineer", "Staff SRE")
- skills_primary: core technical skills prominently featured
- skills_secondary: supporting skills mentioned less prominently
- experience_years: total years of professional experience (integer)
- seniority: one of exactly: "Junior", "Mid", "Senior", "Staff", "Principal", "Executive"
- domains: industries or verticals (e.g., "Fintech", "Healthcare", "AdTech")
- preferences.locations: cities/regions mentioned in resume header or context
- preferences.remote: true if resume mentions remote work preference, false otherwise
- preferences.country: infer the country from locations/address in resume (e.g., "India", "United States", "Germany"). null if cannot be determined
- preferences.min_salary: always null (cannot be inferred from resume)
- preferences.company_sizes: always empty array (cannot be inferred from resume)

Resume text:
`;

export async function parseResume(
  text: string,
  gemini: GeminiClient
): Promise<ResumeParseResult> {
  return gemini.infer(PARSE_PROMPT + text, ResumeParseResultSchema);
}
