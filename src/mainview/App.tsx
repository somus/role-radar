import { useEffect, useState } from "react";
import { electrobun } from "./electrobun";

type HealthStatus = {
  ollama: boolean;
  db: boolean;
};

export function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const result = await electrobun.rpc.request.getHealth();
        setHealth(result);
      } catch (err: any) {
        setError(err.message ?? "Failed to connect to main process");
      }
    }
    checkHealth();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Role Radar</h1>
        <p className="text-zinc-400 text-lg">
          Job Discovery + Fit Scoring + Resume Generator
        </p>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-200">
            {error}
          </div>
        )}

        {health && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-center gap-2">
              <span className={health.db ? "text-green-400" : "text-red-400"}>
                {health.db ? "✓" : "✗"}
              </span>
              <span>Database</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className={health.ollama ? "text-green-400" : "text-yellow-400"}>
                {health.ollama ? "✓" : "○"}
              </span>
              <span>Ollama {health.ollama ? "connected" : "not configured"}</span>
            </div>
          </div>
        )}

        {!health && !error && (
          <p className="text-zinc-500 animate-pulse">Connecting...</p>
        )}
      </div>
    </div>
  );
}
