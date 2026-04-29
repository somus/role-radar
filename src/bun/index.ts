import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { MainRPCSchema, WebviewRPCSchema } from "../shared/types";
import { getDb, runMigrations, closeDb } from "./db";

const migrationResult = runMigrations();
console.log(`Migrations applied: ${migrationResult.applied}`);

const rpc = BrowserView.defineRPC<MainRPCSchema, WebviewRPCSchema>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      getHealth: () => {
        try {
          getDb().query("SELECT 1").get();
          return { ollama: false, db: true };
        } catch {
          return { ollama: false, db: false };
        }
      },
      getProfile: () => {
        return null;
      },
      runMigrations: () => {
        return runMigrations();
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
