/**
 * Re-scrape job details for existing jobs to backfill location, seniority, industry.
 * Reads scraped_jobs.json, fetches detail pages, updates fields in-place.
 *
 * Usage: bun run model-training/rescrape-details.ts
 */

import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting";
const OUTPUT = join(import.meta.dir, "data", "scraped_jobs.json");

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

function parseJobDetailHtml(html: string) {
  let description: string | null = null;
  let seniority: string | null = null;
  let employment_type: string | null = null;
  let job_function: string | null = null;
  let industry: string | null = null;
  let title: string | null = null;
  let company: string | null = null;
  let location: string | null = null;

  const descMatch = html.match(
    /class="(?:show-more-less-html__markup|description__text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (descMatch) {
    description = descMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|li|ul|ol|h[1-6])[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const criteriaPattern = /<li[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*([\s\S]*?)\s*<\/li>/gi;
  let m;
  while ((m = criteriaPattern.exec(html)) !== null) {
    const label = m[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const val = m[2].replace(/<[^>]+>/g, "").trim();
    if (label.includes("seniority")) seniority = val;
    else if (label.includes("employment")) employment_type = val;
    else if (label.includes("function")) job_function = val;
    else if (label.includes("industr")) industry = val;
  }

  const titleMatch = html.match(/class="[^"]*topcard__title[^"]*"[^>]*>([\s\S]*?)<\//i);
  if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, "").trim();

  const companyLocMatch = html.match(
    /topcard-org-name[^"]*"[^>]*>([\s\S]*?)<\/a>\s*([\s\S]*?)<\/div>/i
  );
  if (companyLocMatch) {
    company = companyLocMatch[1].replace(/<[^>]+>/g, "").trim();
    const locText = companyLocMatch[2].replace(/<[^>]+>/g, "").trim();
    if (locText && locText.length > 2 && locText.length < 100) {
      location = locText;
    }
  }

  return { description, seniority, employment_type, job_function, industry, title, company, location };
}

async function main() {
  const jobs: any[] = JSON.parse(readFileSync(OUTPUT, "utf-8"));
  console.log(`Loaded ${jobs.length} jobs. Re-scraping details...`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobId = job.id.replace("linkedin_", "");

    try {
      const res = await fetch(`${DETAIL_URL}/${jobId}`);
      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          console.log(`  Rate limited at ${i}, backing off 30s...`);
          await randomDelay(30000, 60000);
          i--;
          continue;
        }
        failed++;
        continue;
      }

      const html = await res.text();
      if (html.length < 5000) {
        failed++;
        continue;
      }

      const detail = parseJobDetailHtml(html);

      if (detail.location) job.location = detail.location;
      if (detail.seniority_level) job.seniority_level = detail.seniority;
      else if (detail.seniority) job.seniority_level = detail.seniority;
      if (detail.employment_type) job.employment_type = detail.employment_type;
      if (detail.job_function) job.job_function = detail.job_function;
      if (detail.industry) job.industry = detail.industry;
      if (detail.title) job.title = detail.title;
      if (detail.company) job.company = detail.company;
      if (detail.description && detail.description.length > (job.description || "").length) {
        job.description = detail.description;
      }

      job.remote_hint = (detail.location || "").toLowerCase().includes("remote") ||
        (job.description || "").toLowerCase().includes("remote");

      updated++;
    } catch {
      failed++;
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  Progress: ${i + 1}/${jobs.length} (updated=${updated}, failed=${failed})`);
      writeFileSync(OUTPUT, JSON.stringify(jobs, null, 2));
    }

    await randomDelay(1500, 3000);
  }

  writeFileSync(OUTPUT, JSON.stringify(jobs, null, 2));

  const withLoc = jobs.filter((j: any) => j.location && j.location !== "None").length;
  const withSen = jobs.filter((j: any) => j.seniority_level).length;
  const withInd = jobs.filter((j: any) => j.industry).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
  console.log(`With location: ${withLoc}/${jobs.length}`);
  console.log(`With seniority: ${withSen}/${jobs.length}`);
  console.log(`With industry: ${withInd}/${jobs.length}`);
}

main().catch(console.error);
