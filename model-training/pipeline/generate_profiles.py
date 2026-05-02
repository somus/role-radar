"""Generate synthetic profiles for underrepresented role families.

Uses Gemini to generate realistic profiles matching our schema.
Per PRD: synthetic data should use Claude API, but Gemini is acceptable
for bootstrapping since we already use it for labeling.

Usage: GEMINI_API_KEY=... python3 generate_profiles.py
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

from config import DATA_DIR

PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"

PROFILE_SPECS = [
    # (role_family, count_needed, role_examples, skill_examples, domain_examples)
    # Round 2: fill gaps to reach ~25 per family, boost thin tech families
    ("backend", 12, [
        "Backend Engineer", "API Developer", "Java Developer",
        "Python Backend Engineer", "Node.js Developer", "Go Developer",
        "Microservices Engineer", "Platform Engineer",
    ], [
        "Java", "Python", "Go", "Node.js", "Spring Boot", "Django", "FastAPI",
        "PostgreSQL", "MongoDB", "Redis", "Kafka", "Docker", "Kubernetes",
        "REST API", "gRPC", "Microservices",
    ], ["Enterprise SaaS", "Fintech", "E-commerce", "Healthcare", "EdTech", "Logistics"]),

    ("frontend", 9, [
        "Frontend Engineer", "React Developer", "UI Engineer",
        "Web Developer", "Frontend Architect", "JavaScript Developer",
    ], [
        "React", "TypeScript", "Next.js", "Vue.js", "Angular", "CSS",
        "Tailwind", "Redux", "GraphQL", "Webpack", "Storybook", "Jest",
    ], ["Enterprise SaaS", "E-commerce", "EdTech", "Fintech", "Healthcare", "Gaming"]),

    ("mobile", 7, [
        "Android Developer", "iOS Developer", "Mobile Engineer",
        "React Native Developer", "Flutter Developer",
    ], [
        "Kotlin", "Swift", "React Native", "Flutter", "Jetpack Compose",
        "SwiftUI", "Firebase", "REST API", "SQLite", "CI/CD",
    ], ["E-commerce", "Fintech", "Healthcare", "EdTech", "Enterprise SaaS", "Gaming"]),

    ("data", 8, [
        "Data Engineer", "Data Scientist", "ML Engineer",
        "Analytics Engineer", "Data Analyst", "AI Engineer",
    ], [
        "Python", "SQL", "Spark", "Airflow", "BigQuery", "Snowflake",
        "TensorFlow", "PyTorch", "pandas", "dbt", "Tableau", "Power BI",
    ], ["Enterprise SaaS", "Fintech", "E-commerce", "Healthcare", "Analytics", "Banking"]),

    ("product", 12, [
        "Product Manager", "Technical Program Manager", "Product Owner",
        "Program Manager", "Associate Product Manager", "Group PM",
    ], [
        "Jira", "Confluence", "Figma", "SQL", "A/B Testing", "Roadmapping",
        "Agile", "Scrum", "User Research", "Product Analytics", "PRD Writing",
    ], ["Enterprise SaaS", "Fintech", "E-commerce", "EdTech", "Healthcare", "HR Tech"]),

    ("devops", 4, [
        "DevOps Engineer", "SRE", "Cloud Architect", "Platform Engineer",
    ], [
        "AWS", "GCP", "Terraform", "Kubernetes", "Docker", "Jenkins",
        "Prometheus", "Grafana", "Ansible", "CI/CD", "Linux",
    ], ["Enterprise SaaS", "Fintech", "E-commerce", "Healthcare", "Banking", "Logistics"]),

    ("sales", 15, [
        "Sales Manager", "Account Executive", "Business Development Manager",
        "Key Account Manager", "Sales Director", "Territory Manager",
        "Inside Sales Representative", "Enterprise Sales Manager",
    ], [
        "Salesforce", "HubSpot", "B2B Sales", "Enterprise Sales", "Account Management",
        "Pipeline Management", "Solution Selling", "CRM", "Cold Calling", "Lead Generation",
        "Negotiation", "Pipedrive", "ZoomInfo", "Apollo", "Revenue Operations",
    ], ["Enterprise SaaS", "Fintech", "E-commerce", "Healthcare", "EdTech", "Manufacturing"]),

    ("marketing", 6, [
        "Marketing Manager", "Digital Marketing Manager", "Brand Manager",
        "Content Marketing Manager", "Performance Marketing Manager",
        "Growth Manager", "SEO Manager", "Social Media Manager",
    ], [
        "Google Ads", "Meta Ads", "LinkedIn Ads", "SEO", "SEM", "Content Strategy",
        "HubSpot", "Mailchimp", "Google Analytics", "Mixpanel", "Amplitude",
        "Copywriting", "Brand Strategy", "Demand Generation", "Marketing Automation",
    ], ["Enterprise SaaS", "E-commerce", "EdTech", "Fintech", "Healthcare", "Retail"]),

    ("hr", 5, [
        "HR Manager", "Recruiter", "Talent Acquisition Manager",
        "HR Business Partner", "People Operations Manager",
        "Compensation Manager", "Learning & Development Manager",
        "HR Generalist",
    ], [
        "Workday", "BambooHR", "Greenhouse", "Lever", "SAP SuccessFactors",
        "Talent Acquisition", "Employee Relations", "Compensation", "Benefits",
        "Performance Management", "HRIS", "People Analytics", "Darwinbox",
    ], ["Enterprise SaaS", "Fintech", "E-commerce", "Healthcare", "Manufacturing", "Consulting"]),

    ("finance", 11, [
        "Finance Manager", "Financial Analyst", "FP&A Manager",
        "Accountant", "Controller", "Treasury Manager",
        "Audit Manager", "Cost Analyst",
    ], [
        "SAP", "Oracle", "NetSuite", "Tally", "Excel", "Power BI",
        "Financial Modeling", "FP&A", "Budgeting", "Forecasting",
        "GAAP", "IFRS", "Accounts Payable", "Revenue Recognition", "Tax Planning",
    ], ["Banking", "Manufacturing", "E-commerce", "Enterprise SaaS", "Healthcare", "Consulting"]),

    ("operations", 12, [
        "Operations Manager", "Supply Chain Manager", "Logistics Manager",
        "Procurement Manager", "Warehouse Manager", "Production Manager",
        "Business Operations Manager", "Process Improvement Manager",
    ], [
        "SAP", "Oracle", "Lean", "Six Sigma", "Supply Chain Management",
        "Logistics", "Procurement", "Vendor Management", "ERP",
        "Process Optimization", "Inventory Management", "Warehouse Management",
    ], ["Manufacturing", "Logistics", "E-commerce", "Retail", "Automotive", "Healthcare"]),

    ("customer_success", 10, [
        "Customer Success Manager", "Customer Support Manager",
        "Client Success Manager", "Account Manager",
        "Customer Experience Manager", "Implementation Manager",
        "Client Partner", "Support Engineer",
    ], [
        "Gainsight", "Zendesk", "Freshdesk", "Intercom", "Salesforce",
        "Customer Onboarding", "Churn Analysis", "Retention", "NPS",
        "Client Relationship", "SaaS Metrics", "Customer Health Score",
    ], ["Enterprise SaaS", "Fintech", "EdTech", "E-commerce", "Healthcare", "HR Tech"]),

    ("legal", 17, [
        "Legal Counsel", "Compliance Manager", "Corporate Lawyer",
        "Contract Manager", "Risk Manager", "Legal Operations Manager",
        "IP Lawyer", "Regulatory Affairs Manager",
    ], [
        "Contract Management", "Compliance", "Risk Assessment", "GDPR",
        "Corporate Governance", "IP Law", "Regulatory Compliance",
        "Legal Research", "Due Diligence", "M&A", "Employment Law",
    ], ["Banking", "Enterprise SaaS", "Healthcare", "Manufacturing", "Fintech", "E-commerce"]),
]

SENIORITY_LEVELS = ["Junior", "Mid", "Senior", "Staff"]
CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai", "Remote"]

GENERATION_PROMPT = """Generate {count} realistic synthetic job seeker profiles for India-based professionals in {role_family} roles.

Each profile must be a JSON object with this exact schema:
{{
  "roles": ["Primary Role Title"],
  "skills_primary": ["Skill1", "Skill2", "Skill3", ...],  // 3-6 primary skills
  "skills_secondary": ["Skill1", "Skill2"],  // 1-3 secondary skills
  "experience_years": <int>,
  "seniority": "<Junior|Mid|Senior|Staff>",
  "domains": ["Domain1"],  // 1-2 domains from: {domains}
  "preferences": {{
    "locations": ["City1"],  // 1-2 from: Bangalore, Mumbai, Delhi, Hyderabad, Pune, Chennai
    "remote": <true|false>,
    "min_salary": null,
    "company_sizes": []
  }},
  "career_intent": "One sentence about what they're looking for",
  "dealbreakers": []  // usually empty, occasionally ["no crypto", "no gambling"]
}}

Role examples: {roles}
Skill examples (use these + related ones): {skills}

Requirements:
- Mix seniority levels: {seniority_dist}
- Use realistic India-market titles and skills
- Vary experience years: Junior=0-2, Mid=3-5, Senior=6-10, Staff=10+
- Mix remote/onsite preferences
- Make each profile distinct — different skill combos, domains, cities
- Skills should be realistic for the role and seniority level

Return a JSON array of {count} profile objects. No markdown, just JSON."""

RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "required": ["roles", "skills_primary", "skills_secondary", "experience_years",
                      "seniority", "domains", "preferences", "career_intent", "dealbreakers"],
        "properties": {
            "roles": {"type": "ARRAY", "items": {"type": "STRING"}},
            "skills_primary": {"type": "ARRAY", "items": {"type": "STRING"}},
            "skills_secondary": {"type": "ARRAY", "items": {"type": "STRING"}},
            "experience_years": {"type": "INTEGER"},
            "seniority": {"type": "STRING", "enum": ["Junior", "Mid", "Senior", "Staff"]},
            "domains": {"type": "ARRAY", "items": {"type": "STRING"}},
            "preferences": {
                "type": "OBJECT",
                "properties": {
                    "locations": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "remote": {"type": "BOOLEAN"},
                    "min_salary": {},
                    "company_sizes": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
            },
            "career_intent": {"type": "STRING"},
            "dealbreakers": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
    },
}


def call_gemini(prompt: str, api_key: str) -> list[dict] | None:
    import urllib.request

    url = f"{GEMINI_URL}/{GEMINI_MODEL}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }).encode()

    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            profiles = json.loads(text)
            if isinstance(profiles, list):
                return profiles
        except Exception as e:
            print(f"  Error: {e}")
            time.sleep(5 * (attempt + 1))

    return None


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    with open(PROFILES_PATH) as f:
        existing = json.load(f)

    next_id = max(p["profile_id"] for p in existing) + 1
    print(f"Existing profiles: {len(existing)}, next_id: {next_id}")

    new_profiles = []

    for family, count, roles, skills, domains in PROFILE_SPECS:
        seniority_dist = "Junior=25%, Mid=30%, Senior=30%, Staff=15%"
        prompt = GENERATION_PROMPT.format(
            count=count, role_family=family,
            roles=", ".join(roles), skills=", ".join(skills),
            domains=", ".join(domains), seniority_dist=seniority_dist,
        )

        print(f"\nGenerating {count} {family} profiles...")
        result = call_gemini(prompt, api_key)

        if result:
            for p in result:
                p["profile_id"] = next_id
                next_id += 1
                if "preferences" in p:
                    p["preferences"].setdefault("min_salary", None)
                    p["preferences"].setdefault("company_sizes", [])
                new_profiles.append(p)
            print(f"  Generated {len(result)} profiles")
        else:
            print(f"  FAILED to generate {family} profiles")

        time.sleep(2)

    all_profiles = existing + new_profiles
    with open(PROFILES_PATH, "w") as f:
        json.dump(all_profiles, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Total profiles: {len(all_profiles)} ({len(new_profiles)} new)")

    from collections import Counter
    from normalize import normalize_profile
    fams = Counter(normalize_profile(p).role_family for p in all_profiles)
    print("By family:")
    for k, v in fams.most_common():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
