/**
 * Job Snapshot Builder — scrape real LinkedIn jobs for training data.
 * India-focused, 6 role families, with full job descriptions.
 *
 * Usage: bun run model-training/scrape-jobs.ts
 */

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseSearchResults } from "../src/bun/html-rewriter-parser";
import type { SelectorConfig } from "../src/shared/types";

const selectors: SelectorConfig = JSON.parse(
  readFileSync(join(import.meta.dir, "../config/linkedin-selectors.json"), "utf-8")
);

const BASE_URL = "https://www.linkedin.com";
const SEARCH_URL = `${BASE_URL}/jobs-guest/jobs/api/seeMoreJobPostings/search`;
const DETAIL_URL = `${BASE_URL}/jobs-guest/jobs/api/jobPosting`;
const PAGE_SIZE = 10;
const MAX_PAGES = 5;

type ScrapedJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  seniority_level: string | null;
  employment_type: string | null;
  job_function: string | null;
  industry: string | null;
  url: string | null;
  posted_at: string | null;
  scraped_at: string;
  role_family_hint: string;
  domain_hint: string | null;
  experience_years_hint: number | null;
  remote_hint: boolean;
};

const SEARCH_QUERIES: Array<{ keyword: string; role_family: string }> = [
  // Software/IT
  { keyword: "software engineer", role_family: "fullstack" },
  { keyword: "backend developer", role_family: "backend" },
  { keyword: "backend engineer", role_family: "backend" },
  { keyword: "java developer", role_family: "backend" },
  { keyword: "python developer", role_family: "backend" },
  { keyword: "frontend developer", role_family: "frontend" },
  { keyword: "react developer", role_family: "frontend" },
  { keyword: "fullstack developer", role_family: "fullstack" },
  { keyword: "devops engineer", role_family: "devops" },
  { keyword: "cloud engineer", role_family: "devops" },
  { keyword: "site reliability engineer", role_family: "devops" },
  // Mobile
  { keyword: "android developer", role_family: "mobile" },
  { keyword: "ios developer", role_family: "mobile" },
  { keyword: "flutter developer", role_family: "mobile" },
  // Data/Analytics
  { keyword: "data engineer", role_family: "data" },
  { keyword: "data analyst", role_family: "data" },
  { keyword: "data scientist", role_family: "data" },
  { keyword: "machine learning engineer", role_family: "data" },
  // Product/Program
  { keyword: "product manager", role_family: "product" },
  { keyword: "program manager", role_family: "product" },
  { keyword: "technical program manager", role_family: "product" },
  // Sales/BD
  { keyword: "sales manager", role_family: "sales" },
  { keyword: "business development manager", role_family: "sales" },
  { keyword: "account manager", role_family: "sales" },
  { keyword: "key account manager", role_family: "sales" },
  // Marketing
  { keyword: "marketing manager", role_family: "marketing" },
  { keyword: "digital marketing manager", role_family: "marketing" },
  { keyword: "brand manager", role_family: "marketing" },
  { keyword: "content marketing manager", role_family: "marketing" },
  // HR/Recruiting
  { keyword: "HR manager", role_family: "hr" },
  { keyword: "recruiter", role_family: "hr" },
  { keyword: "talent acquisition", role_family: "hr" },
  { keyword: "HR generalist", role_family: "hr" },
  // Finance
  { keyword: "finance manager", role_family: "finance" },
  { keyword: "financial analyst", role_family: "finance" },
  { keyword: "accountant", role_family: "finance" },
  // Operations/Supply Chain
  { keyword: "operations manager", role_family: "operations" },
  { keyword: "supply chain manager", role_family: "operations" },
  { keyword: "logistics manager", role_family: "operations" },
  { keyword: "procurement manager", role_family: "operations" },
  // Customer Success
  { keyword: "customer success manager", role_family: "customer_success" },
  { keyword: "customer support manager", role_family: "customer_success" },
  // Legal
  { keyword: "legal counsel", role_family: "legal" },
  { keyword: "compliance manager", role_family: "legal" },
];

const CITIES = [
  "Bangalore", "Mumbai", "Delhi NCR", "Hyderabad", "Pune", "Chennai",
  "Kolkata", "Ahmedabad", "Gurgaon", "Noida", "Kochi", "Jaipur",
];
const EXP_LEVELS = ["1", "2", "3", "4", "5"];
const WORK_TYPES = ["1", "2", "3"]; // 1=onsite, 2=remote, 3=hybrid

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 403) {
        console.log(`  Rate limited (${res.status}), backing off...`);
        await randomDelay(10000 * Math.pow(2, attempt), 30000 * Math.pow(2, attempt));
        continue;
      }
      if (!res.ok) {
        console.log(`  HTTP ${res.status} for ${url.slice(0, 80)}...`);
        return null;
      }
      return res;
    } catch (e) {
      console.log(`  Network error: ${e}`);
      if (attempt < maxRetries) await randomDelay(5000, 10000);
    }
  }
  return null;
}

async function searchJobs(keyword: string, location: string, expLevel: string): Promise<string[]> {
  const jobIds: string[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      keywords: keyword,
      location,
      f_E: expLevel,
      start: String(page * PAGE_SIZE),
    });
    const url = `${SEARCH_URL}?${params}`;
    const res = await fetchWithRetry(url);
    if (!res) break;

    const html = await res.text();
    const parsed = await parseSearchResults(html, selectors);
    for (const job of parsed) {
      if (job.sourceId && job.status === "discovered") {
        jobIds.push(job.sourceId);
      }
    }
    if (parsed.length < PAGE_SIZE) break;
    await randomDelay(1000, 3000);
  }

  return jobIds;
}

async function fetchJobDetail(jobId: string): Promise<{
  description: string | null;
  seniority: string | null;
  employment_type: string | null;
  job_function: string | null;
  industry: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
}> {
  const url = `${DETAIL_URL}/${jobId}`;
  const res = await fetchWithRetry(url);
  if (!res) return { description: null, seniority: null, employment_type: null, job_function: null, industry: null, title: null, company: null, location: null };

  const html = await res.text();
  return parseJobDetailHtml(html);
}

function parseJobDetailHtml(html: string): {
  description: string | null;
  seniority: string | null;
  employment_type: string | null;
  job_function: string | null;
  industry: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
} {
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

  // Job criteria: <li><h3>Seniority level</h3>VALUE</li>
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

  // Company + location: <a ...topcard-org-name...>Company</a> Location Text
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
  const outputPath = join(import.meta.dir, "data", "scraped_jobs.json");
  const seenIds = new Set<string>();
  const jobs: ScrapedJob[] = [];

  if (existsSync(outputPath)) {
    const existing: ScrapedJob[] = JSON.parse(readFileSync(outputPath, "utf-8"));
    for (const j of existing) {
      seenIds.add(j.id);
      jobs.push(j);
    }
    console.log(`Resuming: ${jobs.length} existing jobs loaded`);
  }

  const now = new Date().toISOString().split("T")[0];
  let totalSearches = 0;
  let totalNewJobs = 0;

  // Build search combos: each keyword × rotating city/exp/workType
  const searchCombos: Array<{ keyword: string; role_family: string; city: string; expLevel: string }> = [];
  for (const { keyword, role_family } of SEARCH_QUERIES) {
    // Each keyword gets 3 different city+exp combos for diversity
    for (let i = 0; i < 3; i++) {
      const cityIdx = (SEARCH_QUERIES.indexOf(SEARCH_QUERIES.find(q => q.keyword === keyword)!) * 3 + i) % CITIES.length;
      const expIdx = (cityIdx + i) % EXP_LEVELS.length;
      searchCombos.push({ keyword, role_family, city: CITIES[cityIdx], expLevel: EXP_LEVELS[expIdx] });
    }
  }
  // Shuffle to spread rate limiting across keywords
  for (let i = searchCombos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [searchCombos[i], searchCombos[j]] = [searchCombos[j], searchCombos[i]];
  }

  console.log(`Total search combos: ${searchCombos.length}`);

  for (const { keyword, role_family, city, expLevel } of searchCombos) {
    console.log(`\nSearching: "${keyword}" in ${city} (exp=${expLevel})...`);
    const jobIds = await searchJobs(keyword, city, expLevel);
    console.log(`  Found ${jobIds.length} job IDs`);

    const newIds = jobIds.filter((id) => !seenIds.has(`linkedin_${id}`));
    console.log(`  New: ${newIds.length}`);

    for (const id of newIds) {
      seenIds.add(`linkedin_${id}`);
      await randomDelay(2000, 5000);

      const detail = await fetchJobDetail(id);
      const isRemote = (detail.location || "").toLowerCase().includes("remote");

      const job: ScrapedJob = {
        id: `linkedin_${id}`,
        title: detail.title || keyword,
        company: detail.company,
        location: detail.location,
        description: detail.description,
        seniority_level: detail.seniority,
        employment_type: detail.employment_type,
        job_function: detail.job_function,
        industry: detail.industry,
        url: `https://www.linkedin.com/jobs/view/${id}`,
        posted_at: null,
        scraped_at: now,
        role_family_hint: role_family,
        domain_hint: null,
        experience_years_hint: null,
        remote_hint: isRemote,
      };

      jobs.push(job);
      totalNewJobs++;

      if (totalNewJobs % 10 === 0) {
        console.log(`  Progress: ${totalNewJobs} new jobs scraped (${jobs.length} total)`);
        writeFileSync(outputPath, JSON.stringify(jobs, null, 2));
      }
    }

    totalSearches++;

    if (jobs.length >= 2500) {
      console.log(`\nReached 2500 jobs target, stopping.`);
      break;
    }

    await randomDelay(2000, 4000);
  }

  writeFileSync(outputPath, JSON.stringify(jobs, null, 2));

  const familyCounts: Record<string, number> = {};
  const withDesc = jobs.filter((j) => j.description).length;
  for (const j of jobs) familyCounts[j.role_family_hint] = (familyCounts[j.role_family_hint] || 0) + 1;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total jobs: ${jobs.length}`);
  console.log(`With descriptions: ${withDesc}`);
  console.log(`By role family:`, familyCounts);
  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);
