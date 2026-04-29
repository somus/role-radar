import { useEffect, useState } from "react";
import { electrobun } from "./electrobun";
import { SetupWizard } from "./SetupWizard";

type AppState = "loading" | "setup" | "main";

export function App() {
  const [state, setState] = useState<AppState>("loading");
  const [modelName, setModelName] = useState("");

  useEffect(() => {
    async function init() {
      const health = await electrobun.rpc.request.getHealth();
      const savedModel = await electrobun.rpc.request.getSelectedModel();

      if (health.ollama && savedModel) {
        setModelName(savedModel);
        setState("main");
      } else {
        setState("setup");
      }
    }
    init();
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-zinc-500 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (state === "setup") {
    return (
      <SetupWizard
        onComplete={async () => {
          const model = await electrobun.rpc.request.getSelectedModel();
          setModelName(model);
          setState("main");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Role Radar</h1>
        <p className="text-zinc-400 text-lg">
          Job Discovery + Fit Scoring + Resume Generator
        </p>
        <div className="space-y-2 text-sm text-zinc-400">
          <p>Model: <span className="text-zinc-200 font-medium">{modelName}</span></p>
          <p className="text-green-400">Ready — upload your resume to begin</p>
        </div>
      </div>
    </div>
  );
}
