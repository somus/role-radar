import { BrowserWindow, BrowserView, Utils } from "electrobun/bun";
import type { AppRPCSchema } from "../shared/types";
import { getDb, runMigrations, closeDb } from "./db";
import { OllamaClient } from "./ollama-client";
import { extractText, parseResume } from "./resume-parser";
import { storeProfile, getProfile, updateProfile } from "./profile-store";
import { generateQuestions, submitEnrichmentAnswers } from "./profile-enrichment";
import { getResumesDir } from "./paths";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const migrationResult = runMigrations();
console.log(`Migrations applied: ${migrationResult.applied}`);

const pdfRow = getDb().query("SELECT id, resume_pdf_path FROM profiles LIMIT 1").get() as { id: number; resume_pdf_path: string | null } | null;
if (pdfRow?.resume_pdf_path && !existsSync(pdfRow.resume_pdf_path)) {
  getDb().query("UPDATE profiles SET resume_pdf_path = NULL WHERE id = ?").run(pdfRow.id);
  console.log(`[startup] Cleared stale resume_pdf_path for profile ${pdfRow.id}`);
}

const ollama = new OllamaClient();

const rpc = BrowserView.defineRPC<AppRPCSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      getHealth: async () => {
        const ollamaOk = await ollama.checkHealth();
        try {
          getDb().query("SELECT 1").get();
          return { ollama: ollamaOk, db: true };
        } catch {
          return { ollama: ollamaOk, db: false };
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
        getDb().query("DELETE FROM profiles").run();
      },
      updateProfile: ({ fields, resumeText }) => {
        return updateProfile(getDb(), fields, resumeText);
      },
      runMigrations: () => {
        return runMigrations();
      },
      checkOllama: async () => {
        return await ollama.checkHealth();
      },
      listOllamaModels: async () => {
        try {
          return await ollama.listModels();
        } catch (err) {
          console.error("[ollama] Failed to list models:", err);
          return [];
        }
      },
      pullOllamaModel: async ({ name }) => {
        try {
          for await (const event of ollama.pullModel(name)) {
            rpc.send.pipelineUpdate({ type: "pull:progress", payload: { status: event.status, completed: event.completed, total: event.total } });
            console.log(`[pull] ${event.status} ${event.completed ?? ""}/${event.total ?? ""}`);
          }
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },
      setSelectedModel: ({ model }) => {
        getDb().query("UPDATE settings SET value = ? WHERE key = 'selected_model'").run(model);
      },
      getSelectedModel: () => {
        const row = getDb().query("SELECT value FROM settings WHERE key = 'selected_model'").get() as { value: string } | null;
        return row?.value ?? "";
      },
      getEnrichmentAnswers: ({ profileId }) => {
        const rows = getDb().query(
          "SELECT question, answer, category FROM enrichment_answers WHERE profile_id = ? ORDER BY id"
        ).all(profileId) as { question: string; answer: string; category: string }[];
        return rows;
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
          const model = (getDb().query("SELECT value FROM settings WHERE key = 'selected_model'").get() as { value: string }).value;
          if (!model) throw new Error("No Ollama model selected");

          rpc.send.pipelineUpdate({ type: "enrichment:generating", payload: null });
          console.log(`[enrichment] Generating questions using model: "${model}"`);
          const t = performance.now();
          const questions = await generateQuestions(getDb(), profile, ollama, model);
          console.log(`[enrichment] Questions generated (${((performance.now() - t) / 1000).toFixed(1)}s)`);
          rpc.send.pipelineUpdate({ type: "enrichment:questions", payload: { questions } });
        } catch (err: any) {
          console.error(`[enrichment] Question generation failed:`, err.message);
          rpc.send.pipelineUpdate({ type: "enrichment:error", payload: { message: err.message ?? "Failed to generate questions" } });
        }
      },
      processEnrichmentAnswers: async ({ profileId, answers }) => {
        try {
          const model = (getDb().query("SELECT value FROM settings WHERE key = 'selected_model'").get() as { value: string }).value;
          if (!model) throw new Error("No Ollama model selected");

          rpc.send.pipelineUpdate({ type: "enrichment:extracting", payload: null });
          console.log(`[enrichment] Extracting structured data from ${answers.length} answers`);
          const t = performance.now();
          const updated = await submitEnrichmentAnswers(getDb(), profileId, answers, ollama, model);
          console.log(`[enrichment] Extraction + merge done (${((performance.now() - t) / 1000).toFixed(1)}s)`);
          rpc.send.pipelineUpdate({ type: "enrichment:complete", payload: { profile: updated } });
        } catch (err: any) {
          rpc.send.pipelineUpdate({ type: "enrichment:error", payload: { message: err.message ?? "Failed to process answers" } });
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
          const model = (
            getDb().query("SELECT value FROM settings WHERE key = 'selected_model'").get() as { value: string }
          ).value;
          if (!model) throw new Error("No Ollama model selected. Go to setup and choose a model.");
          console.log(`[resume] Using model: "${model}"`);
          const parsed = await parseResume(resumeText, ollama, model);
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
  closeDb();
}

process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });
process.on("beforeExit", shutdown);
process.on("exit", shutdown);
