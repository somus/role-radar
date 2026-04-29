export type MainRPCSchema = {
  requests: {
    getHealth: () => { ollama: boolean; db: boolean };
    getProfile: () => Profile | null;
    runMigrations: () => { applied: number };
  };
  messages: {
    log: { level: string; msg: string };
  };
};

export type WebviewRPCSchema = {
  requests: {};
  messages: {
    pipelineUpdate: { type: string; payload: unknown };
  };
};

export type Profile = {
  id: number;
  roles: string[];
  skills_primary: string[];
  skills_secondary: string[];
  experience_years: number;
  seniority: string;
  domains: string[];
  preferences: ProfilePreferences;
  career_intent: string | null;
  dealbreakers: string[];
  problem_solving_stories: string[];
  technical_depth: string[];
  created_at: string;
  updated_at: string;
};

export type ProfilePreferences = {
  locations: string[];
  remote: boolean;
  min_salary: number | null;
  company_sizes: string[];
};
