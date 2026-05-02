"""Mappings, adjacency matrices, skill synonyms, and LightGBM hyperparameters."""

from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
BENCHMARKS_PATH = DATA_DIR / "benchmarks.json"
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
MODELS_DIR = DATA_DIR / "models"

SENIORITY_MAP = {
    "Junior": 1,
    "Mid": 2,
    "Senior": 3,
    "Staff": 4,
    "Principal": 5,
    "Executive": 6,
}

ROLE_FAMILIES = {
    # Specific families first — order matters for keyword matching
    "data": ["data engineer", "data scientist", "data analyst", "ml engineer", "machine learning",
             "analytics engineer", "etl", "data science", "head of data"],
    "devops": ["devops", "platform engineer", "sre", "site reliability", "infrastructure engineer",
               "cloud engineer", "cloud architect"],
    "mobile": ["ios", "android", "mobile app", "mobile engineer", "mobile developer",
               "mobile software", "react native", "flutter"],
    "systems": ["systems engineer", "embedded", "firmware", "kernel", "low-level"],
    "product": ["product manager", "program manager", "product owner", "tpm",
                "technical program manager", "product specialist"],
    "frontend": ["frontend", "front-end", "front end", "ui engineer", "ui developer"],
    "backend": ["backend", "back-end", "back end", "api engineer", "server engineer", "microservice"],
    # Non-tech sub-families
    "sales": ["sales manager", "sales consultant", "sales associate", "sales executive",
              "sales -", "- sales", "account manager", "key account",
              "business development", "territory manager", "client acquisition",
              "closing manager", "sourcing manager", "business manager",
              "general manager"],
    "marketing": ["marketing", "brand manager", "brand activation", "brand communication",
                  "brand planning", "content manager", "seo", "sem", "ad operations",
                  "performance marketing", "growth manager", "digital marketing",
                  "demand generation", "paid media", "social media manager"],
    "hr": ["hr ", "recruiter", "recruiting", "talent acquisition", "human resource",
           "people operations", "compensation", "learning & development",
           "contingent labor", "hr generalist", "hr partner"],
    "finance": ["finance", "accounting", "accountant", "fp&a", "financial analyst",
                "cost manager", "auditor", "director finance"],
    "operations": ["operations manager", "supply chain", "procurement", "logistics manager",
                   "delivery manager", "service delivery", "branch manager", "area manager",
                   "production manager", "materials manager", "desk flow",
                   "ecommerce manager"],
    "customer_success": ["customer success", "customer support", "support manager",
                         "client success", "customer experience"],
    "legal": ["legal", "compliance", "risk manager", "general counsel"],
    # Catch-all tech — must be last
    "fullstack": ["fullstack", "full stack", "full-stack", "product engineer", "software engineer",
                  "software developer", "sde", "sdet"],
}

ROLE_ADJACENCY = {
    ("backend", "fullstack"): True,
    ("frontend", "fullstack"): True,
    ("backend", "devops"): True,
    ("data", "backend"): True,
    ("data", "devops"): True,
    ("mobile", "frontend"): True,
    ("mobile", "fullstack"): True,
    ("systems", "devops"): True,
    ("systems", "backend"): True,
    # Non-tech adjacencies
    ("sales", "marketing"): True,
    ("sales", "customer_success"): True,
    ("marketing", "customer_success"): True,
    ("hr", "operations"): True,
    ("finance", "operations"): True,
    ("operations", "customer_success"): True,
}

# Skill-based role family disambiguation for generic titles
BACKEND_SKILLS = {"java", "spring boot", "node.js", "express", "django", "flask", "fastapi",
                  "postgresql", "mysql", "mongodb", "redis", "kafka", "rabbitmq", "graphql",
                  "microservice", "rest api", "grpc"}
FRONTEND_SKILLS = {"react", "vue.js", "angular", "next.js", "css", "tailwind", "scss",
                   "storybook", "figma", "d3.js", "recharts", "svelte"}
DATA_SKILLS = {"spark", "airflow", "tensorflow", "pytorch", "pandas", "scikit-learn",
               "bigquery", "snowflake", "dbt", "tableau", "power bi", "looker",
               "machine learning", "deep learning", "nlp"}
DEVOPS_SKILLS = {"docker", "kubernetes", "terraform", "ansible", "jenkins", "argocd",
                 "prometheus", "grafana", "aws", "gcp", "azure", "ci/cd"}

def are_roles_adjacent(a: str, b: str) -> bool:
    if a == b:
        return True
    return ROLE_ADJACENCY.get((a, b), False) or ROLE_ADJACENCY.get((b, a), False)

DOMAIN_MAP = {
    "Enterprise SaaS": ["enterprise", "saas", "b2b", "multi-tenant"],
    "Developer Tools": ["developer", "devtool", "collaboration", "jira", "confluence", "bitbucket"],
    "Fintech": ["fintech", "payment", "banking", "financial", "billing", "subscription"],
    "Payments": ["payment", "billing", "stripe", "razorpay"],
    "Healthcare": ["healthcare", "health", "medical", "ehr", "clinical", "hospital", "biotech"],
    "Biotech": ["biotech", "pharmaceutical", "clinical"],
    "E-commerce": ["e-commerce", "ecommerce", "marketplace", "shopify", "retail", "merchant"],
    "Retail": ["retail", "commerce", "shopping"],
    "Education": ["education", "edtech", "lms", "learning", "university", "student"],
    "EdTech": ["edtech", "learning", "education", "course", "student"],
    "Crypto": ["crypto", "cryptocurrency", "blockchain", "defi", "web3", "token"],
    "Gaming": ["game", "gaming", "esports"],
    "Social Media": ["social media", "social network", "content", "video"],
    "Logistics": ["logistics", "supply chain", "shipping", "tracking", "freight", "shipment"],
    "Travel": ["travel", "booking", "tourism", "hotel", "hospitality"],
    "Analytics": ["analytics", "data", "insights", "metrics", "observability"],
    "CRM": ["crm", "salesforce", "customer relationship"],
    "HR Tech": ["hr tech", "hrtech", "workforce", "talent", "recruiting", "compensation"],
    "Real Estate": ["real estate", "realty", "property"],
    "Automotive": ["automotive", "vehicle", "adas", "autonomous", "car"],
    "Banking": ["bank", "banking", "mainframe", "transaction processing"],
}

DOMAIN_ADJACENCY = {
    ("Enterprise SaaS", "Developer Tools"): True,
    ("Enterprise SaaS", "CRM"): True,
    ("Enterprise SaaS", "HR Tech"): True,
    ("Enterprise SaaS", "Analytics"): True,
    ("Fintech", "Payments"): True,
    ("Fintech", "Enterprise SaaS"): True,
    ("Fintech", "Banking"): True,
    ("Education", "EdTech"): True,
    ("E-commerce", "Retail"): True,
    ("E-commerce", "Enterprise SaaS"): True,
    ("Healthcare", "Biotech"): True,
    ("Logistics", "E-commerce"): True,
    ("Analytics", "Enterprise SaaS"): True,
    ("HR Tech", "Enterprise SaaS"): True,
    ("CRM", "Enterprise SaaS"): True,
}

def are_domains_adjacent(a: str, b: str) -> bool:
    if a == b:
        return True
    return DOMAIN_ADJACENCY.get((a, b), False) or DOMAIN_ADJACENCY.get((b, a), False)

INDUSTRY_TO_DOMAIN = {
    # ===== Technology, Information & Internet (20 parent category) =====
    # Full compound strings
    "Technology, Information and Internet": "Enterprise SaaS",
    "Technology, Information and Media": "Enterprise SaaS",
    "Technology, Information and Internet, Software Development, and Technology, Information and Media": "Enterprise SaaS",
    "Software Development, IT Services and IT Consulting, and Technology, Information and Internet": "Enterprise SaaS",
    "Hospitality, IT Services and IT Consulting, and Technology, Information and Internet": "Enterprise SaaS",
    "IT Services and IT Consulting": "Enterprise SaaS",
    "IT Services and IT Consulting, Software Development, and IT System Custom Software Development": "Enterprise SaaS",
    "IT Services and IT Consulting and Software Development": "Enterprise SaaS",
    "Construction, Software Development, and IT Services and IT Consulting": "Enterprise SaaS",
    "Software Development and IT Services and IT Consulting": "Enterprise SaaS",
    "Holding Companies, IT Services and IT Consulting, and IT System Data Services": "Enterprise SaaS",

    # Individual fragments from compound strings
    "IT Services": "Enterprise SaaS",
    "IT Consulting": "Enterprise SaaS",
    "Software Development": "Enterprise SaaS",
    "Technology": "Enterprise SaaS",
    "Information": "Enterprise SaaS",
    "Internet": "Enterprise SaaS",
    "Media": "Social Media",

    # Other tech category mappings
    "Information Technology & Services": "Enterprise SaaS",
    "Information Technology &amp; Services": "Enterprise SaaS",
    "Computer and Network Security": "Enterprise SaaS",
    "Computer Software": "Enterprise SaaS",
    "Mobile Computing Software Products": "Enterprise SaaS",
    "Internet Publishing": "Enterprise SaaS",
    "Internet Marketplace Platforms": "E-commerce",
    "Computers and Electronics Manufacturing": "Enterprise SaaS",
    "Telecommunications": "Enterprise SaaS",
    "Information Services": "Enterprise SaaS",
    "IT System Custom Software Development": "Enterprise SaaS",
    "IT System Data Services": "Enterprise SaaS",
    "Outsourcing and Offshoring Consulting": "Enterprise SaaS",
    "Business Consulting and Services": "Enterprise SaaS",
    "Business Consulting": "Enterprise SaaS",
    "Services": "Enterprise SaaS",
    "Engineering Services": "Enterprise SaaS",
    "Design Services": "Enterprise SaaS",

    # ===== Financial Services (20 parent category) =====
    "Financial Services": "Banking",
    "Banking and Financial Services": "Banking",
    "Financial Services, Banking, and Investment Banking": "Banking",
    "Accounting, Banking, and Financial Services": "Banking",
    "Banking": "Banking",
    "Investment Banking": "Banking",
    "Insurance": "Banking",
    "Accounting": "Banking",
    "Capital Markets": "Banking",
    "Venture Capital and Private Equity": "Fintech",

    # ===== Hospitals and Health Care (20 parent category) =====
    "Hospitals and Health Care": "Healthcare",
    "Health Care": "Healthcare",
    "Health and Human Services": "Healthcare",
    "Hospitals": "Healthcare",
    "Pharmaceutical Manufacturing": "Healthcare",
    "Medical Equipment Manufacturing": "Healthcare",
    "Biotechnology Research": "Healthcare",
    "Medical Devices": "Healthcare",
    "Mental Health Care": "Healthcare",

    # ===== Retail and Consumer Goods (20 parent category) =====
    "Retail": "E-commerce",
    "Retail Apparel and Fashion": "E-commerce",
    "Consumer Goods": "E-commerce",
    "Food and Beverage": "E-commerce",
    "Food": "E-commerce",
    "Restaurants": "E-commerce",
    "Wholesale": "E-commerce",
    "Consumer Electronics": "E-commerce",

    # ===== Education (20 parent category) =====
    "Education": "Education",
    "Higher Education": "Education",
    "E-Learning Providers": "Education",
    "Professional Training and Coaching": "Education",
    "Research Services": "Education",

    # ===== Professional Services (20 parent category) =====
    "Legal Services": "Legal",
    "Law Practice": "Legal",
    "Accounting Services": "Fintech",

    # ===== Manufacturing (20 parent category) =====
    "Motor Vehicle Manufacturing": "Automotive",
    "Automotive": "Automotive",
    "Semiconductor Manufacturing": "Manufacturing",
    "Semiconductors": "Manufacturing",
    "Appliances, Electrical, and Electronics Manufacturing": "Manufacturing",
    "Electronics Manufacturing": "Manufacturing",
    "Appliances": "Manufacturing",
    "Electrical": "Manufacturing",
    "Automation Machinery Manufacturing": "Manufacturing",
    "Industrial Machinery Manufacturing": "Manufacturing",
    "Packaging and Containers Manufacturing": "Manufacturing",
    "Manufacturing": "Manufacturing",
    "Holding Companies": "Enterprise SaaS",

    # ===== Transportation and Logistics (20 parent category) =====
    "Transportation, Logistics, Supply Chain and Storage": "Logistics",
    "Transportation": "Logistics",
    "Logistics": "Logistics",
    "Supply Chain": "Logistics",
    "Storage": "Logistics",
    "Freight and Package Transportation": "Logistics",
    "Warehousing and Storage": "Logistics",
    "Airlines and Aviation": "Travel",

    # ===== Real Estate and Construction (20 parent category) =====
    "Real Estate": "Real Estate",
    "Construction": "Real Estate",

    # ===== Entertainment and Media (20 parent category) =====
    "Entertainment Providers": "Gaming",
    "Gaming": "Gaming",
    "Animation and Post-production": "Gaming",
    "Computer Games": "Gaming",
    "Online Media": "Social Media",
    "Broadcast Media": "Social Media",
    "Media Production": "Social Media",

    # ===== Energy and Mining (20 parent category) =====
    "Oil and Gas": "Energy",
    "Oil": "Energy",
    "Gas": "Energy",
    "Renewable Energy": "Energy",
    "Utilities": "Energy",
    "Environmental Services": "Energy",

    # ===== Government and Non-profit (20 parent category) =====
    "Government Administration": "Government",
    "Non-profit Organizations": "Non-profit",
    "Civic and Social Organizations": "Non-profit",

    # ===== Hospitality and Travel (20 parent category) =====
    "Hospitality": "Travel",
    "Travel Arrangements": "Travel",
    "Leisure, Travel & Tourism": "Travel",

    # ===== Agriculture (20 parent category) =====
    "Agriculture": "Agriculture",
    "Farming": "Agriculture",

    # ===== Other mappings =====
    "Building Materials": "Real Estate",
    "Executive Offices": "",
    "Industrial Automation": "Manufacturing",
    "Investment Management": "Banking",
}

# Expanded domain adjacency — comprehensive
DOMAIN_ADJACENCY = {
    # Tech cluster (hub-and-spoke: Enterprise SaaS is central)
    ("Enterprise SaaS", "Developer Tools"): True,
    ("Enterprise SaaS", "CRM"): True,
    ("Enterprise SaaS", "HR Tech"): True,
    ("Enterprise SaaS", "Analytics"): True,
    ("Enterprise SaaS", "Fintech"): True,
    ("Enterprise SaaS", "E-commerce"): True,
    ("Enterprise SaaS", "Education"): True,
    ("Enterprise SaaS", "Healthcare"): True,
    ("Enterprise SaaS", "EdTech"): True,
    ("Enterprise SaaS", "Logistics"): True,
    ("Enterprise SaaS", "Real Estate"): True,
    ("Developer Tools", "Analytics"): True,

    # Finance cluster
    ("Fintech", "Payments"): True,
    ("Fintech", "Banking"): True,
    ("Fintech", "Enterprise SaaS"): True,
    ("Fintech", "Analytics"): True,
    ("Payments", "Banking"): True,
    ("Banking", "Enterprise SaaS"): True,

    # Education cluster
    ("Education", "EdTech"): True,
    ("Education", "Enterprise SaaS"): True,

    # Commerce cluster
    ("E-commerce", "Retail"): True,
    ("E-commerce", "Enterprise SaaS"): True,
    ("E-commerce", "Logistics"): True,
    ("E-commerce", "Marketing"): True,
    ("E-commerce", "Payments"): True,
    ("Retail", "Marketing"): True,
    ("Retail", "Enterprise SaaS"): True,

    # Health cluster
    ("Healthcare", "Biotech"): True,
    ("Healthcare", "Enterprise SaaS"): True,
    ("Healthcare", "Analytics"): True,

    # Logistics cluster
    ("Logistics", "E-commerce"): True,
    ("Logistics", "Travel"): True,
    ("Logistics", "Enterprise SaaS"): True,

    # Media/Gaming cluster
    ("Social Media", "Marketing"): True,
    ("Social Media", "Gaming"): True,
    ("Gaming", "Entertainment"): True,
    ("Gaming", "Marketing"): True,
    ("Marketing", "E-commerce"): True,
    ("Marketing", "Analytics"): True,

    # HR cluster
    ("HR Tech", "Enterprise SaaS"): True,
    ("HR Tech", "Analytics"): True,

    # CRM cluster
    ("CRM", "Enterprise SaaS"): True,
    ("CRM", "Marketing"): True,
    ("CRM", "HR Tech"): True,

    # Analytics cluster
    ("Analytics", "Enterprise SaaS"): True,
    ("Analytics", "Fintech"): True,
    ("Analytics", "Healthcare"): True,

    # Real Estate/Construction
    ("Real Estate", "Enterprise SaaS"): True,
    ("Real Estate", "Analytics"): True,

    # Travel/Hospitality
    ("Travel", "Logistics"): True,
    ("Travel", "Marketing"): True,
    ("Travel", "E-commerce"): True,

    # Energy/Automotive — adjacent
    ("Energy", "Automotive"): True,
    ("Automotive", "Enterprise SaaS"): True,
    ("Energy", "Enterprise SaaS"): True,

    # Legal
    ("Legal", "Enterprise SaaS"): True,
    ("Legal", "Fintech"): True,

    # Agriculture
    ("Agriculture", "Enterprise SaaS"): True,

    # Government/Non-profit
    ("Government", "Enterprise SaaS"): True,
    ("Non-profit", "Enterprise SaaS"): True,

    # Manufacturing
    ("Manufacturing", "Automotive"): True,
    ("Manufacturing", "Enterprise SaaS"): True,
    ("Manufacturing", "Energy"): True,

    # Banking ↔ Fintech (related but distinct)
    ("Banking", "Fintech"): True,
    ("Banking", "Enterprise SaaS"): True,
}

DOMAIN_SCORE_TABLE = {
    "exact": 90,
    "adjacent": 72,
    "both_tech": 62,
    "different": 58,
}

TECH_DOMAINS = {
    "Enterprise SaaS", "Developer Tools", "Fintech", "E-commerce", "Education",
    "Healthcare", "Analytics", "CRM", "HR Tech", "EdTech", "Payments", "Gaming",
    "Social Media", "Banking", "Real Estate", "Logistics", "Travel", "Automotive",
    "Energy", "Legal", "Agriculture", "Government", "Non-profit", "Retail", "Biotech",
    "Manufacturing",
}


def map_industry_to_domain(industry_str: str) -> str:
    """Map LinkedIn industry string to domain.

    Handles:
    - Empty/null industry → ""
    - Multiple industries separated by commas/and → tries each, returns best match
    - HTML entities like &amp; → cleans before matching
    - Case insensitive matching
    """
    if not industry_str or not isinstance(industry_str, str):
        return ""

    # Clean HTML entities
    cleaned = industry_str.replace("&amp;", "&").strip()

    # Exact match first
    if cleaned in INDUSTRY_TO_DOMAIN:
        return INDUSTRY_TO_DOMAIN[cleaned]

    lower = cleaned.lower()

    # Try exact match (case-insensitive)
    for key, domain in INDUSTRY_TO_DOMAIN.items():
        if key.lower() == lower:
            return domain

    # For compound strings, split on commas and 'and' and try each fragment
    # Split on comma first
    fragments = [f.strip() for f in cleaned.split(",")]
    if len(fragments) > 1:
        # Also split the last fragment on 'and'
        all_fragments = []
        for frag in fragments:
            parts = [p.strip() for p in frag.split(" and ")]
            all_fragments.extend(parts)
        # Try each fragment
        for fragment in all_fragments:
            if fragment in INDUSTRY_TO_DOMAIN:
                return INDUSTRY_TO_DOMAIN[fragment]
            # Case-insensitive match
            for key, domain in INDUSTRY_TO_DOMAIN.items():
                if key.lower() == fragment.lower():
                    return domain

    # Substring match (case-insensitive)
    for key, domain in INDUSTRY_TO_DOMAIN.items():
        if key.lower() in lower or lower in key.lower():
            return domain

    # Fallback keyword matching
    if "tech" in lower or "software" in lower or "computer" in lower or "it " in lower:
        return "Enterprise SaaS"
    if "health" in lower or "medical" in lower or "pharma" in lower or "hospital" in lower:
        return "Healthcare"
    if "financ" in lower or "bank" in lower or "insur" in lower or "capital market" in lower:
        return "Fintech"
    if "retail" in lower or "commerce" in lower or "consumer" in lower or "food" in lower or "restaur" in lower:
        return "E-commerce"
    if "educat" in lower or "learn" in lower or "train" in lower or "university" in lower or "student" in lower:
        return "Education"
    if "logist" in lower or "transport" in lower or "supply" in lower or "shipping" in lower or "freight" in lower:
        return "Logistics"
    if "recruit" in lower or "staffing" in lower or "human resource" in lower or "talent" in lower:
        return "HR Tech"
    if "market" in lower or "advertis" in lower or "social media" in lower or "media" in lower:
        return "Marketing"
    if "real estate" in lower or "realty" in lower or "property" in lower or "construct" in lower:
        return "Real Estate"
    if "energy" in lower or "oil" in lower or "gas" in lower or "utili" in lower:
        return "Energy"
    if "automotive" in lower or "motor vehicle" in lower or "car" in lower:
        return "Automotive"
    if "game" in lower or "entertain" in lower:
        return "Gaming"
    if "travel" in lower or "tourism" in lower or "hotel" in lower or "hospit" in lower:
        return "Travel"
    if "legal" in lower or "law" in lower:
        return "Legal"

    return ""


def score_domain_static(profile_domains: list[str], job_industry: str) -> int:
    """Deterministic domain scoring (50-100 scale).

    Logic:
    1. Exact match → 90
    2. Adjacent domains → 75
    3. Both tech domains → 65
    4. Different domains → 58
    """
    mapped = map_industry_to_domain(job_industry)
    if not mapped:
        # If we can't map the job industry, check if all profile domains are tech
        if profile_domains and any(d in TECH_DOMAINS for d in profile_domains):
            return DOMAIN_SCORE_TABLE["both_tech"]
        return DOMAIN_SCORE_TABLE["different"]

    # Check for exact match (case-insensitive)
    for pd in profile_domains:
        if pd.lower() == mapped.lower():
            return DOMAIN_SCORE_TABLE["exact"]

    # Check for adjacent match
    for pd in profile_domains:
        if are_domains_adjacent(pd, mapped):
            return DOMAIN_SCORE_TABLE["adjacent"]

    # Check if both are in tech domains
    if mapped in TECH_DOMAINS and any(d in TECH_DOMAINS for d in profile_domains):
        return DOMAIN_SCORE_TABLE["both_tech"]

    # Different domains
    return DOMAIN_SCORE_TABLE["different"]

SKILL_SYNONYMS: dict[str, list[str]] = {
    "TypeScript": ["typescript", "ts"],
    "JavaScript": ["javascript", "js"],
    "React": ["react", "react.js", "reactjs"],
    "Vue.js": ["vue", "vue.js", "vuejs"],
    "Angular": ["angular", "angularjs"],
    "Next.js": ["next.js", "nextjs", "next"],
    "Node.js": ["node.js", "nodejs", "node"],
    "Express": ["express", "express.js", "expressjs"],
    "GraphQL": ["graphql"],
    "PostgreSQL": ["postgresql", "postgres", "pg"],
    "MySQL": ["mysql"],
    "MongoDB": ["mongodb", "mongo"],
    "Redis": ["redis"],
    "AWS": ["aws", "amazon web services", "ec2", "s3", "lambda"],
    "GCP": ["gcp", "google cloud"],
    "Azure": ["azure", "microsoft azure"],
    "Docker": ["docker", "containerization"],
    "Kubernetes": ["kubernetes", "k8s"],
    "Terraform": ["terraform", "iac"],
    "Python": ["python"],
    "Java": ["java"],
    "Go": ["go", "golang"],
    "Rust": ["rust"],
    "C++": ["c++", "cpp"],
    "Ruby": ["ruby"],
    "Rails": ["rails", "ruby on rails"],
    "Django": ["django"],
    "Spring Boot": ["spring boot", "spring", "springboot"],
    "Swift": ["swift"],
    "Kotlin": ["kotlin"],
    "Flutter": ["flutter"],
    "Dart": ["dart"],
    "React Native": ["react native"],
    "SQL": ["sql"],
    "Kafka": ["kafka", "apache kafka"],
    "Spark": ["spark", "apache spark", "pyspark"],
    "Airflow": ["airflow", "apache airflow"],
    "TensorFlow": ["tensorflow", "tf"],
    "PyTorch": ["pytorch"],
    "Tailwind": ["tailwind", "tailwindcss"],
    "CSS": ["css", "css3"],
    "SCSS": ["scss", "sass"],
    "Salesforce": ["salesforce", "sfdc"],
    "COBOL": ["cobol"],
    "PHP": ["php"],
    "Laravel": ["laravel"],
}

def normalize_skill(skill: str) -> str:
    lower = skill.strip().lower()
    for canonical, synonyms in SKILL_SYNONYMS.items():
        if lower in synonyms or lower == canonical.lower():
            return canonical
    return skill.strip()

SKILL_ADJACENCY = {
    # Frontend frameworks
    ("React", "Vue.js"): True,
    ("React", "Angular"): True,
    ("Vue.js", "Angular"): True,
    ("React", "Svelte"): True,
    ("Vue.js", "Svelte"): True,
    ("Angular", "Svelte"): True,
    ("React", "Next.js"): True,
    ("Vue.js", "Nuxt.js"): True,
    ("Next.js", "Nuxt.js"): True,
    ("Svelte", "SvelteKit"): True,

    # Python web frameworks
    ("Django", "Flask"): True,
    ("Django", "FastAPI"): True,
    ("Flask", "FastAPI"): True,
    ("Django", "Celery"): True,
    ("Flask", "Celery"): True,

    # Java ecosystem
    ("Java", "Kotlin"): True,
    ("Java", "Scala"): True,
    ("Kotlin", "Scala"): True,
    ("Java", "Spring Boot"): True,
    ("Kotlin", "Spring Boot"): True,
    ("Java", "Micronaut"): True,
    ("Kotlin", "Micronaut"): True,

    # JS backend
    ("Node.js", "Express"): True,
    ("Node.js", "Nest.js"): True,
    ("Express", "Nest.js"): True,
    ("Node.js", "Deno"): True,

    # Languages
    ("TypeScript", "JavaScript"): True,
    ("Go", "Rust"): True,
    ("Python", "Ruby"): True,

    # Cloud providers
    ("AWS", "GCP"): True,
    ("AWS", "Azure"): True,
    ("GCP", "Azure"): True,

    # Containers
    ("Docker", "Kubernetes"): True,

    # Relational databases
    ("PostgreSQL", "MySQL"): True,
    ("PostgreSQL", "MariaDB"): True,
    ("PostgreSQL", "SQL Server"): True,
    ("MySQL", "MariaDB"): True,
    ("MySQL", "SQL Server"): True,
    ("MariaDB", "SQL Server"): True,

    # NoSQL databases
    ("MongoDB", "DynamoDB"): True,
    ("MongoDB", "CouchDB"): True,
    ("DynamoDB", "CouchDB"): True,

    # Message queues
    ("Kafka", "RabbitMQ"): True,
    ("Kafka", "SQS"): True,
    ("Kafka", "Redis Streams"): True,
    ("RabbitMQ", "SQS"): True,
    ("RabbitMQ", "Redis Streams"): True,
    ("SQS", "Redis Streams"): True,

    # Infrastructure as Code
    ("Terraform", "Pulumi"): True,
    ("Terraform", "CloudFormation"): True,
    ("Terraform", "Ansible"): True,
    ("Pulumi", "CloudFormation"): True,
    ("Pulumi", "Ansible"): True,
    ("CloudFormation", "Ansible"): True,

    # CI/CD
    ("Jenkins", "GitHub Actions"): True,
    ("Jenkins", "GitLab CI"): True,
    ("Jenkins", "CircleCI"): True,
    ("Jenkins", "ArgoCD"): True,
    ("GitHub Actions", "GitLab CI"): True,
    ("GitHub Actions", "CircleCI"): True,
    ("GitHub Actions", "ArgoCD"): True,
    ("GitLab CI", "CircleCI"): True,
    ("GitLab CI", "ArgoCD"): True,
    ("CircleCI", "ArgoCD"): True,

    # Monitoring
    ("Prometheus", "Grafana"): True,
    ("Prometheus", "Datadog"): True,
    ("Prometheus", "New Relic"): True,
    ("Grafana", "Datadog"): True,
    ("Grafana", "New Relic"): True,
    ("Datadog", "New Relic"): True,

    # Data processing
    ("Spark", "Flink"): True,
    ("Spark", "Beam"): True,
    ("Flink", "Beam"): True,

    # Data orchestration
    ("Airflow", "Prefect"): True,
    ("Airflow", "Dagster"): True,
    ("Prefect", "Dagster"): True,

    # Mobile iOS
    ("Swift", "SwiftUI"): True,
    ("Swift", "UIKit"): True,
    ("SwiftUI", "UIKit"): True,

    # Mobile Android
    ("Kotlin", "Jetpack Compose"): True,

    # Cross-platform
    ("React Native", "Flutter"): True,

    # CSS
    ("Tailwind", "SCSS"): True,
    ("Tailwind", "CSS-in-JS"): True,
    ("SCSS", "CSS-in-JS"): True,

    # Testing
    ("Jest", "Mocha"): True,
    ("Jest", "Playwright"): True,
    ("Jest", "Cypress"): True,
    ("Jest", "Selenium"): True,
    ("Mocha", "Playwright"): True,
    ("Mocha", "Cypress"): True,
    ("Mocha", "Selenium"): True,
    ("Playwright", "Cypress"): True,
    ("Playwright", "Selenium"): True,
    ("Cypress", "Selenium"): True,

    # Business Intelligence
    ("Tableau", "Power BI"): True,
    ("Tableau", "Looker"): True,
    ("Tableau", "Metabase"): True,
    ("Power BI", "Looker"): True,
    ("Power BI", "Metabase"): True,
    ("Looker", "Metabase"): True,

    # Data Warehouses
    ("Snowflake", "BigQuery"): True,
    ("Snowflake", "Redshift"): True,
    ("BigQuery", "Redshift"): True,

    # ETL
    ("dbt", "Fivetran"): True,

    # Machine Learning
    ("TensorFlow", "PyTorch"): True,
    ("TensorFlow", "scikit-learn"): True,
    ("TensorFlow", "XGBoost"): True,
    ("PyTorch", "scikit-learn"): True,
    ("PyTorch", "XGBoost"): True,
    ("scikit-learn", "XGBoost"): True,

    # Analytics
    ("Amplitude", "Mixpanel"): True,
    ("Amplitude", "Google Analytics"): True,
    ("Mixpanel", "Google Analytics"): True,

    # Project management
    ("Jira", "Linear"): True,
    ("Jira", "Asana"): True,
    ("Jira", "Trello"): True,
    ("Linear", "Asana"): True,
    ("Linear", "Trello"): True,
    ("Asana", "Trello"): True,

    # CRM
    ("Salesforce", "HubSpot"): True,
    ("Salesforce", "Pipedrive"): True,
    ("Salesforce", "Zoho CRM"): True,
    ("HubSpot", "Pipedrive"): True,
    ("HubSpot", "Zoho CRM"): True,
    ("Pipedrive", "Zoho CRM"): True,

    # Ads
    ("Google Ads", "Meta Ads"): True,
    ("Google Ads", "LinkedIn Ads"): True,
    ("Meta Ads", "LinkedIn Ads"): True,

    # ATS
    ("Greenhouse", "Lever"): True,
    ("Greenhouse", "Workable"): True,
    ("Lever", "Workable"): True,

    # HRIS
    ("Workday", "BambooHR"): True,
    ("Workday", "SAP SuccessFactors"): True,
    ("Workday", "Darwinbox"): True,
    ("BambooHR", "SAP SuccessFactors"): True,
    ("BambooHR", "Darwinbox"): True,
    ("SAP SuccessFactors", "Darwinbox"): True,

    # ERP
    ("SAP", "Oracle"): True,
    ("SAP", "NetSuite"): True,
    ("SAP", "Tally"): True,
    ("Oracle", "NetSuite"): True,
    ("Oracle", "Tally"): True,
    ("NetSuite", "Tally"): True,

    # Support/Service
    ("Zendesk", "Freshdesk"): True,
    ("Zendesk", "Intercom"): True,
    ("Zendesk", "ServiceNow"): True,
    ("Freshdesk", "Intercom"): True,
    ("Freshdesk", "ServiceNow"): True,
    ("Intercom", "ServiceNow"): True,

    # Customer Success
    ("Gainsight", "ChurnZero"): True,
    ("Gainsight", "Totango"): True,
    ("ChurnZero", "Totango"): True,
}

def are_skills_adjacent(skill_a: str, skill_b: str) -> bool:
    """Check if two skills are adjacent (compatible/similar)."""
    if skill_a == skill_b:
        return True
    return SKILL_ADJACENCY.get((skill_a, skill_b), False) or SKILL_ADJACENCY.get((skill_b, skill_a), False)

INDIA_CITIES = {
    "bangalore", "bengaluru", "mumbai", "delhi", "new delhi",
    "hyderabad", "pune", "chennai", "kolkata", "goa",
    "noida", "gurgaon", "gurugram", "ahmedabad", "jaipur",
    "kochi", "thiruvananthapuram", "indore", "chandigarh",
}

LIGHTGBM_PARAMS = {
    "objective": "regression",
    "boosting_type": "gbdt",
    "num_leaves": 50,
    "learning_rate": 0.05,
    "n_estimators": 200,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.9,
    "bagging_freq": 5,
    "max_depth": 6,
    "random_state": 42,
    "verbose": -1,
}
