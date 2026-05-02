import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { extractText } from "../resume-parser";
import { getAppDataDir } from "../paths";
import { storeProfile, getProfile, updateProfile } from "../profile-store";
import { ResumeParseResultSchema } from "../../shared/types";
import type { ResumeParseResult } from "../../shared/types";
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

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("stores and retrieves a profile", () => {
    const id = storeProfile(db, parseResult, "extracted resume text");
    const profile = getProfile(db);

    expect(profile).not.toBeNull();
    expect(profile!.id).toBe(id);
    expect(profile!.roles).toEqual(["Backend Engineer"]);
    expect(profile!.skills_primary).toEqual(["TypeScript", "Go"]);
    expect(profile!.seniority).toBe("Senior");
    expect(profile!.experience_years).toBe(8);
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

  test("overwrites profile on re-store", () => {
    storeProfile(db, parseResult, "first resume");
    storeProfile(db, { ...parseResult, seniority: "Staff" }, "second resume");

    const profile = getProfile(db);
    expect(profile!.seniority).toBe("Staff");
    // only one profile exists
    const count = db.query("SELECT COUNT(*) as c FROM profiles").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
