/**
 * Export benchmark data from llm-benchmark.ts into JSON for training pipeline.
 *
 * Usage: bun run model-training/export-benchmarks.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";

const BENCHMARK_PROFILE = {
  profile_id: 0,
  roles: ["Senior Backend Engineer", "Fullstack Software Engineer"],
  skills_primary: ["TypeScript", "React", "Node.js", "GraphQL", "PostgreSQL"],
  skills_secondary: ["AWS", "Docker", "Kubernetes", "Redis", "Python"],
  experience_years: 10,
  seniority: "Senior",
  domains: ["Education", "Enterprise SaaS"],
  preferences: {
    locations: ["Bangalore", "Remote"],
    remote: true,
    min_salary: null,
    company_sizes: [],
  },
  career_intent:
    "Looking for senior/staff roles at product companies with strong engineering culture",
  dealbreakers: [
    "No startups under 20 people",
    "No cryptocurrency companies",
  ],
};

const BASELINES = [
  { job_id: "job_1", skills: 90, seniority: 95, domain: 40, location: 100, composite: 86, overqualified: false },
  { job_id: "job_2", skills: 50, seniority: 20, domain: 0, location: 40, composite: 34, overqualified: true },
  { job_id: "job_3", skills: 70, seniority: 85, domain: 50, location: 100, composite: 78, overqualified: false },
  { job_id: "job_4", skills: 85, seniority: 70, domain: 90, location: 100, composite: 87, overqualified: false },
  { job_id: "job_5", skills: 15, seniority: 5, domain: 10, location: 30, composite: 16, overqualified: true },
  { job_id: "job_6", skills: 80, seniority: 90, domain: 70, location: 100, composite: 84, overqualified: false },
  { job_id: "job_7", skills: 30, seniority: 15, domain: 20, location: 60, composite: 32, overqualified: true },
  { job_id: "job_8", skills: 75, seniority: 85, domain: 60, location: 100, composite: 79, overqualified: false },
  { job_id: "job_9", skills: 40, seniority: 30, domain: 10, location: 50, composite: 36, overqualified: true },
  { job_id: "job_10", skills: 85, seniority: 80, domain: 80, location: 100, composite: 85, overqualified: false },
  { job_id: "job_11", skills: 20, seniority: 10, domain: 5, location: 40, composite: 20, overqualified: true },
  { job_id: "job_12", skills: 70, seniority: 75, domain: 85, location: 100, composite: 78, overqualified: false },
  { job_id: "job_13", skills: 60, seniority: 50, domain: 30, location: 100, composite: 59, overqualified: false },
  { job_id: "job_14", skills: 10, seniority: 10, domain: 0, location: 20, composite: 11, overqualified: true },
  { job_id: "job_15", skills: 90, seniority: 95, domain: 75, location: 100, composite: 90, overqualified: false },
  { job_id: "job_16", skills: 45, seniority: 40, domain: 15, location: 70, composite: 43, overqualified: true },
  { job_id: "job_17", skills: 80, seniority: 85, domain: 50, location: 100, composite: 79, overqualified: false },
  { job_id: "job_18", skills: 55, seniority: 60, domain: 40, location: 80, composite: 57, overqualified: false },
  { job_id: "job_19", skills: 25, seniority: 20, domain: 0, location: 30, composite: 21, overqualified: true },
  { job_id: "job_20", skills: 85, seniority: 90, domain: 90, location: 100, composite: 89, overqualified: false },
  { job_id: "job_21", skills: 35, seniority: 30, domain: 20, location: 100, composite: 43, overqualified: true },
  { job_id: "job_22", skills: 75, seniority: 80, domain: 60, location: 100, composite: 77, overqualified: false },
  { job_id: "job_23", skills: 50, seniority: 45, domain: 35, location: 60, composite: 48, overqualified: false },
  { job_id: "job_24", skills: 5, seniority: 5, domain: 0, location: 10, composite: 5, overqualified: true },
  { job_id: "job_25", skills: 88, seniority: 90, domain: 85, location: 100, composite: 90, overqualified: false },
];

const JOBS = [
  {
    id: "job_1", title: "Senior Backend Engineer", company: "Stripe", location: "Bangalore, India",
    seniority_hint: "Senior", role_family_hint: "backend", domain_hint: "Fintech",
    experience_years_hint: 7, remote_hint: false,
    description: `We're looking for a Senior Backend Engineer to build and scale our payment infrastructure serving millions of merchants worldwide.

Requirements:
- 7+ years of backend engineering experience
- Strong systems design and distributed systems expertise
- Production experience with TypeScript/Node.js and relational databases (PostgreSQL preferred)
- Track record of building and operating high-availability services

Nice to have:
- Experience with GraphQL APIs, Redis caching, message queues (Kafka/RabbitMQ)
- Payments or fintech domain experience
- Contributions to open-source projects`,
  },
  {
    id: "job_2", title: "Frontend Developer", company: "CryptoTrade Labs", location: "Mumbai, India",
    seniority_hint: "Junior", role_family_hint: "frontend", domain_hint: "Crypto",
    experience_years_hint: 2, remote_hint: false,
    description: `Join our fast-growing 8-person team building the next generation crypto trading dashboard!

Requirements:
- 2+ years of React experience
- Strong CSS/TailwindCSS skills
- Comfortable with a fast-paced, ambiguous startup environment
- Interest in cryptocurrency and DeFi

Nice to have:
- Web3 wallet integration experience (MetaMask, WalletConnect)`,
  },
  {
    id: "job_3", title: "Staff Platform Engineer", company: "Atlassian", location: "Remote",
    seniority_hint: "Staff", role_family_hint: "devops", domain_hint: "Developer Tools",
    experience_years_hint: 10, remote_hint: true,
    description: `Platform Engineering at Atlassian powers the infrastructure behind Jira, Confluence, and Bitbucket.

Requirements:
- 10+ years of software engineering experience, with 5+ in platform/infrastructure roles
- Deep expertise in Kubernetes, container orchestration, and cloud platforms (AWS preferred)
- Strong programming skills in Go and/or TypeScript
- Experience leading technical initiatives across multiple teams

Nice to have:
- Terraform and infrastructure-as-code experience
- Internal developer platform experience`,
  },
  {
    id: "job_4", title: "Full Stack Developer", company: "Learnify (EdTech)", location: "Bangalore, India",
    seniority_hint: "Mid", role_family_hint: "fullstack", domain_hint: "Education",
    experience_years_hint: 5, remote_hint: false,
    description: `Building the learning management system used by 5 million students across 200 universities in India.

Requirements:
- 5+ years of full-stack development experience
- Strong proficiency in React, Node.js, and PostgreSQL
- Experience building real-time features (WebSocket, SSE)
- Familiarity with REST and GraphQL API design
- Education technology or EdTech domain experience preferred

Nice to have:
- Experience with video streaming infrastructure
- AWS/cloud deployment experience`,
  },
  {
    id: "job_5", title: "Junior Python Developer", company: "DataFlow Analytics", location: "Delhi, India (On-site)",
    seniority_hint: "Junior", role_family_hint: "data", domain_hint: "Analytics",
    experience_years_hint: 0, remote_hint: false,
    description: `Entry-level position on our data engineering team building ETL pipelines for enterprise clients.

Requirements:
- 0-2 years of professional experience (new graduates welcome)
- Basic proficiency in Python and SQL
- Familiarity with data concepts (ETL, data warehousing)

Nice to have:
- Apache Airflow, BigQuery, Snowflake experience
- Cloud platforms (GCP, AWS)`,
  },
  {
    id: "job_6", title: "Senior Fullstack Engineer", company: "Freshworks", location: "Remote",
    seniority_hint: "Senior", role_family_hint: "fullstack", domain_hint: "Enterprise SaaS",
    experience_years_hint: 8, remote_hint: true,
    description: `Senior Fullstack Engineer working on our core engagement platform.

Requirements:
- 8+ years of software engineering experience
- Strong proficiency in React, TypeScript, and Node.js
- Experience with PostgreSQL and REST API design
- Understanding of multi-tenant SaaS architecture patterns

Nice to have:
- Enterprise SaaS product experience
- Redis caching and message queues
- GraphQL API design experience`,
  },
  {
    id: "job_7", title: "Junior Java Developer", company: "MedTech Solutions", location: "Hyderabad, India",
    seniority_hint: "Junior", role_family_hint: "backend", domain_hint: "Healthcare",
    experience_years_hint: 0, remote_hint: false,
    description: `Junior Java developer for our backend team building REST APIs for healthcare records management.

Requirements:
- 0-2 years of professional experience (fresh graduates welcome)
- Proficiency in Java and basic Spring Boot knowledge
- Understanding of SQL and relational databases

Nice to have:
- Healthcare domain knowledge
- Docker containers
- Microservice architecture`,
  },
  {
    id: "job_8", title: "Staff DevOps Engineer", company: "Zoho", location: "Bangalore, India",
    seniority_hint: "Staff", role_family_hint: "devops", domain_hint: "Enterprise SaaS",
    experience_years_hint: 10, remote_hint: false,
    description: `Lead our DevOps transformation initiative across product engineering teams.

Requirements:
- 10+ years of software engineering experience, 5+ in DevOps/platform roles
- Deep expertise in Kubernetes, container orchestration, and AWS
- Strong proficiency in Docker, Terraform, and infrastructure-as-code
- Scripting skills in TypeScript or Python

Nice to have:
- React experience for internal tooling dashboards
- Multi-cloud deployment experience`,
  },
  {
    id: "job_9", title: "iOS Developer", company: "GameStudio X", location: "Pune, India",
    seniority_hint: "Mid", role_family_hint: "mobile", domain_hint: "Gaming",
    experience_years_hint: 3, remote_hint: false,
    description: `Build and optimize mobile games for iOS.

Requirements:
- 3+ years of iOS development experience with Swift
- Experience with UIKit, SpriteKit, or similar game frameworks
- Understanding of game physics, collision detection, and animation
- Published game or interactive app on the App Store

Nice to have:
- Metal or SceneKit for 3D rendering
- Shader programming experience`,
  },
  {
    id: "job_10", title: "Senior Solutions Architect", company: "Shopify", location: "Remote",
    seniority_hint: "Senior", role_family_hint: "backend", domain_hint: "E-commerce",
    experience_years_hint: 8, remote_hint: true,
    description: `Design the next generation of our e-commerce platform architecture.

Requirements:
- 8+ years of software engineering with 3+ in architecture roles
- Deep expertise in Node.js, TypeScript, and distributed systems design
- Production experience with GraphQL, PostgreSQL, and Redis
- Understanding of event-driven architectures and message queues

Nice to have:
- E-commerce or marketplace platform experience
- Kubernetes and cloud-native deployment`,
  },
  {
    id: "job_11", title: "PHP Intern", company: "RealtyApp", location: "Chennai, India",
    seniority_hint: "Junior", role_family_hint: "fullstack", domain_hint: "Real Estate",
    experience_years_hint: 0, remote_hint: false,
    description: `3-month internship with possible full-time conversion at a 15-person startup.

Requirements:
- Currently enrolled in or recently graduated from CS/IT program
- Basic knowledge of PHP and SQL
- Understanding of HTML, CSS, and basic JavaScript

Nice to have:
- Laravel framework
- REST APIs`,
  },
  {
    id: "job_12", title: "Senior ML Engineer", company: "EduAI", location: "Bangalore, India",
    seniority_hint: "Senior", role_family_hint: "data", domain_hint: "Education",
    experience_years_hint: 5, remote_hint: false,
    description: `Senior ML Engineer bridging ML models with production systems for personalized learning.

Requirements:
- 5+ years of software engineering, 3+ in ML/AI roles
- Strong Python skills with PyTorch or TensorFlow
- Production experience with React and Node.js for ML tooling
- Understanding of recommendation systems and collaborative filtering

Nice to have:
- EdTech or education domain experience
- NLP for educational content analysis`,
  },
  {
    id: "job_13", title: "Systems Engineer (Rust)", company: "CryptoSafe Infra", location: "Remote",
    seniority_hint: "Mid", role_family_hint: "systems", domain_hint: "Fintech",
    experience_years_hint: 5, remote_hint: true,
    description: `Systems Engineer building high-performance trading infrastructure in Rust.

Requirements:
- 5+ years of systems programming experience
- Strong proficiency in Rust with production deployment experience
- Deep understanding of networking, concurrency, and memory management
- Experience with WebSocket protocols and binary serialization

Nice to have:
- Fintech or cryptocurrency exchange experience
- TypeScript/React for monitoring tools`,
  },
  {
    id: "job_14", title: "Embedded C++ Developer", company: "AutoDrive Corp", location: "Detroit, USA",
    seniority_hint: "Junior", role_family_hint: "systems", domain_hint: "Automotive",
    experience_years_hint: 2, remote_hint: false,
    description: `Embedded C++ developer working on ADAS firmware for commercial vehicles.

Requirements:
- 2+ years of embedded systems development
- Strong C++17 proficiency with RTOS experience (FreeRTOS, QNX)
- Knowledge of CAN bus protocols and automotive communication standards
- Understanding of ISO 26262 functional safety requirements

Nice to have:
- Sensor fusion or computer vision algorithms
- AUTOSAR architecture`,
  },
  {
    id: "job_15", title: "Staff Software Engineer", company: "Atlassian", location: "Bangalore, India",
    seniority_hint: "Staff", role_family_hint: "fullstack", domain_hint: "Enterprise SaaS",
    experience_years_hint: 10, remote_hint: false,
    description: `Staff Software Engineer leading development of next-generation collaboration features.

Requirements:
- 10+ years of software engineering experience
- Expert-level TypeScript, React, Node.js, and GraphQL
- Deep experience with PostgreSQL, caching strategies, and distributed systems
- Production Kubernetes and AWS experience
- Enterprise SaaS experience required

Nice to have:
- Developer tools or collaboration platform experience
- Real-time collaboration features (CRDTs, OT)`,
  },
  {
    id: "job_16", title: "Android Developer", company: "SocialBuzz", location: "Mumbai, India",
    seniority_hint: "Mid", role_family_hint: "mobile", domain_hint: "Social Media",
    experience_years_hint: 3, remote_hint: false,
    description: `Android developer building features for our social media app.

Requirements:
- 3-5 years of Android development experience
- Strong Kotlin skills with Jetpack Compose and modern Android architecture
- Published app on Google Play Store
- Experience with video playback (ExoPlayer) or camera APIs

Nice to have:
- React Native experience
- Real-time messaging (WebSocket, Firebase)`,
  },
  {
    id: "job_17", title: "Senior Backend Engineer", company: "LogiTrack", location: "Remote",
    seniority_hint: "Senior", role_family_hint: "backend", domain_hint: "Logistics",
    experience_years_hint: 7, remote_hint: true,
    description: `Senior Backend Engineer building core tracking and event processing platform.

Requirements:
- 7+ years of backend engineering experience
- Strong TypeScript and Node.js proficiency
- Production PostgreSQL experience with complex queries and indexing
- Docker and containerized deployment experience
- Experience with event-driven architectures and message queues

Nice to have:
- Supply chain, logistics, or transportation domain experience
- Redis Streams or Apache Kafka
- GraphQL API design experience`,
  },
  {
    id: "job_18", title: "Data Engineer", company: "InsightMetrics", location: "Bangalore, India (Hybrid)",
    seniority_hint: "Mid", role_family_hint: "data", domain_hint: "Analytics",
    experience_years_hint: 5, remote_hint: false,
    description: `Data Engineer building and maintaining data pipeline infrastructure for product analytics.

Requirements:
- 5+ years of data engineering experience
- Strong Apache Spark and Kafka proficiency
- Experience with SQL, data modeling, and warehouse design
- AWS experience (S3, Redshift, EMR, Glue)
- Node.js API development experience

Nice to have:
- React dashboard building experience
- Real-time analytics (Flink, Druid)`,
  },
  {
    id: "job_19", title: "Junior Ruby Developer", company: "CoinSwap", location: "Singapore",
    seniority_hint: "Junior", role_family_hint: "backend", domain_hint: "Crypto",
    experience_years_hint: 1, remote_hint: false,
    description: `Junior Ruby developer joining our trading platform team.

Requirements:
- 1-3 years of Ruby on Rails experience
- Basic PostgreSQL and SQL knowledge
- Understanding of WebSocket protocols
- Interest in cryptocurrency and DeFi ecosystems required

Nice to have:
- Redis caching
- Blockchain concepts`,
  },
  {
    id: "job_20", title: "Senior Product Engineer", company: "Byju's", location: "Bangalore, India",
    seniority_hint: "Senior", role_family_hint: "fullstack", domain_hint: "Education",
    experience_years_hint: 7, remote_hint: false,
    description: `Senior Product Engineer building learning platform features for millions of students.

Requirements:
- 7+ years of full-stack development experience
- Strong React, Node.js, GraphQL, and PostgreSQL proficiency
- Experience building real-time features (WebSocket, SSE)
- Education technology experience required

Nice to have:
- Recommendation systems or personalization
- Video streaming and content delivery`,
  },
  {
    id: "job_21", title: "Salesforce Developer", company: "CRMPro", location: "Remote",
    seniority_hint: "Mid", role_family_hint: "non-tech", domain_hint: "CRM",
    experience_years_hint: 3, remote_hint: true,
    description: `Salesforce Developer building custom solutions for enterprise clients.

Requirements:
- 3-5 years of Salesforce development experience
- Salesforce Platform Developer I certification (PD1)
- Proficiency in Apex, SOQL, and Lightning Web Components
- Experience with Salesforce REST and SOAP API integrations

Nice to have:
- Salesforce Platform Developer II certification
- JavaScript and web development background`,
  },
  {
    id: "job_22", title: "Senior Frontend Engineer", company: "HRTech Solutions", location: "Remote",
    seniority_hint: "Senior", role_family_hint: "frontend", domain_hint: "HR Tech",
    experience_years_hint: 6, remote_hint: true,
    description: `Senior Frontend Engineer building HR analytics dashboards and data visualization features.

Requirements:
- 6+ years of frontend engineering experience
- Expert React and TypeScript skills
- Node.js BFF layer development experience
- Experience with data visualization libraries
- Understanding of accessibility standards (WCAG 2.1)

Nice to have:
- HR Tech or Enterprise SaaS experience
- GraphQL API design and consumption`,
  },
  {
    id: "job_23", title: "Full Stack Developer", company: "TravelEase", location: "Goa, India",
    seniority_hint: "Mid", role_family_hint: "fullstack", domain_hint: "Travel",
    experience_years_hint: 4, remote_hint: false,
    description: `Full Stack Developer building booking, search, and payment features for travel platform.

Requirements:
- 4+ years of full-stack development experience
- Proficiency in Vue.js or React for frontend development
- Strong PHP/Laravel backend experience with MySQL
- Payment integration experience (Razorpay, Stripe, or similar)

Nice to have:
- Travel industry or marketplace platform experience
- Elasticsearch or Algolia`,
  },
  {
    id: "job_24", title: "COBOL Programmer", company: "LegacyBank Corp", location: "Rural Ohio, USA",
    seniority_hint: "Junior", role_family_hint: "systems", domain_hint: "Banking",
    experience_years_hint: 2, remote_hint: false,
    description: `COBOL Programmer maintaining legacy core banking transaction processing systems on IBM z/OS mainframes.

Requirements:
- 2+ years of COBOL programming experience on IBM mainframes
- Proficiency in JCL, VSAM, and DB2
- Understanding of banking operations (general ledger, ACH, wire transfers)
- Experience with batch processing and job scheduling

Nice to have:
- CICS online transaction processing
- Mainframe modernization projects`,
  },
  {
    id: "job_25", title: "Staff Platform Engineer", company: "Chargebee", location: "Bangalore, India",
    seniority_hint: "Staff", role_family_hint: "fullstack", domain_hint: "Enterprise SaaS",
    experience_years_hint: 10, remote_hint: false,
    description: `Staff Platform Engineer building the infrastructure that powers subscription billing engine.

Requirements:
- 10+ years of software engineering experience
- Expert TypeScript, React, Node.js, and GraphQL proficiency
- Deep PostgreSQL experience with partitioning, replication, and performance tuning
- Production Kubernetes and AWS infrastructure experience
- Enterprise SaaS platform experience required

Nice to have:
- Subscription/recurring billing domain expertise
- Event sourcing or CQRS patterns`,
  },
];

const outputPath = join(import.meta.dir, "data", "benchmarks.json");

const output = {
  benchmark_profile: BENCHMARK_PROFILE,
  jobs: JOBS,
  baselines: BASELINES,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`Exported ${JOBS.length} jobs, ${BASELINES.length} baselines to ${outputPath}`);
