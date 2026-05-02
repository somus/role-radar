# Role Radar — Domain Language

## Ubiquitous Language

### Profile
The structured representation of a user's professional identity, extracted from their resume by an LLM and enriched by user answers to follow-up questions. Contains: target roles, primary/secondary skills, experience years, seniority level, domains, preferences, career intent, dealbreakers, and problem-solving stories. Updatable via PDF re-upload or direct form editing — changes trigger re-scoring of all existing jobs.

### Role
A job title the user targets (e.g., "Backend Engineer", "Staff SRE"). Extracted from resume. Used to generate search queries and to score fit.

### Domain
An industry or vertical the user has worked in (e.g., "Fintech", "Healthcare", "AdTech"). Distinct from Role — a Role is what you do, a Domain is where you do it.

### Preferences
Explicit user constraints for job filtering: target locations, remote/hybrid/onsite preference, optional minimum salary, optional company size preferences. Derived from resume context or user input.

### Seniority
A single overall career level (e.g., "Senior", "Staff", "Mid"). Not per-skill — represents the user's general professional standing.

### Job
A position discovered from a job source. Progresses through a lifecycle: discovered → queued → fetching → scoring → ready (or failed).

### Heuristic Score
An internal-only prioritization signal computed from list-level data (title, location, recency). Used to select which jobs get expensive LLM scoring. Never shown to the user.

### Fit Score
A weighted composite of four dimension scores (skills, seniority, domain, location), ranging 0–100. The only score visible to the user. Requires full job description + LLM analysis. Calibration rubric: 90+ = near-perfect match, 70–89 = strong with minor gaps, 50–69 = possible with growth, <50 = poor fit.

### Dimension Scores
The four axes that compose a Fit Score: skills match, seniority match, domain relevance, location fit. Scored individually by the LLM, weighted into a composite. Internal structure — user sees the composite plus matches/gaps breakdown.

### Overqualified
A flag set when the user's seniority significantly exceeds the job's level. Distinct from a low Fit Score — the job may match on skills/domain but represent a step down. Surfaced alongside gaps in the UI.

### Job Source Adapter
A module that implements search and detail-fetch for a specific job platform (e.g., LinkedIn). Allows swapping or adding sources without changing core logic.

### Detail Fetch
The act of retrieving a job's full description from its source page. Required before LLM scoring can occur. Network-bound, parallelizable (concurrency ~5).

### Scoring Pipeline
The sequence: detail fetch → LLM analysis → Fit Score generation. LLM scoring is compute-bound and runs sequentially (concurrency 1) due to local model constraints.

### JSON Repair
The recovery strategy when LLM output is malformed: Gemini structured output mode constrains output via responseJsonSchema, Zod validates structure, failed attempts retry up to 3 times with error context injected into the prompt.

### Match
A structured object representing a skill/experience alignment between Profile and Job: `{skill, type: exact|inferred|partial, context}`. Used in scoring output, UI display, and resume generation.

### Gap
A structured object representing a missing skill/experience: `{skill, type: exact|inferred|partial, context}`. Helps user understand what's lacking and guides resume tailoring.

### Tailored Resume
A rewrite of the user's existing resume bullets to emphasize skills matching a specific Job. Does not fabricate experience — adjusts framing and emphasis. Generated via LLM, rendered as PDF via @react-pdf/renderer.

### Background Refresh
Daily automatic re-query of job sources to discover new postings. Dedup prevents re-scoring existing jobs. New discoveries get a "New" badge in the feed.

### LLM Reasoning
The full prompt + response stored for each scoring call. Enables "View reasoning" UI for score transparency and debugging.

### Profile Enrichment Questions
Five LLM-generated questions tailored to the parsed resume, presented after profile review and before pipeline starts. Cover three categories: career intent + dealbreakers (what they want next, hard no's), problem-solving stories (concrete examples from past roles referenced in resume), and technical depth (probing beyond bullet points). Free-text answers with guided prompts. LLM extracts structured data from answers to enrich the Profile. Answers feed into both scoring and resume generation. Re-answerable anytime from the profile page — changes trigger full pipeline re-run.

### Dealbreaker
A hard constraint from profile enrichment (e.g., "no onsite", "no startups", "minimum $X salary"). When a job violates a dealbreaker, it should be flagged or filtered regardless of Fit Score.

### Setup Wizard
The first-run experience that prompts for a Gemini API key, validates it, and stores it encrypted in SQLite. Shown on first launch or when no valid API key is configured.

### Selector Config
JSON-configurable CSS selectors used by the LinkedIn Adapter to parse HTML. Not hardcoded — stored as configuration so selector fixes can ship via app updates without code changes. Parsed output is validated; missing critical fields result in `parse_failed` status.
