"""Extract real profiles from resume screening dataset — rule-based.

No LLM dependency. Parses resume text with regex + keyword matching.
Normalizes to India market conventions.

Usage: python3 extract_real_profiles.py
"""

import json
import re
from pathlib import Path
from collections import defaultdict

from config import DATA_DIR, normalize_skill, SKILL_SYNONYMS

INPUT_PATH = DATA_DIR / "screening_dataset.json"
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"

INDIA_CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"]

ROLE_TO_FAMILY = {
    "Software Engineer": "fullstack", "software engineer": "fullstack",
    "Full Stack Developer": "fullstack", "Software Developer": "fullstack",
    "Data Scientist": "data", "data scientist": "data",
    "Data Engineer": "data", "data engineer": "data",
    "Data Analyst": "data", "data analyst": "data",
    "Machine Learning Engineer": "data",
    "AI Researcher": "data", "AI Engineer": "data",
    "Data Architect": "data",
    "DevOps Engineer": "devops", "Cloud Engineer": "devops",
    "Cloud Architect": "devops", "System Administrator": "devops",
    "UI Engineer": "frontend", "ui engineer": "frontend",
    "UX Designer": "frontend", "ui designer": "frontend",
    "UI Designer": "frontend", "UI/UX Designer": "frontend",
    "Mobile App Developer": "mobile",
    "Product Manager": "product", "product manager": "product",
    "Project Manager": "product",
    "QA Engineer": "fullstack",
    "Database Administrator": "backend",
    "Blockchain Developer": "fullstack",
    "Game Developer": "fullstack",
    "AR/VR Developer": "fullstack",
    "Robotics Engineer": "systems",
    "Network Engineer": "devops",
    "IT Support Specialist": "devops",
    "Cybersecurity Analyst": "devops", "Cybersecurity Specialist": "devops",
    "Human Resources Specialist": "hr", "HR Specialist": "hr",
    "Digital Marketing Specialist": "marketing",
    "Content Writer": "marketing",
    "E-commerce Specialist": "operations",
    "Business Analyst": "product",
    "Graphic Designer": "frontend",
}

SKILL_PATTERNS = [
    "Python", "Java", "JavaScript", "TypeScript", "React", "Angular", "Vue",
    "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring Boot",
    "Go", "Rust", "C++", "C#", "Ruby", "Rails", "PHP", "Laravel",
    "Swift", "Kotlin", "Flutter", "React Native",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
    "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform",
    "Kafka", "RabbitMQ", "GraphQL", "REST API",
    "TensorFlow", "PyTorch", "scikit-learn", "pandas", "NumPy",
    "Spark", "Airflow", "Snowflake", "BigQuery", "dbt",
    "Tableau", "Power BI", "Excel", "SQL",
    "Git", "Jenkins", "CI/CD", "Linux",
    "Figma", "Sketch", "Adobe XD",
    "Jira", "Confluence", "Agile", "Scrum",
    "Salesforce", "HubSpot", "SAP", "Oracle",
    "HTML", "CSS", "SCSS", "Tailwind",
    "Selenium", "Jest", "Cypress", "Playwright",
    "Machine Learning", "Deep Learning", "NLP", "Computer Vision",
    "Microservices", "Data Warehousing", "ETL",
]

DOMAIN_KEYWORDS = {
    "Enterprise SaaS": ["saas", "b2b", "enterprise software", "cloud platform"],
    "Fintech": ["fintech", "payment", "financial technology"],
    "Banking": ["banking", "bank", "investment", "trading", "capital market"],
    "E-commerce": ["e-commerce", "ecommerce", "marketplace", "retail", "shopping"],
    "Healthcare": ["healthcare", "health", "medical", "clinical", "pharma"],
    "Education": ["education", "edtech", "learning", "university", "student"],
    "Gaming": ["gaming", "game", "esports"],
    "Logistics": ["logistics", "supply chain", "shipping", "warehousing"],
    "Analytics": ["analytics", "data analytics", "business intelligence"],
    "Manufacturing": ["manufacturing", "factory", "production"],
    "Automotive": ["automotive", "vehicle", "car"],
}


def extract_experience_years(text: str) -> int:
    patterns = [
        r'(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|professional)',
        r'(\d+)\+?\s*(?:years?|yrs?)\s+(?:in|of)',
        r'(?:experience|professional).*?(\d+)\+?\s*(?:years?|yrs?)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return min(int(match.group(1)), 25)

    # Count job entries as rough proxy
    job_count = len(re.findall(r'\b(?:20[012]\d|19\d\d)\s*[-–]\s*(?:20[012]\d|present|current)', text, re.IGNORECASE))
    if job_count >= 4:
        return 10
    if job_count >= 2:
        return 5
    return 3


def infer_seniority(years: int, title: str) -> str:
    title_lower = title.lower()
    if any(w in title_lower for w in ["senior", "lead", "principal", "staff", "architect"]):
        return "Senior" if years < 10 else "Staff"
    if any(w in title_lower for w in ["junior", "associate", "intern", "entry"]):
        return "Junior"
    if any(w in title_lower for w in ["director", "head", "vp"]):
        return "Staff"
    if years <= 2:
        return "Junior"
    if years <= 5:
        return "Mid"
    if years <= 10:
        return "Senior"
    return "Staff"


def extract_skills(text: str) -> tuple[list[str], list[str]]:
    text_lower = text.lower()
    found = []
    for skill in SKILL_PATTERNS:
        if skill.lower() in text_lower:
            found.append(normalize_skill(skill))

    found = list(dict.fromkeys(found))
    primary = found[:6]
    secondary = found[6:9]
    return primary, secondary


def extract_domain(text: str) -> list[str]:
    text_lower = text.lower()
    scores = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[domain] = score

    if scores:
        best = sorted(scores, key=scores.get, reverse=True)
        return best[:2]
    return ["Enterprise SaaS"]


def extract_title(text: str, role_hint: str) -> str:
    title_patterns = [
        r'(?:^|\n)\s*((?:Senior |Junior |Lead |Staff |Principal )?(?:Software|Backend|Frontend|Full[- ]?Stack|DevOps|Cloud|Data|ML|Mobile|Product|QA|UI|UX)\s+(?:Engineer|Developer|Scientist|Analyst|Manager|Architect|Designer))',
    ]
    for pattern in title_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return role_hint


def main():
    with open(INPUT_PATH) as f:
        data = json.load(f)

    # Load existing profiles, remove old real profiles
    with open(PROFILES_PATH) as f:
        existing = json.load(f)

    clean_existing = [p for p in existing if not p.get("data_origin")]
    removed = len(existing) - len(clean_existing)
    print(f"Existing: {len(existing)}, removed {removed} old real profiles, keeping {len(clean_existing)} synthetic")

    next_id = max(p["profile_id"] for p in existing) + 1

    # Sample diverse resumes
    by_role = defaultdict(list)
    for d in data:
        if len(d.get("Resume", "")) > 200:
            by_role[d["Role"]].append(d)

    import random
    random.seed(42)
    selected = []
    for role, resumes in sorted(by_role.items()):
        sample = random.sample(resumes, min(5, len(resumes)))
        selected.extend(sample)

    print(f"Processing {len(selected)} resumes from {len(by_role)} roles")

    new_profiles = []
    for item in selected:
        resume = item["Resume"]
        role_hint = item["Role"]

        years = extract_experience_years(resume)
        title = extract_title(resume, role_hint)
        seniority = infer_seniority(years, title)
        primary, secondary = extract_skills(resume)
        domains = extract_domain(resume)
        role_family = ROLE_TO_FAMILY.get(role_hint, "fullstack")

        if len(primary) < 2:
            continue

        city = random.choice(INDIA_CITIES)
        remote = random.random() < 0.3

        profile = {
            "profile_id": next_id,
            "roles": [title],
            "skills_primary": primary,
            "skills_secondary": secondary,
            "experience_years": years,
            "seniority": seniority,
            "domains": domains,
            "preferences": {
                "locations": [city],
                "remote": remote,
                "min_salary": None,
                "company_sizes": [],
            },
            "career_intent": f"Seeking {seniority.lower()}-level {role_family} roles",
            "dealbreakers": [],
            "data_origin": "public-dataset-screening-v1",
        }
        new_profiles.append(profile)
        next_id += 1

    all_profiles = clean_existing + new_profiles
    with open(PROFILES_PATH, "w") as f:
        json.dump(all_profiles, f, indent=2)

    from collections import Counter
    from normalize import normalize_profile
    fams = Counter(normalize_profile(p).role_family for p in all_profiles)
    real_count = sum(1 for p in all_profiles if p.get("data_origin"))

    print(f"\nTotal: {len(all_profiles)} ({real_count} real, {len(all_profiles) - real_count} synthetic)")
    print("By family:")
    for k, v in fams.most_common():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
