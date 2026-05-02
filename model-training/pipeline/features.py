"""Extract feature vector from NormalizedProfile x NormalizedJob pair."""

from __future__ import annotations
from typing import TYPE_CHECKING

from config import are_roles_adjacent, are_domains_adjacent, normalize_skill, INDIA_CITIES, are_skills_adjacent, map_industry_to_domain
from normalize import NormalizedProfile, NormalizedJob

if TYPE_CHECKING:
    from embeddings import EmbeddingCache


FEATURE_NAMES = [
    "must_have_skill_overlap_ratio",
    "nice_to_have_skill_overlap_ratio",
    "total_skill_overlap_count",
    "missing_must_have_count",
    "seniority_delta",
    "seniority_match_exact",
    "role_family_match",
    "role_family_adjacent",
    "domain_match",
    "domain_adjacent",
    "location_compatible",
    "remote_match",
    "experience_years_delta",
    "title_similarity",
    "management_mismatch",
    "adjacent_skill_overlap_ratio",
    "industry_domain_match",
    "industry_domain_adjacent",
    "skill_embedding_sim",
]


def extract_features(profile: NormalizedProfile, job: NormalizedJob, embeddings: EmbeddingCache | None = None) -> list[float]:
    profile_skills_lower = {s.lower() for s in profile.skills}
    must_have_lower = {s.lower() for s in job.must_have_skills}
    nice_to_have_lower = {s.lower() for s in job.nice_to_have_skills}
    all_job_skills = must_have_lower | nice_to_have_lower

    must_overlap = profile_skills_lower & must_have_lower
    nice_overlap = profile_skills_lower & nice_to_have_lower
    total_overlap = profile_skills_lower & all_job_skills

    must_have_ratio = len(must_overlap) / len(must_have_lower) if must_have_lower else 0.5
    nice_to_have_ratio = len(nice_overlap) / len(nice_to_have_lower) if nice_to_have_lower else 0.5
    total_overlap_count = float(len(total_overlap))
    missing_must_have = float(len(must_have_lower - profile_skills_lower))

    seniority_delta = float(profile.seniority_level - job.seniority_level)
    seniority_exact = 1.0 if profile.seniority_level == job.seniority_level else 0.0

    role_match = 1.0 if profile.role_family == job.role_family else 0.0
    role_adj = 1.0 if are_roles_adjacent(profile.role_family, job.role_family) else 0.0

    domain_match = 1.0 if any(
        d.lower() == job.domain.lower() for d in profile.domains
    ) else 0.0
    domain_adj = 1.0 if any(
        are_domains_adjacent(d, job.domain) for d in profile.domains
    ) else 0.0

    loc_compatible = _location_compatible(profile, job)
    remote_m = 1.0 if (profile.remote and job.remote) else (0.0 if profile.remote != job.remote else 0.5)

    exp_delta = float(profile.experience_years - job.experience_years_required)

    title_sim = _title_similarity(profile, job)

    mgmt_mismatch = 1.0 if profile.is_manager != job.is_manager else 0.0

    # Adjacent skill overlap: count adjacent skills as 0.7 matches
    # Ratio of top 6 job skills matched via adjacency
    adjacent_overlap = _adjacent_skill_overlap_ratio(profile_skills_lower, job, all_job_skills)

    # Weighted skill overlap: weight first 3 job skills at 1.0, next 3 at 0.7, rest at 0.3
    weighted_overlap = _weighted_skill_overlap(profile_skills_lower, job)

    # Role family skill bonus: 1.0 if same family, 0.5 if adjacent, 0.0 otherwise
    role_family_bonus = _role_family_skill_bonus(profile.role_family, job.role_family)

    # Industry domain features
    industry_dom_match, industry_dom_adj = _industry_domain_features(profile, job)

    # Embedding-based skill similarity
    if embeddings is not None:
        from embeddings import serialize_profile_skills, serialize_job_skills
        skill_emb_sim = embeddings.cosine_sim(
            serialize_profile_skills(profile),
            serialize_job_skills(job),
        )
    else:
        skill_emb_sim = 0.0

    return [
        must_have_ratio,
        nice_to_have_ratio,
        total_overlap_count,
        missing_must_have,
        seniority_delta,
        seniority_exact,
        role_match,
        role_adj,
        domain_match,
        domain_adj,
        loc_compatible,
        remote_m,
        exp_delta,
        title_sim,
        mgmt_mismatch,
        adjacent_overlap,
        industry_dom_match,
        industry_dom_adj,
        skill_emb_sim,
    ]


def _location_compatible(profile: NormalizedProfile, job: NormalizedJob) -> float:
    if job.remote and profile.remote:
        return 1.0

    job_city = job.location_city.lower()
    prefs = {p.lower() for p in profile.location_preferences}

    if "remote" in prefs and job.remote:
        return 1.0

    if job_city in prefs:
        return 0.9 if job.hybrid else 1.0

    if job_city in INDIA_CITIES and any(c in INDIA_CITIES for c in prefs):
        return 0.4

    if job_city in INDIA_CITIES and "remote" in prefs:
        return 0.3

    return 0.1


def _title_similarity(profile: NormalizedProfile, job: NormalizedJob) -> float:
    profile_tokens = set()
    for role in profile.role_family.split():
        profile_tokens.add(role.lower())
    for role_str in [profile.role_family]:
        profile_tokens.add(role_str.lower())

    title_tokens = set(job.title.lower().split())
    stop_words = {"senior", "junior", "staff", "lead", "principal", "intern", "the", "a", "an", "and", "of", "for"}
    title_tokens -= stop_words

    if not title_tokens:
        return 0.0

    overlap = sum(1 for t in title_tokens if any(t in pt for pt in profile_tokens))
    return min(overlap / len(title_tokens), 1.0)


def _adjacent_skill_overlap_ratio(profile_skills_lower: set[str], job: NormalizedJob, all_job_skills: set[str]) -> float:
    """Count adjacent skills as 0.7 matches. Ratio of top 6 job skills matched via adjacency."""
    # Get top 6 job skills (must_have first, then nice_to_have)
    top_6_skills = (job.must_have_skills + job.nice_to_have_skills)[:6]
    if not top_6_skills:
        return 0.5

    top_6_lower = {s.lower() for s in top_6_skills}
    adjacent_matches = 0.0

    for job_skill in top_6_lower:
        for profile_skill in profile_skills_lower:
            if are_skills_adjacent(job_skill, profile_skill):
                adjacent_matches += 0.7
                break

    ratio = adjacent_matches / len(top_6_lower) if top_6_lower else 0.0
    return min(ratio, 1.0)


def _weighted_skill_overlap(profile_skills_lower: set[str], job: NormalizedJob) -> float:
    """Weight first 3 job skills at 1.0, next 3 at 0.7, rest at 0.3. Normalize to 0-1."""
    all_job_skills = job.must_have_skills + job.nice_to_have_skills
    if not all_job_skills:
        return 0.5

    weighted_score = 0.0
    total_weight = 0.0

    for idx, job_skill in enumerate(all_job_skills):
        job_skill_lower = job_skill.lower()

        # Determine weight based on position
        if idx < 3:
            weight = 1.0
        elif idx < 6:
            weight = 0.7
        else:
            weight = 0.3

        total_weight += weight

        # Check if profile has exact match or adjacent skill
        if job_skill_lower in profile_skills_lower:
            weighted_score += weight
        else:
            for profile_skill in profile_skills_lower:
                if are_skills_adjacent(job_skill_lower, profile_skill):
                    weighted_score += weight * 0.7
                    break

    if total_weight == 0:
        return 0.5

    return min(weighted_score / total_weight, 1.0)


def _role_family_skill_bonus(profile_role_family: str, job_role_family: str) -> float:
    """1.0 if same role family, 0.5 if adjacent, 0.0 otherwise."""
    if profile_role_family == job_role_family:
        return 1.0
    if are_roles_adjacent(profile_role_family, job_role_family):
        return 0.5
    return 0.0


def _industry_domain_features(profile: NormalizedProfile, job: NormalizedJob) -> tuple[float, float]:
    mapped_domain = map_industry_to_domain(job.industry)
    if not mapped_domain:
        return 0.0, 0.0
    domain_match = 1.0 if any(d.lower() == mapped_domain.lower() for d in profile.domains) else 0.0
    domain_adjacent = 1.0 if any(are_domains_adjacent(d, mapped_domain) for d in profile.domains) else 0.0
    return domain_match, domain_adjacent
