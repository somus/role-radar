import { useState, useCallback } from "react";
import { electrobun } from "./electrobun";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="max-w-6xl mx-auto py-12 px-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Role Radar</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEditProfile}>
              Edit Profile
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Roles</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {profile.roles.map((r) => (
                  <Badge key={r} variant="secondary">{r}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Seniority</p>
                <p className="font-medium">{profile.seniority}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Experience</p>
                <p className="font-medium">{profile.experience_years} years</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Primary Skills</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {profile.skills_primary.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>

            {profile.domains.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">Domains</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {profile.domains.map((d) => (
                    <Badge key={d} variant="outline">{d}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <JobSearch
          profileId={profile.id}
          autoStartSearch={autoStartSearch}
          onAutoStartConsumed={onAutoStartConsumed}
          onSearchComplete={handleSearchComplete}
        />

        <JobFeed profileId={profile.id} refreshKey={feedRefresh} hasSearched={hasSearched} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onEnrichment}>
            <CardHeader>
              <CardTitle className="text-sm">Enrichment Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {profile.career_intent
                  ? "Re-answer follow-up questions to update scoring."
                  : "Answer follow-up questions to improve scoring accuracy."}
              </p>
              <Badge variant={profile.career_intent ? "secondary" : "default"} className="mt-3 text-xs">
                {profile.career_intent ? "Completed" : "Start"}
              </Badge>
            </CardContent>
          </Card>
          <PlaceholderCard title="Fit Scoring" description="AI-powered scoring of how well jobs match your profile." />
          <PlaceholderCard title="Resume Generation" description="Generate tailored resumes for specific job listings." />
        </div>
      </div>
    </div>
  );
}

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="opacity-50">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
        <Badge variant="outline" className="mt-3 text-xs">Coming Soon</Badge>
      </CardContent>
    </Card>
  );
}
