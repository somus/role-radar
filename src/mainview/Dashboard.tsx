import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { Brain, CheckCircle2, KeyRound, RotateCcw, Search, UserRound } from "lucide-react";
import { electrobun } from "./electrobun";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobSearch } from "./JobSearch";
import { JobFeed } from "./JobFeed";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Profile } from "../shared/types";

type Props = {
  profile: Profile;
  autoStartSearch?: boolean;
  onAutoStartConsumed?: () => void;
  onEditProfile: () => void;
  onEnrichment: () => void;
  onReset: () => void;
};

export function Dashboard({ profile, autoStartSearch, onAutoStartConsumed, onEditProfile, onEnrichment, onReset }: Props) {
  const [resetError, setResetError] = useState<string | null>(null);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const handleSearchComplete = useCallback(() => {
    setHasSearched(true);
    setFeedRefresh(k => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1480px] px-5 py-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Role Radar</p>
            <h1 className="text-xl font-semibold tracking-tight">
              {hasSearched ? "Ranked job discovery" : "Start discovery"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onEnrichment}>
              <Brain className="size-3.5" />
              Update Context
            </Button>
            <Button variant="outline" size="sm" onClick={onEditProfile}>
              <UserRound className="size-3.5" />
              Edit Profile
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset everything?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete your profile and all extracted data. You'll need to upload your resume again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {resetError && (
                  <p className="text-sm text-destructive">{resetError}</p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setResetError(null)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                    setResetError(null);
                    try {
                      await electrobun.rpc.request.resetProfile();
                      onReset();
                    } catch (e: any) {
                      setResetError(e.message ?? "Reset failed");
                    }
                  }}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>

        <SystemStatusStrip profile={profile} hasSearched={hasSearched} />

        <div className="mt-4 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <ProfileSummaryPanel profile={profile} onEditProfile={onEditProfile} onEnrichment={onEnrichment} />
            <JobSearch
              profileId={profile.id}
              autoStartSearch={autoStartSearch}
              onAutoStartConsumed={onAutoStartConsumed}
              onSearchComplete={handleSearchComplete}
            />
          </aside>

          <main className="min-w-0">
            <JobFeed profileId={profile.id} refreshKey={feedRefresh} hasSearched={hasSearched} />
          </main>
        </div>
      </div>
    </div>
  );
}

function SystemStatusStrip({ profile, hasSearched }: { profile: Profile; hasSearched: boolean }) {
  const enriched = Boolean(profile.career_intent || profile.dealbreakers.length > 0 || profile.problem_solving_stories.length > 0);

  return (
    <section className="mt-3 grid gap-2 md:grid-cols-4" aria-label="System status" aria-live="polite">
      <StatusItem icon={<KeyRound className="size-3.5" />} label="AI key" value="Connected" />
      <StatusItem icon={<UserRound className="size-3.5" />} label="Profile" value={`${profile.roles.length} roles, ${profile.skills_primary.length} skills`} />
      <StatusItem icon={<Brain className="size-3.5" />} label="Context" value={enriched ? "Enriched" : "Needs answers"} tone={enriched ? "ok" : "warn"} />
      <StatusItem icon={<Search className="size-3.5" />} label="Search" value={hasSearched ? "Feed active" : "Ready to run"} tone={hasSearched ? "ok" : "neutral"} />
    </section>
  );
}

function StatusItem({
  icon,
  label,
  value,
  tone = "ok",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  return (
    <div className="flex items-center gap-2 border border-border bg-card px-3 py-2">
      <span className={tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "neutral" ? "text-muted-foreground" : "text-primary"}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}

function ProfileSummaryPanel({
  profile,
  onEditProfile,
  onEnrichment,
}: {
  profile: Profile;
  onEditProfile: () => void;
  onEnrichment: () => void;
}) {
  return (
    <section className="border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Scoring profile</p>
          <h2 className="mt-1 text-base font-semibold">{profile.seniority} candidate</h2>
          <p className="text-xs text-muted-foreground">{profile.experience_years} years experience</p>
        </div>
        <CheckCircle2 className="size-4 text-primary" />
      </div>

      <div className="mt-4 space-y-4">
        <TokenGroup label="Target roles" values={profile.roles} variant="secondary" />
        <TokenGroup label="Primary skills" values={profile.skills_primary.slice(0, 10)} />
        {profile.domains.length > 0 && <TokenGroup label="Domains" values={profile.domains} variant="outline" />}
        {profile.dealbreakers.length > 0 && <TokenGroup label="Dealbreakers" values={profile.dealbreakers} variant="destructive" />}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={onEditProfile}>Edit profile</Button>
        <Button variant="secondary" size="sm" onClick={onEnrichment}>
          {profile.career_intent ? "Update context" : "Add context"}
        </Button>
      </div>
    </section>
  );
}

function TokenGroup({
  label,
  values,
  variant = "default",
}: {
  label: string;
  values: string[];
  variant?: "default" | "secondary" | "outline" | "destructive";
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.length > 0
          ? values.map((value) => <Badge key={value} variant={variant} className="max-w-full truncate">{value}</Badge>)
          : <span className="text-xs text-muted-foreground">None set</span>}
      </div>
    </div>
  );
}
