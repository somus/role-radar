"""Rules-based normalization for Phase 1. No LLM fallback."""

import re
from dataclasses import dataclass, field

from config import (SENIORITY_MAP, ROLE_FAMILIES, DOMAIN_MAP, normalize_skill, INDIA_CITIES,
                    BACKEND_SKILLS, FRONTEND_SKILLS, DATA_SKILLS, DEVOPS_SKILLS)


@dataclass
class NormalizedProfile:
    role_family: str
    seniority: str
    seniority_level: int
    skills: list[str]
    domains: list[str]
    location_preferences: list[str]
    remote: bool
    experience_years: int
    is_manager: bool
    dealbreakers: list[str]


@dataclass
class NormalizedJob:
    id: str
    title: str
    role_family: str
    seniority_level: int
    must_have_skills: list[str]
    nice_to_have_skills: list[str]
    domain: str
    location: str
    location_city: str
    remote: bool
    hybrid: bool
    experience_years_required: float
    is_manager: bool
    industry: str = ""


def normalize_profile(profile: dict) -> NormalizedProfile:
    roles_text = " ".join(profile["roles"]).lower()
    role_family = _infer_role_family(roles_text)

    all_skills = [normalize_skill(s) for s in
                  profile["skills_primary"] + profile["skills_secondary"]]

    is_manager = any(kw in roles_text for kw in ["manager", "director", "vp ", "lead", "head of"])

    return NormalizedProfile(
        role_family=role_family,
        seniority=profile["seniority"],
        seniority_level=SENIORITY_MAP.get(profile["seniority"], 3),
        skills=all_skills,
        domains=profile["domains"],
        location_preferences=[loc.lower() for loc in profile["preferences"]["locations"]],
        remote=profile["preferences"]["remote"],
        experience_years=profile["experience_years"],
        is_manager=is_manager,
        dealbreakers=profile.get("dealbreakers", []),
    )


def normalize_job(job: dict) -> NormalizedJob:
    title_lower = job["title"].lower()
    desc = job.get("description", "") or ""

    role_family = _infer_role_family(title_lower, desc)
    seniority_level = SENIORITY_MAP.get(job.get("seniority_hint", ""), 0) or _infer_seniority(title_lower, desc)
    domain = job.get("domain_hint") or _infer_domain(desc)

    must_have, nice_to_have = _extract_skills_from_description(desc)

    location_raw = (job.get("location") or "").lower()
    remote = job.get("remote_hint", False) or "remote" in location_raw
    hybrid = "hybrid" in location_raw
    city = _extract_city(location_raw)

    exp_years = job.get("experience_years_hint", 0) or _extract_experience_years(desc)
    is_manager = any(kw in title_lower for kw in ["manager", "director", "vp ", "lead", "head of"])

    return NormalizedJob(
        id=job["id"],
        title=job["title"],
        role_family=role_family,
        seniority_level=seniority_level,
        must_have_skills=must_have,
        nice_to_have_skills=nice_to_have,
        domain=domain,
        location=location_raw,
        location_city=city,
        remote=remote,
        hybrid=hybrid,
        experience_years_required=exp_years,
        is_manager=is_manager,
        industry=job.get("industry", ""),
    )


TITLE_EXCLUDES = {
    "sales": {"salesforce"},
    "marketing": {"marketing technology", "marketing platform", "marketing engineer"},
    "finance": {"finance technology", "fintech"},
}


def _infer_role_family(text: str, desc: str = "") -> str:
    text_lower = text.lower()
    for family, keywords in ROLE_FAMILIES.items():
        excludes = TITLE_EXCLUDES.get(family, set())
        for kw in keywords:
            if kw in text_lower:
                if any(ex in text_lower for ex in excludes):
                    continue
                if family == "fullstack" and desc:
                    return _disambiguate_by_skills(desc, family)
                return family
    if desc:
        return _disambiguate_by_skills(desc, "fullstack")
    return "fullstack"


def _disambiguate_by_skills(desc: str, fallback: str) -> str:
    desc_lower = desc.lower()
    scores = {
        "backend": sum(1 for s in BACKEND_SKILLS if s in desc_lower),
        "frontend": sum(1 for s in FRONTEND_SKILLS if s in desc_lower),
        "data": sum(1 for s in DATA_SKILLS if s in desc_lower),
        "devops": sum(1 for s in DEVOPS_SKILLS if s in desc_lower),
    }
    best = max(scores, key=scores.get)
    if scores[best] >= 3:
        second = max((k for k in scores if k != best), key=scores.get)
        if scores[best] - scores[second] >= 2:
            return best
    return fallback


def _infer_seniority(title: str, desc: str) -> int:
    text = (title + " " + desc).lower()
    if any(w in text for w in ["intern", "entry", "0-2 year", "0–2 year"]):
        return 1
    if any(w in text for w in ["junior", "1-3 year", "1–3 year", "2+ year"]):
        return 1
    if any(w in text for w in ["staff", "principal", "10+ year", "12+ year"]):
        return 4
    if any(w in text for w in ["senior", "7+ year", "8+ year", "6+ year"]):
        return 3
    if any(w in text for w in ["3-5 year", "3–5 year", "4+ year", "5+ year", "mid"]):
        return 2
    return 2


def _infer_domain(desc: str) -> str:
    desc_lower = desc.lower()
    best_match = ""
    best_count = 0
    for domain, keywords in DOMAIN_MAP.items():
        count = sum(1 for kw in keywords if kw in desc_lower)
        if count > best_count:
            best_count = count
            best_match = domain
    return best_match or "Enterprise SaaS"


def _extract_skills_from_description(desc: str) -> tuple[list[str], list[str]]:
    must_have: list[str] = []
    nice_to_have: list[str] = []

    sections = re.split(r'\n(?=Requirements:|Nice to have:|What you\'ll|Responsibilities:)', desc, flags=re.IGNORECASE)

    req_section = ""
    nth_section = ""

    for section in sections:
        lower = section.strip().lower()
        if lower.startswith("requirements:") or lower.startswith("required:"):
            req_section = section
        elif lower.startswith("nice to have:") or lower.startswith("preferred:"):
            nth_section = section

    if not req_section:
        req_section = desc

    must_have = _extract_skill_names(req_section)

    # Cap must_have at 6 skills (take first 6 listed in Requirements section)
    must_have = must_have[:6]

    # If job has fewer than 2 extractable skills, try extracting from full description
    if len(must_have) < 2:
        must_have = _extract_skill_names(desc)[:6]

    if nth_section:
        nice_to_have = _extract_skill_names(nth_section)

    return must_have, nice_to_have


_SKILL_PATTERNS = [
    "TypeScript", "JavaScript", "React", "Vue.js", "Angular", "Next.js",
    "Node.js", "Express", "GraphQL", "PostgreSQL", "MySQL", "MongoDB",
    "Redis", "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform",
    "Python", "Java", "Go", "Rust", "C++", "Ruby", "Rails", "Django",
    "Spring Boot", "Swift", "Kotlin", "Flutter", "Dart", "React Native",
    "SQL", "Kafka", "Spark", "Airflow", "TensorFlow", "PyTorch",
    "Tailwind", "CSS", "SCSS", "Salesforce", "COBOL", "PHP", "Laravel",
    "Ansible", "Jenkins", "Prometheus", "Grafana", "ArgoCD",
    "Storybook", "Jest", "Playwright", "D3.js", "Recharts",
    "Celery", "Sidekiq", "RabbitMQ", "Elasticsearch",
    "Snowflake", "BigQuery", "dbt", "Dataflow", "Looker",
    "SpriteKit", "Metal", "SwiftUI", "UIKit", "CoreData",
    "Jetpack Compose", "ExoPlayer", "Room", "Retrofit",
    "Firebase", "Figma", "Amplitude", "Mixpanel",
    "Jira", "Confluence", "HubSpot", "Gainsight",
    "SAP", "Workday", "Tableau", "Power BI", "Excel",
]


def _extract_skill_names(text: str) -> list[str]:
    found = []
    text_lower = text.lower()
    for skill in _SKILL_PATTERNS:
        if skill.lower() in text_lower:
            found.append(normalize_skill(skill))
    return list(dict.fromkeys(found))


def _extract_city(location: str) -> str:
    location = location.lower()
    for city in INDIA_CITIES:
        if city in location:
            return city
    if "remote" in location:
        return "remote"
    parts = [p.strip() for p in location.replace("(", ",").replace(")", ",").split(",")]
    return parts[0] if parts else ""


def _extract_experience_years(desc: str) -> float:
    match = re.search(r'(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|professional)', desc, re.IGNORECASE)
    if match:
        return float(match.group(1))
    match = re.search(r'(\d+)-(\d+)\s*(?:years?|yrs?)', desc, re.IGNORECASE)
    if match:
        return (float(match.group(1)) + float(match.group(2))) / 2
    return 3.0
