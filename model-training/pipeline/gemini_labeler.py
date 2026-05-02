"""Gemini 2.5 Flash teacher labeling for profile-job pairs.

Labels ~5K pairs with 4-dimension scores using batch-10 requests.

Usage: GEMINI_API_KEY=... python3 gemini_labeler.py
"""

import json
import os
import sys
import time
import random
from pathlib import Path
from functools import partial

import builtins
print = partial(builtins.print, flush=True)

from config import DATA_DIR, score_domain_static

PAIRS_PATH = DATA_DIR / "phase3_pairs.json"
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
BENCHMARKS_PATH = DATA_DIR / "benchmarks.json"
OUTPUT_PATH = DATA_DIR / "phase3_labels.json"
PHASE2_LABELS_PATH = DATA_DIR / "phase2_labels.json"

GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
BATCH_SIZE = 10
MAX_RETRIES = 5
RETRY_DELAY_S = 8

SCORING_PROMPT = """<role>You are an optimistic job fit scorer for a job discovery app. Users should feel encouraged, not rejected.</role>

<task>Score each candidate-job pair on 2 dimensions (skills and domain) using a 50-100 scale. Seniority and location are scored separately — you only need to judge skills and domain. Return a JSON array.</task>

<philosophy>
- Score from the JOB's perspective: what % of this job's requirements does the profile satisfy?
- Extra skills the profile has beyond job requirements are IRRELEVANT — never penalize
- Be optimistic: a decent match should feel good (80+), only obvious mismatches score low (55-65)
- Adjacent/transferable skills get generous partial credit (0.7 match value)
- Use the FULL 50-100 range — don't cluster everything in 70-90
</philosophy>

<dimensions>
<skills description="Most important — drives 50% of composite">
  <scoring>
    <range min="95" max="100">Profile has all or nearly all of job's top 6 required skills</range>
    <range min="88" max="95">Profile has 80%+ of top skills</range>
    <range min="78" max="88">Profile has 60-80% of top skills</range>
    <range min="68" max="78">Profile has 40-60% of top skills</range>
    <range min="50" max="55">Completely different discipline (HR × coding, Sales × Engineering)</range>
  </scoring>
  <rule>Skill ordering matters: first 3 listed in job = core (weight 1.0), next 3 = important (0.7), rest = nice-to-have (0.3)</rule>
  <rule>Adjacent skills count as 0.7 match — see skill_adjacency_map below</rule>
  <rule>Same language different specialization (Python-ML × Python-backend) = 70-80</rule>
  <rule>IMPORTANT: React dev × Angular job (or vice versa) = 82-90 skills, NOT 55-65. Frontend frameworks are highly transferable.</rule>
</skills>

<domain description="Least important — easy to switch domains, drives only 10% of composite">
  <scoring>
    <range min="90" max="100">Exact domain match</range>
    <range min="72" max="85">Adjacent domain</range>
    <range min="60" max="72">No match but both tech companies</range>
    <range min="55" max="65">Different industry entirely</range>
    <range min="50" max="55">Dealbreaker domain violated</range>
  </scoring>
</domain>
</dimensions>

<skill_adjacency_map>
Engineering:
- Frontend frameworks: React ↔ Vue ↔ Angular ↔ Svelte ↔ Next.js ↔ Nuxt.js
- Python web: Django ↔ Flask ↔ FastAPI ↔ Celery
- Java ecosystem: Java ↔ Kotlin ↔ Scala ↔ Spring Boot ↔ Micronaut
- JS backend: Node.js ↔ Express ↔ Nest.js ↔ Deno
- Languages: TypeScript ↔ JavaScript, Go ↔ Rust, Python ↔ Ruby
- Cloud: AWS ↔ GCP ↔ Azure
- Containers: Docker ↔ Kubernetes ↔ Docker Swarm
- Databases (relational): PostgreSQL ↔ MySQL ↔ MariaDB ↔ SQL Server
- Databases (NoSQL): MongoDB ↔ DynamoDB ↔ CouchDB
- Queues: Kafka ↔ RabbitMQ ↔ SQS ↔ Redis Streams ↔ Pulsar
- IaC: Terraform ↔ Pulumi ↔ CloudFormation ↔ Ansible
- CI/CD: Jenkins ↔ GitHub Actions ↔ GitLab CI ↔ CircleCI ↔ ArgoCD
- Monitoring: Prometheus ↔ Grafana ↔ Datadog ↔ New Relic ↔ PagerDuty
- Data processing: Spark ↔ Flink ↔ Beam
- Data orchestration: Airflow ↔ Prefect ↔ Dagster
- Mobile iOS: Swift ↔ SwiftUI ↔ UIKit ↔ Objective-C
- Mobile Android: Kotlin ↔ Jetpack Compose ↔ Java Android
- Cross-platform: React Native ↔ Flutter
- CSS: Tailwind ↔ SCSS ↔ CSS-in-JS ↔ Styled Components
- Testing: Jest ↔ Mocha ↔ Playwright ↔ Cypress ↔ Selenium

Data & Analytics:
- BI: Tableau ↔ Power BI ↔ Looker ↔ Metabase ↔ Qlik
- Warehouses: Snowflake ↔ BigQuery ↔ Redshift ↔ Databricks
- ETL: dbt ↔ Fivetran ↔ Stitch ↔ Airbyte
- ML: TensorFlow ↔ PyTorch ↔ scikit-learn ↔ XGBoost
- Analytics: Amplitude ↔ Mixpanel ↔ Google Analytics ↔ Heap

Product & Project:
- PM tools: Jira ↔ Linear ↔ Asana ↔ Monday ↔ Trello
- Docs: Confluence ↔ Notion ↔ Google Docs
- Design: Figma ↔ Sketch ↔ Adobe XD ↔ InVision
- Methods: Agile ↔ Scrum ↔ Kanban ↔ SAFe ↔ Lean

Sales & BD:
- CRM: Salesforce ↔ HubSpot ↔ Pipedrive ↔ Zoho CRM ↔ Freshsales
- Outreach: Outreach ↔ SalesLoft ↔ Apollo ↔ ZoomInfo
- Skills: B2B Sales ↔ Enterprise Sales ↔ Account Management ↔ Solution Selling

Marketing:
- Ads: Google Ads ↔ Meta Ads ↔ LinkedIn Ads
- Email: Mailchimp ↔ SendGrid ↔ Klaviyo ↔ HubSpot Email
- SEO: Ahrefs ↔ SEMrush ↔ Moz
- Skills: Content Marketing ↔ Content Strategy ↔ Copywriting
- Skills: Performance Marketing ↔ Growth Marketing ↔ Demand Gen

HR & Recruiting:
- ATS: Greenhouse ↔ Lever ↔ Workable ↔ iCIMS ↔ Ashby
- HRIS: Workday ↔ BambooHR ↔ SAP SuccessFactors ↔ Darwinbox ↔ Keka
- Skills: Talent Acquisition ↔ Recruiting ↔ Sourcing
- Skills: Compensation ↔ Total Rewards ↔ Benefits
- Skills: Employee Relations ↔ People Ops ↔ HR Business Partner

Finance:
- ERP: SAP ↔ Oracle ↔ NetSuite ↔ Tally
- Skills: Financial Modeling ↔ FP&A ↔ Budgeting ↔ Forecasting
- Skills: Accounting ↔ Bookkeeping ↔ GL Management

Operations & Supply Chain:
- ERP: SAP ↔ Oracle ↔ NetSuite ↔ Dynamics 365
- Methods: Lean ↔ Six Sigma ↔ Kaizen ↔ TQM
- Skills: Process Optimization ↔ Business Process Improvement
- Skills: Supply Chain ↔ Logistics ↔ Distribution ↔ Warehousing
- Skills: Vendor Management ↔ Procurement ↔ Supplier Relations

Customer Success:
- Tools: Gainsight ↔ ChurnZero ↔ Totango
- Support: Zendesk ↔ Freshdesk ↔ Intercom ↔ ServiceNow
- Skills: Customer Onboarding ↔ Implementation ↔ Client Services
- Skills: Churn Analysis ↔ Retention ↔ Customer Health
</skill_adjacency_map>

<role_adjacency_map>
Engineering:
- Backend Engineer ↔ Fullstack Engineer ↔ API Developer ↔ Software Engineer
- Frontend Engineer ↔ UI Engineer ↔ Design Engineer ↔ Web Developer
- DevOps Engineer ↔ SRE ↔ Platform Engineer ↔ Cloud Engineer ↔ Infrastructure Engineer
- Data Engineer ↔ Analytics Engineer ↔ BI Engineer ↔ ETL Developer
- Data Scientist ↔ ML Engineer ↔ AI Engineer ↔ Research Engineer
- QA Engineer ↔ SDET ↔ Test Engineer

Product/Design:
- Product Manager ↔ Program Manager ↔ Product Owner ↔ TPM
- UX Designer ↔ Product Designer ↔ UI Designer

Business:
- Sales Manager ↔ Account Manager ↔ Business Development ↔ Account Executive
- Marketing Manager ↔ Growth Manager ↔ Demand Gen Manager
- Content Strategist ↔ Content Manager ↔ Content Marketing Manager
- Customer Success Manager ↔ Account Manager ↔ Client Partner
- HR Manager ↔ People Partner ↔ HR Business Partner
- Recruiter ↔ Talent Acquisition ↔ Sourcer
- Finance Manager ↔ FP&A Manager ↔ Financial Analyst
- Operations Manager ↔ Business Operations ↔ Strategy & Ops
- Supply Chain Manager ↔ Logistics Manager ↔ Procurement Manager
- Project Manager ↔ Program Manager ↔ Delivery Manager

NOT adjacent (common mistakes — do not treat as transferable):
- iOS Developer ↔ Android Developer (unless profile has React Native or Flutter)
- Sales ↔ Marketing (adjacent functions but different skills)
- HR ↔ Finance (different function entirely)
- Product Manager ↔ Software Engineer (different role type)
- Customer Success ↔ Customer Support (CS is more strategic)
</role_adjacency_map>

<calibration_examples>
- Perfect skill match: Sr React dev (React/TS/GraphQL) × Frontend React job → skills=95-98, domain=75-85
- Strong match: Java backend × Java microservices job → skills=92-96, domain=70-80
- Adjacent match: React dev × Angular job → skills=82-90, domain=70-80
- Partial match: Python Data Eng × SQL Data Analyst → skills=72-80, domain=65-75
- Weak overlap: Go Backend × Vue Frontend job → skills=55-62, domain=60-70
- Total mismatch: HR Coordinator × Data Engineering job → skills=50-55, domain=55-60
- Non-tech match: Sales Manager (Salesforce/CRM) × Account Manager job → skills=85-92, domain=80-90
</calibration_examples>

<output_format>
Return a JSON array. Each object must have: pairId, skills, domain, matches (array of 2 strings), gaps (array of 1-2 strings).
DO NOT include seniority, location, composite, or overqualified — those are calculated separately.
</output_format>"""

GEMINI_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "propertyOrdering": ["pairId", "skills", "domain", "matches", "gaps"],
        "required": ["pairId", "skills", "domain", "matches", "gaps"],
        "properties": {
            "pairId": {"type": "STRING"},
            "skills": {"type": "INTEGER", "minimum": 50, "maximum": 100},
            "domain": {"type": "INTEGER", "minimum": 50, "maximum": 100},
            "matches": {"type": "ARRAY", "minItems": 1, "maxItems": 2, "items": {"type": "STRING"}},
            "gaps": {"type": "ARRAY", "minItems": 1, "maxItems": 2, "items": {"type": "STRING"}},
        },
    },
}


def build_few_shot_examples(benchmarks: dict) -> str:
    baselines = benchmarks["baselines"][:5]
    profile = benchmarks["benchmark_profile"]
    jobs = {j["id"]: j for j in benchmarks["jobs"][:5]}

    examples = []
    for b in baselines:
        job = jobs.get(b["job_id"], {})
        examples.append(
            f'Pair "{b["job_id"]}": Profile=[{profile["seniority"]}, '
            f'skills={",".join(profile["skills_primary"][:3])}, '
            f'domains={",".join(profile["domains"])}] × '
            f'Job=[{job.get("title","?")}, {job.get("location","?")}] → '
            f'skills={b["skills"]}, seniority={b["seniority"]}, '
            f'domain={b["domain"]}, location={b["location"]}, '
            f'composite={b["composite"]}, overqualified={b["overqualified"]}'
        )
    return "\n".join(examples)


def format_profile(profile: dict) -> str:
    prefs = profile.get("preferences", {})
    lines = [
        f"Roles: {', '.join(profile['roles'])}",
        f"Primary skills: {', '.join(profile['skills_primary'])}",
        f"Secondary skills: {', '.join(profile['skills_secondary'])}",
        f"Seniority: {profile['seniority']}",
        f"Experience: {profile['experience_years']} years",
        f"Domains: {', '.join(profile['domains'])}",
        f"Locations: {', '.join(prefs.get('locations', []))}",
        f"Remote: {prefs.get('remote', False)}",
    ]
    if profile.get("dealbreakers"):
        lines.append(f"Dealbreakers: {'; '.join(profile['dealbreakers'])}")
    if profile.get("career_intent"):
        lines.append(f"Career intent: {profile['career_intent']}")
    return "\n".join(lines)


def format_job(job: dict) -> str:
    desc = job.get("description", "") or ""
    if len(desc) > 1500:
        desc = desc[:1500] + "..."
    lines = [
        f"Title: {job.get('title', '?')}",
        f"Company: {job.get('company', '?')}",
        f"Location: {job.get('location', '?')}",
    ]
    if job.get("seniority_level"):
        lines.append(f"Seniority: {job['seniority_level']}")
    if job.get("industry"):
        lines.append(f"Industry: {job['industry']}")
    if desc:
        lines.append(f"Description:\n{desc}")
    return "\n".join(lines)


def build_batch_prompt(batch: list[dict], profiles_map: dict, jobs_map: dict, few_shot: str) -> str:
    parts = [SCORING_PROMPT, "", "Calibration examples:", few_shot, "", "Score these pairs:"]

    for pair in batch:
        profile = profiles_map.get(pair["profile_id"])
        job = jobs_map.get(pair["job_id"])
        if not profile or not job:
            continue
        parts.append(f'\n--- Pair "{pair["pair_id"]}" ---')
        parts.append(f"[PROFILE]\n{format_profile(profile)}")
        parts.append(f"[JOB]\n{format_job(job)}")

    return "\n".join(parts)


def call_gemini(prompt: str, api_key: str) -> list[dict] | None:
    import urllib.request

    url = f"{GEMINI_URL}/{GEMINI_MODEL}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": GEMINI_RESPONSE_SCHEMA,
        },
    }).encode()

    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})

    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())

            text = data["candidates"][0]["content"]["parts"][0]["text"]
            scores = json.loads(text)
            if isinstance(scores, list):
                return scores
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = RETRY_DELAY_S * (2 ** attempt) + random.random() * 5
                print(f"    Rate limited, waiting {wait:.0f}s...")
                time.sleep(wait)
                continue
            print(f"    Gemini HTTP {e.code}: {e.read().decode()[:200]}")
        except Exception as e:
            print(f"    Error: {e}")

        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAY_S)

    return None


SENIORITY_MAP = {"Junior": 1, "Mid": 2, "Senior": 3, "Staff": 4, "Principal": 5, "Executive": 6}
JOB_SEN_MAP = {"Entry level": 1, "Associate": 2, "Mid-Senior level": 3, "Director": 4, "Executive": 5, "Not Applicable": None}
CITY_ALIASES = {"bangalore": "bangalore", "bengaluru": "bangalore", "bangalore urban": "bangalore", "bengaluru east": "bangalore",
                "mumbai": "mumbai", "mumbai metropolitan": "mumbai", "navi mumbai": "mumbai",
                "pune": "pune", "pune division": "pune", "pune city": "pune", "pimpri": "pune",
                "hyderabad": "hyderabad", "nampally": "hyderabad",
                "chennai": "chennai",
                "delhi": "delhi", "new delhi": "delhi", "noida": "delhi", "gurgaon": "delhi", "gurugram": "delhi"}


def _infer_level(title: str) -> int | None:
    import re
    t = title.lower()
    if re.search(r"\b(intern|trainee)\b", t): return 1
    if re.search(r"\bjunior\b", t): return 1
    if re.search(r"\bassociate\b", t) and "director" not in t and "manager" not in t: return 1
    if re.search(r"\bsde\s*1\b|\bsde\s*i\b|\bengineer\s*i\b|\bsoftware\s*engineer\s*i\b", t): return 1
    if re.search(r"\bfreshers?\b|\bentry\b|\(l1\)", t): return 1
    if re.search(r"\bsenior\b|\blead\b|\bsde\s*[23]\b", t): return 3
    if re.search(r"\b(staff|principal|architect)\b", t): return 4
    if re.search(r"\b(director|vp|vice president|head of)\b", t): return 4
    if re.search(r"\bmanager\b", t): return 3
    return None


def score_seniority_static(profile: dict, job: dict) -> tuple[int, bool]:
    p_lvl = SENIORITY_MAP.get(profile["seniority"], 3)
    j_lvl = JOB_SEN_MAP.get(job.get("seniority_level"))
    if j_lvl is None:
        j_lvl = _infer_level(job.get("title", ""))
    if j_lvl is None:
        return 95, False
    delta = p_lvl - j_lvl
    scores = {0: 95, 1: 88, 2: 78, 3: 65, -1: 85, -2: 72}
    score = scores.get(delta, 58 if delta > 3 else 62)
    overqualified = delta >= 2
    return score, overqualified


def score_location_static(profile: dict, job: dict) -> int:
    prefs = profile.get("preferences", {})
    j_loc = job.get("location") or ""
    if not j_loc or j_loc == "None":
        return 83
    j_loc_lower = j_loc.lower()
    if "remote" in j_loc_lower and prefs.get("remote"):
        return 98
    j_city = None
    for alias, canonical in CITY_ALIASES.items():
        if alias in j_loc_lower:
            j_city = canonical
            break
    for pl in prefs.get("locations", []):
        p_city = None
        for alias, canonical in CITY_ALIASES.items():
            if alias in pl.lower():
                p_city = canonical
                break
        if p_city and j_city and p_city == j_city:
            return 97
    if "india" in j_loc_lower or j_city is not None:
        return 68
    return 60


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    print("Loading data...")
    with open(PAIRS_PATH) as f:
        pairs = json.load(f)
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    with open(SCRAPED_JOBS_PATH) as f:
        scraped_jobs = json.load(f)
    with open(BENCHMARKS_PATH) as f:
        benchmarks = json.load(f)

    profiles_map = {p["profile_id"]: p for p in profiles}
    jobs_map = {j["id"]: j for j in scraped_jobs}
    for j in benchmarks["jobs"]:
        jobs_map[j["id"]] = j

    few_shot = build_few_shot_examples(benchmarks)

    existing_labels = {}
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            for label in json.load(f):
                existing_labels[label["pair_id"]] = label
        print(f"Resuming: {len(existing_labels)} existing labels")

    # Seed with reusable phase2 labels
    if not existing_labels and PHASE2_LABELS_PATH.exists():
        pair_ids = {p["pair_id"] for p in pairs}
        with open(PHASE2_LABELS_PATH) as f:
            for label in json.load(f):
                if label["pair_id"] in pair_ids:
                    existing_labels[label["pair_id"]] = label
        if existing_labels:
            print(f"Seeded {len(existing_labels)} labels from phase2")

    remaining = [p for p in pairs if p["pair_id"] not in existing_labels]
    print(f"Total pairs: {len(pairs)}, remaining: {len(remaining)}")

    all_labels = list(existing_labels.values())
    success = 0
    failed = 0

    # Split remaining into batches of BATCH_SIZE
    batches = [remaining[i:i + BATCH_SIZE] for i in range(0, len(remaining), BATCH_SIZE)]
    total_batches = len(batches)

    # Process CONCURRENT_REQUESTS batches in parallel
    CONCURRENT = 10
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def process_batch(batch):
        prompt = build_batch_prompt(batch, profiles_map, jobs_map, few_shot)
        scores = call_gemini(prompt, api_key)
        results = []
        if scores:
            scores_map = {s["pairId"]: s for s in scores}
            for pair in batch:
                score = scores_map.get(pair["pair_id"])
                if score:
                    profile = profiles_map.get(pair["profile_id"])
                    job = jobs_map.get(pair["job_id"])
                    seniority, overqualified = score_seniority_static(profile, job)
                    location = score_location_static(profile, job)
                    domain = score_domain_static(profile.get("domains", []), job.get("industry", ""))
                    skills = score["skills"]
                    composite = round(skills * 0.5 + location * 0.25 + seniority * 0.15 + domain * 0.10)
                    results.append({
                        "pair_id": pair["pair_id"],
                        "skills": skills,
                        "seniority": seniority,
                        "domain": domain,
                        "location": location,
                        "composite": composite,
                        "overqualified": overqualified,
                        "matches": score.get("matches", []),
                        "gaps": score.get("gaps", []),
                        "label_source": "gemini-2.5-flash-lite+static",
                        "confidence": "high",
                    })
        return results

    for round_start in range(0, total_batches, CONCURRENT):
        round_batches = batches[round_start:round_start + CONCURRENT]
        round_num = round_start // CONCURRENT + 1
        total_rounds = (total_batches + CONCURRENT - 1) // CONCURRENT
        print(f"\nRound {round_num}/{total_rounds} ({len(round_batches)} parallel batches, {sum(len(b) for b in round_batches)} pairs)...")

        with ThreadPoolExecutor(max_workers=CONCURRENT) as executor:
            futures = {executor.submit(process_batch, batch): batch for batch in round_batches}
            for future in as_completed(futures):
                try:
                    results = future.result()
                    all_labels.extend(results)
                    success += len(results)
                except Exception as e:
                    failed += len(futures[future])
                    print(f"  Error: {e}")

        with open(OUTPUT_PATH, "w") as f:
            json.dump(all_labels, f, indent=2)
        print(f"  Checkpoint: {len(all_labels)} labels saved ({success} ok, {failed} failed)")

    with open(OUTPUT_PATH, "w") as f:
        json.dump(all_labels, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Labeling complete")
    print(f"Success: {success}, Failed: {failed}")
    print(f"Total labels: {len(all_labels)}")
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
