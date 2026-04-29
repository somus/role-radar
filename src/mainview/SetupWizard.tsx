import { useEffect, useState } from "react";
import { electrobun } from "./electrobun";
import type { OllamaModelInfo } from "../shared/types";

type Step = "checking" | "install-ollama" | "select-model" | "pulling" | "ready";

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("checking");
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [pullError, setPullError] = useState<string | null>(null);

  useEffect(() => {
    checkOllama();
  }, []);

  async function checkOllama() {
    setStep("checking");
    const healthy = await electrobun.rpc.request.checkOllama();
    if (!healthy) {
      setStep("install-ollama");
      return;
    }
    await loadModels();
  }

  async function loadModels() {
    const list = await electrobun.rpc.request.listOllamaModels();
    setModels(list);
    const saved = await electrobun.rpc.request.getSelectedModel();
    if (saved && list.some((m) => m.name === saved)) {
      setSelectedModel(saved);
      setStep("ready");
    } else if (list.length > 0) {
      setSelectedModel(list[0]!.name);
      setStep("select-model");
    } else {
      setStep("select-model");
    }
  }

  async function handlePull(name: string) {
    setStep("pulling");
    setPullError(null);
    const result = await electrobun.rpc.request.pullOllamaModel({ name });
    if (result.success) {
      await loadModels();
    } else {
      setPullError(result.error ?? "Pull failed");
      setStep("select-model");
    }
  }

  async function handleConfirm() {
    if (selectedModel) {
      await electrobun.rpc.request.setSelectedModel({ model: selectedModel });
      setStep("ready");
      onComplete();
    }
  }

  function formatSize(bytes: number) {
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Role Radar Setup</h1>
          <p className="text-zinc-400 mt-2">Let's get your AI engine ready</p>
        </div>

        {step === "checking" && (
          <div className="text-center">
            <p className="text-zinc-400 animate-pulse">Checking Ollama...</p>
          </div>
        )}

        {step === "install-ollama" && (
          <div className="space-y-4">
            <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-4">
              <h2 className="font-semibold text-yellow-200">Ollama not detected</h2>
              <p className="text-yellow-300/80 text-sm mt-2">
                Role Radar uses Ollama to run AI models locally on your machine.
                Install it to continue.
              </p>
            </div>
            <div className="space-y-3">
              <a
                href="https://ollama.com/download"
                target="_blank"
                className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 rounded-lg py-3 px-4 font-medium transition-colors"
              >
                Download Ollama
              </a>
              <p className="text-zinc-500 text-sm text-center">
                After installing, start Ollama and click retry below.
              </p>
              <button
                onClick={checkOllama}
                className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-3 px-4 font-medium transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        )}

        {step === "select-model" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">Select an AI Model</h2>

            {pullError && (
              <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-red-200 text-sm">
                {pullError}
              </div>
            )}

            {models.length > 0 ? (
              <div className="space-y-2">
                {models.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => setSelectedModel(m.name)}
                    className={`w-full text-left rounded-lg p-3 border transition-colors ${
                      selectedModel === m.name
                        ? "border-blue-500 bg-blue-950/50"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="text-zinc-500 text-sm ml-2">
                      {m.parameterSize} · {formatSize(m.size)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-zinc-400 text-sm">
                  No models installed. Pull a recommended model:
                </p>
                <button
                  onClick={() => handlePull("qwen2.5:7b")}
                  className="w-full text-left rounded-lg p-3 border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors"
                >
                  <span className="font-medium">qwen2.5:7b</span>
                  <span className="text-zinc-500 text-sm ml-2">Recommended · ~4.7 GB</span>
                </button>
                <button
                  onClick={() => handlePull("llama3.1:8b")}
                  className="w-full text-left rounded-lg p-3 border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors"
                >
                  <span className="font-medium">llama3.1:8b</span>
                  <span className="text-zinc-500 text-sm ml-2">Alternative · ~4.9 GB</span>
                </button>
              </div>
            )}

            {models.length > 0 && (
              <button
                onClick={handleConfirm}
                disabled={!selectedModel}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-3 px-4 font-medium transition-colors"
              >
                Continue with {selectedModel}
              </button>
            )}
          </div>
        )}

        {step === "pulling" && (
          <div className="text-center space-y-4">
            <div className="animate-pulse">
              <p className="text-zinc-300">Pulling model...</p>
              <p className="text-zinc-500 text-sm mt-1">This may take a few minutes</p>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse w-1/2" />
            </div>
          </div>
        )}

        {step === "ready" && (
          <div className="text-center space-y-4">
            <div className="text-green-400 text-5xl">✓</div>
            <h2 className="font-semibold text-lg">Ready to go</h2>
            <p className="text-zinc-400 text-sm">
              Using <span className="text-zinc-200 font-medium">{selectedModel}</span>
            </p>
            <button
              onClick={onComplete}
              className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-3 px-4 font-medium transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        <div className="flex justify-center gap-2 pt-4">
          {["checking", "install-ollama", "select-model", "pulling", "ready"].map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${
                s === step ? "bg-blue-500" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
