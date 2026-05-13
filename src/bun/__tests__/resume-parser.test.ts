import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { extractText, parseResume } from "../resume-parser";
import { getAppDataDir } from "../paths";
import { storeProfile, getProfile, updateProfile } from "../profile-store";
import { ResumeParseResultSchema, ResumeUploadParseResultSchema, StructuredResumeSchema } from "../../shared/types";
import type { ResumeParseResult, ResumeUploadParseResult, StructuredResume } from "../../shared/types";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const fixturePath = join(import.meta.dir, "fixtures/sample-resume.pdf");
const imageFixturePath = join(import.meta.dir, "fixtures/image-resume.pdf");

describe("extractText", () => {
  test("extracts text from valid PDF", async () => {
    const pdfBytes = new Uint8Array(readFileSync(fixturePath));
    const text = await extractText(pdfBytes);

    expect(text).toContain("Jane Doe");
    expect(text).toContain("Senior Backend Engineer");
    expect(text).toContain("TypeScript");
    expect(text).toContain("8 years");
  });

  test("falls back to OCR when text extraction returns no text", async () => {
    const pdfBytes = new Uint8Array(readFileSync(imageFixturePath));
    await expect(extractText(pdfBytes)).rejects.toThrow("Could not extract text from PDF");
  });

  test("throws on corrupt PDF", async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    await expect(extractText(garbage)).rejects.toThrow();
  });

  test("throws on empty buffer", async () => {
    const empty = new Uint8Array(0);
    await expect(extractText(empty)).rejects.toThrow();
  });
});

describe("ResumeParseResultSchema", () => {
  const validData = {
    roles: ["Backend Engineer", "Staff SRE"],
    skills_primary: ["TypeScript", "Go", "PostgreSQL"],
    skills_secondary: ["Python", "Redis"],
    experience_years: 8,
    seniority: "Senior",
    domains: ["Fintech", "AdTech"],
    preferences: {
      locations: ["San Francisco, CA"],
      remote: true,
      min_salary: null,
      company_sizes: [],
    },
  };

  test("accepts valid profile data", () => {
    const result = ResumeParseResultSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("rejects invalid seniority value", () => {
    const result = ResumeParseResultSchema.safeParse({
      ...validData,
      seniority: "Wizard",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing required fields", () => {
    const result = ResumeParseResultSchema.safeParse({
      roles: ["Engineer"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-integer experience years", () => {
    const result = ResumeParseResultSchema.safeParse({
      ...validData,
      experience_years: "eight",
    });
    expect(result.success).toBe(false);
  });
});

describe("StructuredResumeSchema", () => {
  const structuredResume: StructuredResume = {
    contact: {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-0100",
      location: "San Francisco, CA",
      github: "github.com/jane",
      linkedin: "linkedin.com/in/jane",
      personal_site: "jane.dev",
      links: [{ label: "LinkedIn", url: "https://linkedin.com/in/jane" }],
    },
    summary: "Senior Backend Engineer focused on distributed systems.",
    experience: [
      {
        company: "Acme",
        title: "Senior Backend Engineer",
        location: "Remote",
        start_date: "2020",
        end_date: "Present",
        current: true,
        bullets: ["Built TypeScript APIs", "Led PostgreSQL migrations"],
      },
    ],
    skills: [{ category: "Backend", items: ["TypeScript", "Go", "PostgreSQL"] }],
    education: [
      {
        institution: "State University",
        degree: "BS",
        field: "Computer Science",
        gpa: "4.0",
        location: "CA",
        start_date: "2010",
        end_date: "2014",
        details: ["Graduated with honors"],
      },
    ],
    projects: [],
    certifications: [],
    extracurriculars: [],
    additional_sections: [],
    section_order: ["contact", "summary", "experience", "skills", "education"],
  };

  test("accepts valid structured resume data", () => {
    expect(StructuredResumeSchema.safeParse(structuredResume).success).toBe(true);
  });

  test("accepts missing optional sections as empty arrays", () => {
    const result = StructuredResumeSchema.safeParse({
      contact: {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "555-0100",
        location: "San Francisco, CA",
      },
      summary: structuredResume.summary,
      experience: [{ ...structuredResume.experience[0], bullets: undefined }],
      skills: [{ category: "Backend" }],
      education: [{ ...structuredResume.education[0], details: undefined }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contact.links).toEqual([]);
      expect(result.data.projects).toEqual([]);
      expect(result.data.certifications).toEqual([]);
      expect(result.data.extracurriculars).toEqual([]);
      expect(result.data.additional_sections).toEqual([]);
    }
  });

  test("defaults Typst-specific optional fields for older stored resume JSON", () => {
    const result = StructuredResumeSchema.parse({
      ...structuredResume,
      contact: {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "555-0100",
        location: "San Francisco, CA",
      },
      education: [{ ...structuredResume.education[0], gpa: undefined }],
      extracurriculars: undefined,
    });

    expect(result.contact.github).toBe("");
    expect(result.contact.linkedin).toBe("");
    expect(result.contact.personal_site).toBe("");
    expect(result.education[0]?.gpa).toBe("");
    expect(result.extracurriculars).toEqual([]);
  });

  test("rejects invalid section shapes", () => {
    const result = StructuredResumeSchema.safeParse({
      ...structuredResume,
      experience: [{ company: "Acme", bullets: "Built APIs" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("parseResume", () => {
  test("requests combined profile and structured resume output", async () => {
    const parsed: ResumeUploadParseResult = {
      profile: {
        roles: ["Backend Engineer"],
        skills_primary: ["TypeScript"],
        skills_secondary: [],
        experience_years: 8,
        seniority: "Senior",
        domains: ["Fintech"],
        preferences: {
          locations: ["San Francisco"],
          remote: true,
          min_salary: null,
          company_sizes: [],
          country: "United States",
        },
      },
      resume: {
        contact: {
          name: "Jane Doe",
          email: "",
          phone: "",
          location: "",
          github: "",
          linkedin: "",
          personal_site: "",
          links: [],
        },
        summary: "",
        experience: [],
        skills: [],
        education: [],
        projects: [],
        certifications: [],
        extracurriculars: [],
        additional_sections: [],
        section_order: ["contact"],
      },
    };
    const gemini = {
      infer: async (prompt: string, schema: typeof ResumeUploadParseResultSchema) => {
        expect(prompt).toContain("exactly two top-level keys");
        expect(prompt).toContain("Jane Doe resume text");
        expect(schema).toBe(ResumeUploadParseResultSchema);
        return parsed;
      },
    };

    await expect(parseResume("Jane Doe resume text", gemini as any)).resolves.toEqual(parsed);
  });
});

describe("getAppDataDir", () => {
  test("returns path containing role-radar", () => {
    const dir = getAppDataDir();
    expect(dir).toContain("role-radar");
  });

  test("returns absolute path", () => {
    const dir = getAppDataDir();
    expect(dir.startsWith("/")).toBe(true);
  });

  test("returns consistent path on repeated calls", () => {
    expect(getAppDataDir()).toBe(getAppDataDir());
  });
});

describe("profile store", () => {
  let db: Database;
  const migrationsDir = join(import.meta.dir, "../../../migrations");
  const migrationSql = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()
    .map(f => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");

  const parseResult: ResumeParseResult = {
    roles: ["Backend Engineer"],
    skills_primary: ["TypeScript", "Go"],
    skills_secondary: ["Python"],
    experience_years: 8,
    seniority: "Senior",
    domains: ["Fintech"],
    preferences: {
      locations: ["San Francisco"],
      remote: true,
      min_salary: null,
      company_sizes: [],
      country: null,
    },
  };

  const resumeJson: StructuredResume = {
    contact: {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      location: "San Francisco",
      github: "github.com/janedoe",
      linkedin: "linkedin.com/in/janedoe",
      personal_site: "janedoe.dev",
      links: [],
    },
    summary: "Backend engineer",
    experience: [
      {
        company: "Acme",
        title: "Senior Backend Engineer",
        location: "Remote",
        start_date: "2020",
        end_date: "Present",
        current: true,
        bullets: ["Built APIs"],
      },
    ],
    skills: [{ category: "Languages", items: ["TypeScript", "Go"] }],
    education: [
      {
        institution: "State University",
        degree: "BS",
        field: "Computer Science",
        gpa: "3.9",
        location: "",
        start_date: "",
        end_date: "",
        details: [],
      },
    ],
    projects: [],
    certifications: [{ name: "AWS Certified Developer", issuer: "AWS", date: "2024", url: "aws.amazon.com" }],
    extracurriculars: [
      {
        activity: "Open Source Maintainer",
        start_date: "2021",
        end_date: "Present",
        bullets: ["Maintained developer tooling"],
      },
    ],
    additional_sections: [],
    section_order: ["contact", "summary", "experience", "skills", "education", "certifications", "extracurriculars"],
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("stores and retrieves a profile", () => {
    const id = storeProfile(db, parseResult, "extracted resume text", undefined, resumeJson);
    const profile = getProfile(db);

    expect(profile).not.toBeNull();
    expect(profile!.id).toBe(id);
    expect(profile!.roles).toEqual(["Backend Engineer"]);
    expect(profile!.skills_primary).toEqual(["TypeScript", "Go"]);
    expect(profile!.seniority).toBe("Senior");
    expect(profile!.experience_years).toBe(8);
    expect(profile!.resume_json).toEqual(resumeJson);
  });

  test("returns null when no profile exists", () => {
    expect(getProfile(db)).toBeNull();
  });

  test("updates profile fields", () => {
    storeProfile(db, parseResult, "resume text");
    const updated = updateProfile(db, {
      seniority: "Staff",
      experience_years: 10,
      roles: ["Staff Engineer", "Backend Engineer"],
    });

    expect(updated.seniority).toBe("Staff");
    expect(updated.experience_years).toBe(10);
    expect(updated.roles).toEqual(["Staff Engineer", "Backend Engineer"]);
    // unchanged fields preserved
    expect(updated.skills_primary).toEqual(["TypeScript", "Go"]);
  });

  test("updates structured resume fields", () => {
    storeProfile(db, parseResult, "resume text", undefined, resumeJson);
    const updatedResume = {
      ...resumeJson,
      experience: [
        {
          ...resumeJson.experience[0]!,
          bullets: ["Corrected API bullet"],
        },
      ],
      skills: [{ category: "Languages", items: ["TypeScript", "Bun"] }],
      education: [{ ...resumeJson.education[0]!, degree: "MS" }],
    };

    const updated = updateProfile(db, {}, undefined, updatedResume);

    expect(updated.resume_json?.experience[0]?.bullets).toEqual(["Corrected API bullet"]);
    expect(updated.resume_json?.skills[0]?.items).toEqual(["TypeScript", "Bun"]);
    expect(updated.resume_json?.education[0]?.degree).toBe("MS");
  });

  test("overwrites profile on re-store", () => {
    storeProfile(db, parseResult, "first resume", undefined, resumeJson);
    const replacementResume = {
      ...resumeJson,
      contact: { ...resumeJson.contact, name: "Janet Doe" },
    };
    storeProfile(db, { ...parseResult, seniority: "Staff" }, "second resume", undefined, replacementResume);

    const profile = getProfile(db);
    expect(profile!.seniority).toBe("Staff");
    expect(profile!.resume_json?.contact.name).toBe("Janet Doe");
    // only one profile exists
    const count = db.query("SELECT COUNT(*) as c FROM profiles").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
