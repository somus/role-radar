import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { MainRPCSchema, WebviewRPCSchema } from "../shared/types";
import { getDb, runMigrations, closeDb } from "./db";
import { OllamaClient } from "./ollama-client";

const migrationResult = runMigrations();
console.log(`Migrations applied: ${migrationResult.applied}`);

const ollama = new OllamaClient();

const rpc = BrowserView.defineRPC<MainRPCSchema, WebviewRPCSchema>({
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
        return null;
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
        } catch {
          return [];
        }
      },
      pullOllamaModel: async ({ name }) => {
        try {
          for await (const event of ollama.pullModel(name)) {
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
    },
    messages: {
      "*": (messageName, payload) => {
        console.log(`[webview] ${messageName}:`, payload);
      },
      log: ({ level, msg }) => {
        console.log(`[webview:${level}] ${msg}`);
      },
    },
  },
});

const win = new BrowserWindow({
  title: "Role Radar",
  url: "views://mainview/index.html",
  frame: {
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
  },
  rpc,
});

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});
