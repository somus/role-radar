import { useState } from "react";
import { electrobun } from "./electrobun";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingProgress } from "./OnboardingProgress";

type Step = "enter-key" | "validating" | "ready";

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("enter-key");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!apiKey.trim()) return;
    setStep("validating");
    setError(null);

    const result = await electrobun.rpc.request.setApiKey({ key: apiKey.trim() });
    if (result.valid) {
      setStep("ready");
    } else {
      setError("Invalid API key. Check the key and try again.");
      setStep("enter-key");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-10">
        <OnboardingProgress current="api" />

        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Local setup</p>
          <h1 className="text-3xl font-semibold tracking-tight">Connect Gemini to start scoring roles</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Role Radar keeps your profile and job feed local. The API key is only used for resume parsing, enrichment, and fit scoring.
          </p>
        </div>

        {step === "enter-key" && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Gemini API Key</CardTitle>
              <CardDescription>
                Get a free key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Google AI Studio
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="AIza..."
                />
              </div>

              {error && (
                <div className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Next: upload your resume, verify the extracted scoring profile, then run your first search.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleSubmit}
                disabled={!apiKey.trim()}
                className="w-full"
                size="lg"
              >
                Connect
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === "validating" && (
          <Card className="max-w-xl">
            <CardContent className="py-8 text-center">
              <p className="text-sm font-medium">Validating API key</p>
              <p className="mt-1 text-xs text-muted-foreground animate-pulse">Checking Gemini access before resume parsing starts…</p>
            </CardContent>
          </Card>
        )}

        {step === "ready" && (
          <Card className="max-w-xl">
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-primary text-3xl" aria-hidden="true">✓</p>
              <CardTitle>Ready to go</CardTitle>
              <p className="text-muted-foreground text-xs">
                Gemini is connected. Resume upload is next.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button onClick={onComplete} className="w-full" size="lg">
                Get Started
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => {
                  setApiKey("");
                  setError(null);
                  setStep("enter-key");
                }}
              >
                Use a different key
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
