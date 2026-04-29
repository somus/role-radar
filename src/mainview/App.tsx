import { useEffect, useState } from "react";
import { electrobun } from "./electrobun";
import { SetupWizard } from "./SetupWizard";
import { ResumeUpload } from "./ResumeUpload";
import { ProfileReview } from "./ProfileReview";
import { Dashboard } from "./Dashboard";
import type { Profile } from "../shared/types";

type AppState = "loading" | "setup" | "upload" | "review" | "dashboard" | "error";

export function App() {
  const [state, setState] = useState<AppState>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const health = await electrobun.rpc.request.getHealth();
        const savedModel = await electrobun.rpc.request.getSelectedModel();

        if (!health.ollama || !savedModel) {
          setState("setup");
          return;
        }

        const existingProfile = await electrobun.rpc.request.getProfile();
        if (existingProfile) {
          setProfile(existingProfile);
          const text = await electrobun.rpc.request.getResumeText();
          setResumeText(text ?? "");
          setState("dashboard");
        } else {
          setState("upload");
        }
      } catch (e: any) {
        setError(e.message ?? "Failed to initialize app");
        setState("error");
      }
    }
    init();
  }, []);

  if (state === "error") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <p className="text-sm text-muted-foreground">Please restart the app.</p>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  if (state === "setup") {
    return (
      <SetupWizard
        onComplete={async () => {
          try {
            const existingProfile = await electrobun.rpc.request.getProfile();
            if (existingProfile) {
              setProfile(existingProfile);
              const text = await electrobun.rpc.request.getResumeText();
              setResumeText(text ?? "");
              setState("dashboard");
            } else {
              setState("upload");
            }
          } catch (e: any) {
            setError(e.message ?? "Failed to load profile after setup");
            setState("error");
          }
        }}
      />
    );
  }

  if (state === "upload") {
    return (
      <ResumeUpload
        onComplete={(p, text) => {
          if (!p) return;
          setProfile(p);
          setResumeText(text);
          setState("review");
        }}
      />
    );
  }

  if (state === "review" && !profile) {
    setError("Profile data was lost. Please upload your resume again.");
    setState("error");
    return null;
  }

  if (state === "review" && profile) {
    return (
      <ProfileReview
        profile={profile}
        resumeText={resumeText}
        onSave={(updated) => {
          setProfile(updated);
          setState("dashboard");
        }}
      />
    );
  }

  if (state === "dashboard" && !profile) {
    setError("Profile data was lost. Please upload your resume again.");
    setState("error");
    return null;
  }

  if (state === "dashboard" && profile) {
    return (
      <Dashboard
        profile={profile}
        onEditProfile={async () => {
          try {
            const text = await electrobun.rpc.request.getResumeText();
            setResumeText(text ?? "");
            setState("review");
          } catch (e: any) {
            setError(e.message ?? "Failed to load resume text");
            setState("error");
          }
        }}
        onReset={() => {
          setProfile(null);
          setResumeText("");
          setState("upload");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-muted-foreground">Unexpected state. Please restart.</p>
    </div>
  );
}
