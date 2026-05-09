import { BrowserWindow, BrowserView, Utils } from "electrobun/bun";
import type { AppRPCSchema, SearchQuery } from "../shared/types";
import { getDb, runMigrations, closeDb } from "./db";
import { GeminiClient } from "./gemini-client";
import { extractText, parseResume } from "./resume-parser";
import { storeProfile, getProfile, updateProfile } from "./profile-store";
import { generateQuestions, submitEnrichmentAnswers } from "./profile-enrichment";
import { generateSearchQueries, getStoredSearchQueries } from "./query-generator";
import { getResumesDir } from "./paths";
import { LinkedInAdapter, searchCities } from "./linkedin-adapter";
import { storeJobs, getJobFeed, storeSearchQuery } from "./job-store";
import { DetailFetchQueue, runHeuristicAndQueueDetails, type DetailEvent } from "./detail-fetch-queue";
import { getSecret, storeSecret, deleteSecret } from "./secret-store";
import type { SelectorConfig } from "../shared/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

function loadSelectors(): SelectorConfig {
  const candidates = [
    join(import.meta.dir, "app", "config", "linkedin-selectors.json"),
    join(import.meta.dir, "../../config/linkedin-selectors.json"),
    join(import.meta.dir, "../config/linkedin-selectors.json"),
    join(import.meta.dir, "config/linkedin-selectors.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`[config] Loaded selectors from: ${p}`);
      return JSON.parse(readFileSync(p, "utf-8"));
    }
  }
  console.error(`[config] Selector candidates tried:`, candidates);
  throw new Error("linkedin-selectors.json not found in any candidate path");
}

const linkedInSelectors = loadSelectors();

let detailQueue: DetailFetchQueue | null = null;

function getDetailQueue(): DetailFetchQueue {
  if (!detailQueue) {
    const detailAdapter = new LinkedInAdapter({
      selectors: linkedInSelectors,
      maxAgeSecs: (linkedInSelectors.maxAgeDays ?? 7) * 86400,
      delayMs: 0,
    });
    const dataDir = Utils.paths.userData;
    mkdirSync(dataDir, { recursive: true });
    detailQueue = new DetailFetchQueue({
      db: getDb(),
      adapter: detailAdapter,
      dataPath: join(dataDir, "bunqueue.db"),
      emit: (e: DetailEvent) => rpc.send.pipelineUpdate(e),
    });
  }
  return detailQueue;
}

async function runFetchPipeline(profileId: number): Promise<void> {
  const profile = getProfile(getDb());
  if (!profile || profile.id !== profileId) return;
  try {
    const result = await runHeuristicAndQueueDetails(getDb(), profile, getDetailQueue());
    console.log(`[detail] scored=${result.scored} queued=${result.queued}`);
  } catch (err: any) {
    console.error("[detail] pipeline failed:", err.message);
  }
}

const migrationResult = runMigrations();
console.log(`Migrations applied: ${migrationResult.applied}`);

const pdfRow = getDb().query("SELECT id, resume_pdf_path FROM profiles LIMIT 1").get() as { id: number; resume_pdf_path: string | null } | null;
if (pdfRow?.resume_pdf_path && !existsSync(pdfRow.resume_pdf_path)) {
  getDb().query("UPDATE profiles SET resume_pdf_path = NULL WHERE id = ?").run(pdfRow.id);
  console.log(`[startup] Cleared stale resume_pdf_path for profile ${pdfRow.id}`);
}

const API_KEY_NAME = "gemini_api_key_enc";
let lastPagesPerQuery = 0;
let lastSearchTime = 0;

async function runGeneratedSearches(queries: (SearchQuery & { strategy?: string })[], startedAt: number): Promise<number> {
  const maxAgeSecs = (linkedInSelectors.maxAgeDays ?? 7) * 86400;
  const hasRemote = queries.some((q) => q.remote);
  const avgKeywords = Math.ceil(queries.reduce((sum, q) => sum + q.keywords.length, 0) / Math.max(queries.length, 1));
  const searchesPerQuery = avgKeywords * (hasRemote ? 2 : 1);
  const pagesPerQuery = Math.max(1, Math.floor(200 / (Math.max(queries.length, 1) * searchesPerQuery * 10)));
  lastPagesPerQuery = pagesPerQuery;
  lastSearchTime = Date.now();
  console.log(`[queries] pagesPerQuery=${pagesPerQuery} (${queries.length} queries, ~${avgKeywords} keywords, remote=${hasRemote})`);

  const adapter = new LinkedInAdapter({
    selectors: linkedInSelectors,
    maxAgeSecs,
    pagesPerQuery,
  });

  const MAX_JOBS = 200;
  let totalDiscovered = 0;
  let queriesRun = 0;
  for (let i = 0; i < queries.length; i++) {
    if (totalDiscovered >= MAX_JOBS) {
      console.log(`[queries] Reached ${MAX_JOBS} job cap, skipping remaining queries`);
      break;
    }
    const query = queries[i]!;
    const strategy = query.strategy ?? "precise";
    rpc.send.pipelineUpdate({
      type: "queries:progress",
      payload: { current: i + 1, total: queries.length, query: query.keywords.join(", "), strategy },
    });
    rpc.send.pipelineUpdate({ type: "job:searching", payload: { query } });
    console.log(`[queries] Query ${i + 1}/${queries.length} [${strategy}]: ${query.keywords.join(", ")}`);
    queriesRun++;
    await adapter.search(query, (batch) => {
      const result = storeJobs(getDb(), batch);
      totalDiscovered += result.inserted;
      rpc.send.pipelineUpdate({ type: "job:search:complete", payload: { total: result.inserted } });
      return result;
    });
  }

  console.log(`[queries] Complete: ${totalDiscovered} new jobs (${((performance.now() - startedAt) / 1000).toFixed(1)}s)`);
  rpc.send.pipelineUpdate({
    type: "queries:search:complete",
    payload: { queriesRun, jobsDiscovered: totalDiscovered },
  });
  const profile = getProfile(getDb());
  if (profile) await runFetchPipeline(profile.id);
  return totalDiscovered;
}

function getGemini(): GeminiClient | null {
  const key = getSecret(getDb(), API_KEY_NAME);
  return key ? new GeminiClient(key) : null;
}

function requireGemini(): GeminiClient {
  const client = getGemini();
  if (!client) throw new Error("No Gemini API key configured. Go to setup.");
  return client;
}

const rpc = BrowserView.defineRPC<AppRPCSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      getHealth: async () => {
        const gemini = getGemini();
        const geminiOk = gemini ? await gemini.checkHealth() : false;
        try {
          getDb().query("SELECT 1").get();
          return { gemini: geminiOk, db: true };
        } catch {
          return { gemini: geminiOk, db: false };
        }
      },
      getProfile: () => {
        return getProfile(getDb());
      },
      getResumeText: () => {
        const row = getDb()
          .query("SELECT resume_text FROM profiles LIMIT 1")
          .get() as { resume_text: string } | null;
        return row?.resume_text ?? null;
      },
      resetProfile: () => {
        const db = getDb();
        db.query("DELETE FROM scores").run();
        db.query("DELETE FROM llm_reasoning").run();
        db.query("DELETE FROM enrichment_answers").run();
        db.query("DELETE FROM enrichment_questions").run();
        db.query("DELETE FROM search_queries").run();
        db.query("DELETE FROM jobs").run();
        db.query("DELETE FROM profiles").run();
      },
      updateProfile: ({ fields, resumeText }) => {
        return updateProfile(getDb(), fields, resumeText);
      },
      runMigrations: () => {
        return runMigrations();
      },
      hasApiKey: () => {
        return getSecret(getDb(), API_KEY_NAME) !== null;
      },
      setApiKey: async ({ key }) => {
        const client = new GeminiClient(key);
        const valid = await client.checkHealth();
        if (valid) {
          storeSecret(getDb(), API_KEY_NAME, key);
        }
        return { valid };
      },
      getEnrichmentAnswers: ({ profileId }) => {
        const rows = getDb().query(
          "SELECT question, answer, category FROM enrichment_answers WHERE profile_id = ? ORDER BY id"
        ).all(profileId) as { question: string; answer: string; category: string }[];
        return rows;
      },
      getJobFeed: (params) => {
        return getJobFeed(getDb(), params);
      },
      searchCities: async ({ query }) => {
        return searchCities(query);
      },
    },
    messages: {
      "*": (messageName, payload) => {
        console.log(`[webview] ${messageName}:`, payload);
      },
      log: ({ level, msg }) => {
        console.log(`[webview:${level}] ${msg}`);
      },
      generateEnrichmentQuestions: async ({ profileId }) => {
        try {
          const profile = getProfile(getDb());
          if (!profile || profile.id !== profileId) throw new Error("Profile not found");
          const gemini = requireGemini();

          rpc.send.pipelineUpdate({ type: "enrichment:generating", payload: null });
          console.log("[enrichment] Generating questions");
          const t = performance.now();
          const questions = await generateQuestions(getDb(), profile, gemini);
          console.log(`[enrichment] Questions generated (${((performance.now() - t) / 1000).toFixed(1)}s)`);
          rpc.send.pipelineUpdate({ type: "enrichment:questions", payload: { questions } });
        } catch (err: any) {
          console.error(`[enrichment] Question generation failed:`, err.message);
          rpc.send.pipelineUpdate({ type: "enrichment:error", payload: { message: err.message ?? "Failed to generate questions" } });
        }
      },
      processEnrichmentAnswers: async ({ profileId, answers }) => {
        try {
          const gemini = requireGemini();

          rpc.send.pipelineUpdate({ type: "enrichment:extracting", payload: null });
          console.log(`[enrichment] Extracting structured data from ${answers.length} answers`);
          const t = performance.now();
          const updated = await submitEnrichmentAnswers(getDb(), profileId, answers, gemini);
          console.log(`[enrichment] Extraction + merge done (${((performance.now() - t) / 1000).toFixed(1)}s)`);
          rpc.send.pipelineUpdate({ type: "enrichment:complete", payload: { profile: updated } });
        } catch (err: any) {
          rpc.send.pipelineUpdate({ type: "enrichment:error", payload: { message: err.message ?? "Failed to process answers" } });
        }
      },
      searchJobs: async (query) => {
        try {
          rpc.send.pipelineUpdate({ type: "job:searching", payload: { query } });
          console.log(`[jobs] Searching: ${query.keywords.join(", ")} in "${query.location ?? "anywhere"}"`);
          const t = performance.now();

          const maxAgeSecs = (linkedInSelectors.maxAgeDays ?? 7) * 86400;
          const adapter = new LinkedInAdapter({
            selectors: linkedInSelectors,
            maxAgeSecs,
            pagesPerQuery: linkedInSelectors.pagesPerQuery,
          });

          const parsed = await adapter.search(query);
          const result = storeJobs(getDb(), parsed);
          console.log(`[jobs] Found ${parsed.length}, stored ${result.inserted} new (${result.skipped} dupes) (${((performance.now() - t) / 1000).toFixed(1)}s)`);

          const profile = getProfile(getDb());
          if (profile) {
            storeSearchQuery(getDb(), profile.id, query);
          } else {
            console.warn("[jobs] Search without profile; query not logged");
          }

          rpc.send.pipelineUpdate({
            type: "job:search:complete",
            payload: { total: result.inserted },
          });

          if (profile) await runFetchPipeline(profile.id);
        } catch (err: any) {
          console.error(`[jobs] Search failed:`, err.message);
          rpc.send.pipelineUpdate({
            type: "job:search:error",
            payload: { message: err.message ?? "Search failed" },
          });
        }
      },
      generateAndSearch: async ({ profileId }) => {
        try {
          const profile = getProfile(getDb());
          if (!profile || profile.id !== profileId) throw new Error("Profile not found");
          const gemini = requireGemini();

          rpc.send.pipelineUpdate({ type: "queries:generating", payload: null });
          console.log("[queries] Generating search queries from profile");
          const t = performance.now();
          const queries = await generateSearchQueries(getDb(), profile, gemini);
          console.log(`[queries] Generated ${queries.length} queries (${((performance.now() - t) / 1000).toFixed(1)}s)`);
          rpc.send.pipelineUpdate({ type: "queries:generated", payload: { count: queries.length } });

          await runGeneratedSearches(queries, t);
        } catch (err: any) {
          console.error("[queries] Failed:", err.message);
          rpc.send.pipelineUpdate({
            type: "queries:error",
            payload: { message: err.message ?? "Query generation failed" },
          });
        }
      },
      refreshSearch: async ({ profileId }) => {
        try {
          const profile = getProfile(getDb());
          if (!profile || profile.id !== profileId) throw new Error("Profile not found");

          rpc.send.pipelineUpdate({ type: "queries:generating", payload: null });
          const queries = getStoredSearchQueries(getDb(), profile);
          if (queries.length === 0) throw new Error("Saved queries are stale or missing. Regenerate queries.");

          const t = performance.now();
          rpc.send.pipelineUpdate({ type: "queries:generated", payload: { count: queries.length } });
          await runGeneratedSearches(queries, t);
        } catch (err: any) {
          console.error("[queries] Refresh failed:", err.message);
          rpc.send.pipelineUpdate({
            type: "queries:error",
            payload: { message: err.message ?? "Refresh search failed" },
          });
        }
      },
      regenerateQueries: async ({ profileId }) => {
        try {
          const profile = getProfile(getDb());
          if (!profile || profile.id !== profileId) throw new Error("Profile not found");
          const gemini = requireGemini();

          rpc.send.pipelineUpdate({ type: "queries:generating", payload: null });
          console.log("[queries] Regenerating search queries from profile");
          const t = performance.now();
          const queries = await generateSearchQueries(getDb(), profile, gemini, { force: true });
          console.log(`[queries] Regenerated ${queries.length} queries (${((performance.now() - t) / 1000).toFixed(1)}s)`);
          rpc.send.pipelineUpdate({ type: "queries:generated", payload: { count: queries.length } });

          await runGeneratedSearches(queries, t);
        } catch (err: any) {
          console.error("[queries] Regenerate failed:", err.message);
          rpc.send.pipelineUpdate({
            type: "queries:error",
            payload: { message: err.message ?? "Query regeneration failed" },
          });
        }
      },
      fetchMoreJobs: async ({ profileId }) => {
        try {
          const profile = getProfile(getDb());
          if (!profile || profile.id !== profileId) throw new Error("Profile not found");

          const cached = getDb().query(
            "SELECT queries_json FROM generated_queries WHERE profile_id = ?"
          ).get(profile.id) as { queries_json: string } | null;

          if (!cached) {
            rpc.send.pipelineUpdate({ type: "fetchmore:error", payload: { message: "No previous queries. Run Find Jobs first." } });
            return;
          }

          const queries: SearchQuery[] = JSON.parse(cached.queries_json);
          const hoursSinceSearch = (Date.now() - lastSearchTime) / 3_600_000;
          if (hoursSinceSearch > 24 || lastPagesPerQuery === 0) {
            lastPagesPerQuery = 1;
            lastSearchTime = Date.now();
            console.log("[fetchmore] 24h+ since last search, resetting to page 1");
          } else {
            lastPagesPerQuery += 1;
          }
          console.log(`[fetchmore] Fetching page ${lastPagesPerQuery} across ${queries.length} queries`);

          rpc.send.pipelineUpdate({ type: "fetchmore:searching", payload: null });

          const maxAgeSecs = (linkedInSelectors.maxAgeDays ?? 7) * 86400;
          const adapter = new LinkedInAdapter({
            selectors: linkedInSelectors,
            maxAgeSecs,
            pagesPerQuery: lastPagesPerQuery,
            startPage: lastPagesPerQuery - 1,
          });

          let totalDiscovered = 0;
          for (const query of queries) {
            await adapter.search(query, (batch) => {
              const result = storeJobs(getDb(), batch);
              totalDiscovered += result.inserted;
              rpc.send.pipelineUpdate({ type: "job:search:complete", payload: { total: result.inserted } });
              return result;
            });
          }

          console.log(`[fetchmore] Complete: ${totalDiscovered} new jobs`);
          rpc.send.pipelineUpdate({ type: "fetchmore:complete", payload: { jobsDiscovered: totalDiscovered } });
          await runFetchPipeline(profile.id);
        } catch (err: any) {
          console.error("[fetchmore] Failed:", err.message);
          rpc.send.pipelineUpdate({ type: "fetchmore:error", payload: { message: err.message ?? "Fetch more failed" } });
        }
      },
      pickAndProcessResume: async () => {
        try {
          const filePaths = await Utils.openFileDialog({
            allowedFileTypes: "pdf",
            canChooseFiles: true,
            canChooseDirectory: false,
            allowsMultipleSelection: false,
          });

          const filePath = filePaths[0];
          if (!filePath) {
            rpc.send.pipelineUpdate({ type: "resume:cancelled", payload: null });
            return;
          }

          console.log(`[resume] Selected: ${filePath}`);
          const totalStart = performance.now();

          rpc.send.pipelineUpdate({ type: "resume:extracting", payload: null });
          await new Promise(r => setTimeout(r, 50));
          let t = performance.now();
          const pdfBytes = new Uint8Array(readFileSync(filePath));
          const resumeText = await extractText(pdfBytes);
          console.log(`[resume] Extracted ${resumeText.length} chars (${((performance.now() - t) / 1000).toFixed(1)}s)`);

          rpc.send.pipelineUpdate({ type: "resume:parsing", payload: null });
          t = performance.now();
          const gemini = requireGemini();
          const parsed = await parseResume(resumeText, gemini);
          console.log(`[resume] LLM parse done (${((performance.now() - t) / 1000).toFixed(1)}s)`);

          rpc.send.pipelineUpdate({ type: "resume:storing", payload: null });
          t = performance.now();
          let pdfDest: string | undefined;
          try {
            const resumesDir = getResumesDir();
            pdfDest = join(resumesDir, "resume.pdf");
            writeFileSync(pdfDest, pdfBytes);
          } catch (fileErr: any) {
            throw new Error(`Failed to save resume PDF: ${fileErr.message}`);
          }
          storeProfile(getDb(), parsed, resumeText, pdfDest);
          console.log(`[resume] Stored (${((performance.now() - t) / 1000).toFixed(1)}s)`);

          const profile = getProfile(getDb())!;
          console.log(`[resume] Total: ${((performance.now() - totalStart) / 1000).toFixed(1)}s`);
          rpc.send.pipelineUpdate({ type: "resume:complete", payload: null });
        } catch (err: any) {
          rpc.send.pipelineUpdate({
            type: "resume:error",
            payload: { message: err.message ?? "Upload failed" },
          });
        }
      },
    },
  },
});

const VITE_PORT = 5173;
let windowUrl = "views://mainview/index.html";
try {
  const probe = await fetch(`http://localhost:${VITE_PORT}`, { method: "HEAD" });
  if (probe.ok) {
    windowUrl = `http://localhost:${VITE_PORT}`;
    console.log("[dev] HMR enabled via Vite dev server");
  }
} catch {}

const win = new BrowserWindow({
  title: "Role Radar",
  url: windowUrl,
  frame: {
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
  },
  rpc,
});

function shutdown() {
  if (detailQueue) {
    detailQueue.close().catch(() => {});
    detailQueue = null;
  }
  closeDb();
}

process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });
process.on("beforeExit", shutdown);
process.on("exit", shutdown);
