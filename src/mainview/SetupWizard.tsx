import { useState } from "react";
import { electrobun } from "./electrobun";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Role Radar Setup</h1>
          <p className="text-muted-foreground mt-1 text-xs">Connect your AI engine</p>
        </div>

        {step === "enter-key" && (
          <Card>
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
                <p className="text-destructive text-xs">{error}</p>
              )}
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
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground animate-pulse text-xs">Validating API key...</p>
            </CardContent>
          </Card>
        )}

        {step === "ready" && (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-primary text-3xl">✓</p>
              <CardTitle>Ready to go</CardTitle>
              <p className="text-muted-foreground text-xs">
                Using <span className="text-foreground font-medium">Gemini 2.5 Flash</span>
              </p>
            </CardContent>
            <CardFooter>
              <Button onClick={onComplete} className="w-full" size="lg">
                Get Started
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
