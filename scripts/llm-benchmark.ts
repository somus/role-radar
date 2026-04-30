/**
 * LLM Provider Benchmark — Speed, Cost, and Scoring Accuracy
 *
 * Usage:
 *   GEMINI_API_KEY=AI... bun run scripts/llm-benchmark.ts
 */

// ─── Baseline Scores (human-determined ground truth) ────────────────────────

type BaselineScore = {
  jobId: string;
  skills: number;
  seniority: number;
  domain: number;
  location: number;
  composite: number;
  overqualified: boolean;
  reasoning: string;
};

const BASELINES: BaselineScore[] = [
  {
    jobId: "job_1",
    skills: 90,
    seniority: 95,
    domain: 40,
    location: 100,
    composite: 86,
    overqualified: false,
    reasoning: "Strong skill match (TS/Node/PG/GraphQL/Redis). Seniority perfect. Payments not in profile domains. Bangalore matches.",
  },
  {
    jobId: "job_2",
    skills: 50,
    seniority: 20,
    domain: 0,
    location: 40,
    composite: 34,
    overqualified: true,
    reasoning: "React matches but frontend-only role. 10yr vs 2yr required = massively overqualified. Crypto = dealbreaker. Mumbai not preferred.",
  },
  {
    jobId: "job_3",
    skills: 70,
    seniority: 85,
    domain: 50,
    location: 100,
    composite: 78,
    overqualified: false,
    reasoning: "TS/AWS/K8s match, Go/Terraform gaps. Staff level fits. Dev tools adjacent to Enterprise SaaS. Remote matches.",
  },
  {
    jobId: "job_4",
    skills: 85,
    seniority: 70,
    domain: 90,
    location: 100,
    composite: 87,
    overqualified: false,
    reasoning: "React/Node/PG/GraphQL match. 10yr vs 5yr slightly over but not flagged. Education is primary domain. Bangalore matches.",
  },
  {
    jobId: "job_5",
    skills: 15,
    seniority: 5,
    domain: 10,
    location: 30,
    composite: 16,
    overqualified: true,
    reasoning: "Python secondary, no Airflow/BigQuery. Junior 0-2yr vs 10yr = massively overqualified. No domain match. Delhi not preferred.",
  },
  { jobId: "job_6", skills: 80, seniority: 90, domain: 70, location: 100, composite: 84, overqualified: false,
    reasoning: "Good TS/React/Node match. Senior level fits. SaaS platform = Enterprise SaaS domain. Remote." },
  { jobId: "job_7", skills: 30, seniority: 15, domain: 20, location: 60, composite: 32, overqualified: true,
    reasoning: "Java/Spring not in skillset. Junior role, 10yr = overqualified. Healthcare no match. Hyderabad not preferred." },
  { jobId: "job_8", skills: 75, seniority: 85, domain: 60, location: 100, composite: 79, overqualified: false,
    reasoning: "React/TS/AWS match, missing Terraform depth. Staff level fits. DevOps adjacent. Bangalore matches." },
  { jobId: "job_9", skills: 40, seniority: 30, domain: 10, location: 50, composite: 36, overqualified: true,
    reasoning: "iOS/Swift not in skillset. Mid-level but overqualified. Gaming no match. Pune is India but not preferred." },
  { jobId: "job_10", skills: 85, seniority: 80, domain: 80, location: 100, composite: 85, overqualified: false,
    reasoning: "Node/GraphQL/PG/Redis match. Senior architect fits. E-commerce adjacent to Enterprise SaaS. Remote." },
  { jobId: "job_11", skills: 20, seniority: 10, domain: 5, location: 40, composite: 20, overqualified: true,
    reasoning: "PHP/Laravel not in skillset. Intern level, massively overqualified. Real estate no match. Chennai not preferred." },
  { jobId: "job_12", skills: 70, seniority: 75, domain: 85, location: 100, composite: 78, overqualified: false,
    reasoning: "React/Node match, missing Python ML. Senior fits. EdTech = Education domain. Bangalore matches." },
  { jobId: "job_13", skills: 60, seniority: 50, domain: 30, location: 100, composite: 59, overqualified: false,
    reasoning: "Some TS/React overlap but Rust/systems focus. Mid-level below seniority. Fintech partial. Remote." },
  { jobId: "job_14", skills: 10, seniority: 10, domain: 0, location: 20, composite: 11, overqualified: true,
    reasoning: "C++/embedded not in skillset. Junior, massively overqualified. Automotive no match. Detroit not preferred." },
  { jobId: "job_15", skills: 90, seniority: 95, domain: 75, location: 100, composite: 90, overqualified: false,
    reasoning: "TS/React/Node/GraphQL/PG/K8s all match. Senior-Staff perfect. Enterprise SaaS exact match. Bangalore." },
  { jobId: "job_16", skills: 45, seniority: 40, domain: 15, location: 70, composite: 43, overqualified: true,
    reasoning: "Some React overlap but mainly Android/Kotlin. Mid-level, overqualified. Social media no match. Mumbai." },
  { jobId: "job_17", skills: 80, seniority: 85, domain: 50, location: 100, composite: 79, overqualified: false,
    reasoning: "TS/Node/PG/Docker match. Senior fits. Logistics not primary but Enterprise adjacent. Remote." },
  { jobId: "job_18", skills: 55, seniority: 60, domain: 40, location: 80, composite: 57, overqualified: false,
    reasoning: "Some Node/AWS overlap but heavy data eng (Spark/Kafka). Senior fits but different specialization. Bangalore hybrid." },
  { jobId: "job_19", skills: 25, seniority: 20, domain: 0, location: 30, composite: 21, overqualified: true,
    reasoning: "Ruby/Rails not in skillset. Junior, massively overqualified. Crypto = dealbreaker. Singapore." },
  { jobId: "job_20", skills: 85, seniority: 90, domain: 90, location: 100, composite: 89, overqualified: false,
    reasoning: "React/Node/GraphQL/PG/Redis all match. Senior-Staff fits. LMS/Education exact domain. Bangalore." },
  { jobId: "job_21", skills: 35, seniority: 30, domain: 20, location: 100, composite: 43, overqualified: true,
    reasoning: "Salesforce/Apex not in skillset. Mid-level, overqualified. CRM partial Enterprise match. Remote." },
  { jobId: "job_22", skills: 75, seniority: 80, domain: 60, location: 100, composite: 77, overqualified: false,
    reasoning: "TS/React/Node/AWS match. Senior fits. HR Tech adjacent to Enterprise SaaS. Remote." },
  { jobId: "job_23", skills: 50, seniority: 45, domain: 35, location: 60, composite: 48, overqualified: false,
    reasoning: "Some React/TS overlap but Vue.js/PHP main stack. Mid-senior below level. Travel partial. Goa." },
  { jobId: "job_24", skills: 5, seniority: 5, domain: 0, location: 10, composite: 5, overqualified: true,
    reasoning: "COBOL/mainframe completely unrelated. Entry level, massively overqualified. Banking ops. Rural US." },
  { jobId: "job_25", skills: 88, seniority: 90, domain: 85, location: 100, composite: 90, overqualified: false,
    reasoning: "TS/React/Node/GraphQL/PG/AWS/K8s all match. Staff level fits. Enterprise SaaS exact. Bangalore." },
];

// ─── Test Data ──────────────────────────────────────────────────────────────

const SAMPLE_PROFILE = `<profile>
  <roles>Senior Backend Engineer, Fullstack Software Engineer</roles>
  <skills_primary>TypeScript, React, Node.js, GraphQL, PostgreSQL</skills_primary>
  <skills_secondary>AWS, Docker, Kubernetes, Redis, Python</skills_secondary>
  <seniority>Senior</seniority>
  <experience_years>10</experience_years>
  <domains>Education, Enterprise SaaS</domains>
  <preferences>
    <locations>Bangalore, Remote</locations>
    <remote>true</remote>
  </preferences>
  <career_intent>Looking for senior/staff roles at product companies with strong engineering culture</career_intent>
  <dealbreakers>No startups under 20 people, no cryptocurrency companies</dealbreakers>
</profile>`;

const SAMPLE_JOBS = [
  {
    id: "job_1",
    title: "Senior Backend Engineer",
    company: "Stripe",
    location: "Bangalore, India",
    description: `About the role:
We're looking for a Senior Backend Engineer to build and scale our payment infrastructure serving millions of merchants worldwide.

Responsibilities:
- Design, build, and maintain high-throughput APIs processing billions of dollars in payments
- Work across the stack with TypeScript, Node.js, and PostgreSQL
- Architect distributed systems with strong consistency guarantees
- Collaborate with product and platform teams to ship features end-to-end
- Participate in on-call rotations for critical payment systems

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
    id: "job_2",
    title: "Frontend Developer",
    company: "CryptoTrade Labs",
    location: "Mumbai, India",
    description: `Join our fast-growing 8-person team building the next generation crypto trading dashboard!

We're a seed-stage startup disrupting decentralized finance. You'll own the entire React frontend — from real-time trading charts to portfolio analytics.

What you'll do:
- Build responsive, pixel-perfect trading interfaces with React and TailwindCSS
- Integrate with Web3 wallets (MetaMask, WalletConnect) and blockchain APIs
- Implement real-time price feeds and order book visualizations
- Ship fast — we deploy multiple times per day

Requirements:
- 2+ years of React experience
- Strong CSS/TailwindCSS skills
- Comfortable with a fast-paced, ambiguous startup environment
- Interest in cryptocurrency and DeFi

Compensation: Competitive equity package + token allocation`,
  },
  {
    id: "job_3",
    title: "Staff Platform Engineer",
    company: "Atlassian",
    location: "Remote",
    description: `About the team:
Platform Engineering at Atlassian powers the infrastructure behind Jira, Confluence, and Bitbucket — tools used by millions of developers worldwide.

The role:
As a Staff Platform Engineer, you'll lead the design and implementation of our cloud-native infrastructure, directly impacting the developer experience for hundreds of internal engineers and millions of external users.

What you'll do:
- Design and implement cloud-native infrastructure using Kubernetes, Terraform, and Go
- Lead cross-team technical initiatives and drive architectural decisions
- Mentor senior engineers and establish platform engineering best practices
- Build internal developer platforms that accelerate product team velocity
- Define SLOs and reliability standards for critical infrastructure

Requirements:
- 10+ years of software engineering experience, with 5+ in platform/infrastructure roles
- Deep expertise in Kubernetes, container orchestration, and cloud platforms (AWS preferred)
- Strong programming skills in Go and/or TypeScript
- Experience leading technical initiatives across multiple teams
- Excellent written and verbal communication skills

Benefits: Fully remote, team retreats, learning budget, equity refresh`,
  },
  {
    id: "job_4",
    title: "Full Stack Developer",
    company: "Learnify (EdTech)",
    location: "Bangalore, India",
    description: `About Learnify:
We're building the learning management system used by 5 million students across 200 universities in India. Our platform handles live classes, assignments, grading, and student analytics.

The role:
Full stack developer working across our React frontend and Node.js backend, building features that directly impact how students learn.

Responsibilities:
- Build and maintain full-stack features with React, Node.js, and PostgreSQL
- Design and implement real-time features (live polls, chat, collaborative editing) using WebSockets
- Build REST and GraphQL APIs serving our web and mobile clients
- Optimize database queries and implement caching strategies for scale
- Work closely with product and design teams on user-facing features

Requirements:
- 5+ years of full-stack development experience
- Strong proficiency in React, Node.js, and PostgreSQL
- Experience building real-time features (WebSocket, SSE)
- Familiarity with REST and GraphQL API design
- Education technology or EdTech domain experience preferred

Nice to have:
- Experience with video streaming infrastructure
- Background in data analytics or learning analytics
- AWS/cloud deployment experience`,
  },
  {
    id: "job_5",
    title: "Junior Python Developer",
    company: "DataFlow Analytics",
    location: "Delhi, India (On-site)",
    description: `About us:
DataFlow Analytics is a 50-person data consulting firm helping enterprises build data pipelines and analytics platforms.

Entry-level position:
We're looking for a junior developer to join our data engineering team. You'll work alongside senior engineers building ETL pipelines for enterprise clients.

What you'll do:
- Build and maintain data pipelines using Python and Apache Airflow
- Write SQL queries and manage datasets in BigQuery and Snowflake
- Assist with data quality monitoring and alerting
- Document data models and pipeline configurations
- Participate in code reviews and learn from senior team members

Requirements:
- 0-2 years of professional experience (new graduates welcome)
- Bachelor's or Master's degree in Computer Science or related field
- Basic proficiency in Python and SQL
- Familiarity with data concepts (ETL, data warehousing)
- Willingness to learn and grow in a collaborative environment

Nice to have:
- Coursework or projects in data engineering
- Exposure to cloud platforms (GCP, AWS)
- Knowledge of dbt, Spark, or other data tools`,
  },
  {
    id: "job_6", title: "Senior Fullstack Engineer", company: "Freshworks", location: "Remote",
    description: `About Freshworks:
We're a global SaaS company building customer engagement tools used by 60,000+ businesses worldwide. Our platform handles CRM, helpdesk, and marketing automation.

The role:
Senior Fullstack Engineer working on our core engagement platform, building features that help businesses connect with their customers.

Responsibilities:
- Design and implement full-stack features with React, TypeScript, and Node.js
- Build and optimize REST APIs serving our multi-tenant SaaS platform
- Write complex PostgreSQL queries and design efficient database schemas
- Build reusable React component libraries used across product lines
- Participate in architecture reviews and mentor mid-level engineers

Requirements:
- 8+ years of software engineering experience
- Strong proficiency in React, TypeScript, and Node.js
- Experience with PostgreSQL and REST API design
- Understanding of multi-tenant SaaS architecture patterns

Nice to have:
- Enterprise SaaS product experience
- Experience with Redis caching and message queues
- GraphQL API design experience`,
  },
  {
    id: "job_7", title: "Junior Java Developer", company: "MedTech Solutions", location: "Hyderabad, India",
    description: `About MedTech Solutions:
We build electronic health record (EHR) systems used by 500+ hospitals across India. Our platform manages patient records, appointments, billing, and clinical workflows.

Entry-level position:
We're looking for a junior Java developer to join our backend team building REST APIs for our healthcare records management system.

What you'll do:
- Build and maintain REST APIs using Java and Spring Boot
- Write SQL queries and manage MySQL database schemas
- Implement HIPAA-compliant data handling and encryption
- Write unit tests and participate in code reviews
- Assist senior developers with feature implementation

Requirements:
- 0-2 years of professional experience (fresh graduates welcome)
- Proficiency in Java and basic Spring Boot knowledge
- Understanding of SQL and relational databases
- Bachelor's degree in Computer Science or related field

Nice to have:
- Healthcare domain knowledge
- Experience with Docker containers
- Familiarity with microservice architecture`,
  },
  {
    id: "job_8", title: "Staff DevOps Engineer", company: "Zoho", location: "Bangalore, India",
    description: `About Zoho:
Zoho is a global technology company offering 55+ business applications serving 100M+ users. We run our own data centers and cloud infrastructure across multiple continents.

The role:
As Staff DevOps Engineer, you'll lead our DevOps transformation initiative, designing and implementing CI/CD pipelines and cloud infrastructure for our product engineering teams.

Responsibilities:
- Design and manage production Kubernetes clusters across multiple regions
- Build and maintain CI/CD pipelines using GitHub Actions and ArgoCD
- Automate infrastructure provisioning with Terraform and Ansible
- Implement monitoring, alerting, and incident response procedures
- Build internal developer platform tools with TypeScript and React dashboards
- Mentor senior engineers and establish DevOps best practices across teams

Requirements:
- 10+ years of software engineering experience, 5+ in DevOps/platform roles
- Deep expertise in Kubernetes, container orchestration, and AWS
- Strong proficiency in Docker, Terraform, and infrastructure-as-code
- Scripting skills in TypeScript or Python
- Experience with monitoring tools (Prometheus, Grafana, PagerDuty)

Nice to have:
- React experience for internal tooling dashboards
- Multi-cloud deployment experience (AWS, GCP, Azure)
- Security engineering and compliance experience`,
  },
  {
    id: "job_9", title: "iOS Developer", company: "GameStudio X", location: "Pune, India",
    description: `About GameStudio X:
We're an indie game studio with 3 hit titles on the App Store (10M+ combined downloads). We specialize in casual puzzle and strategy games for iOS.

The role:
Build and optimize mobile games for iOS. You'll work directly with our game designer and artist to ship polished gaming experiences.

Responsibilities:
- Develop game mechanics and UI using Swift and UIKit/SwiftUI
- Implement physics simulations and particle effects with SpriteKit/Metal
- Optimize rendering performance for smooth 60fps gameplay on older devices
- Integrate Game Center leaderboards, achievements, and in-app purchases
- Profile and fix memory leaks, frame drops, and battery drain issues

Requirements:
- 3+ years of iOS development experience with Swift
- Experience with UIKit, SpriteKit, or similar game frameworks
- Understanding of game physics, collision detection, and animation
- Published game or interactive app on the App Store
- Strong understanding of iOS performance profiling tools

Nice to have:
- Experience with Metal or SceneKit for 3D rendering
- Shader programming experience
- Background in game design or interactive media`,
  },
  {
    id: "job_10", title: "Senior Solutions Architect", company: "Shopify", location: "Remote",
    description: `About Shopify:
We power commerce for millions of merchants worldwide. Our platform handles $200B+ in annual GMV across web, mobile, and point-of-sale channels.

The role:
As Senior Solutions Architect, you'll design the next generation of our e-commerce platform architecture, building scalable microservices that power merchant storefronts and checkout flows.

Responsibilities:
- Design and implement scalable microservice architecture with Node.js and TypeScript
- Build high-performance GraphQL APIs serving millions of merchant storefronts
- Architect data models in PostgreSQL with Redis caching for sub-100ms response times
- Lead technical design reviews and publish architecture decision records
- Collaborate with product, data, and infrastructure teams on cross-cutting concerns
- Build prototype implementations to validate architectural decisions

Requirements:
- 8+ years of software engineering with 3+ in architecture roles
- Deep expertise in Node.js, TypeScript, and distributed systems design
- Production experience with GraphQL, PostgreSQL, and Redis
- Understanding of event-driven architectures and message queues
- Track record of designing systems that handle 10K+ requests/second

Nice to have:
- E-commerce or marketplace platform experience
- Experience with Kubernetes and cloud-native deployment
- Performance optimization and load testing expertise`,
  },
  {
    id: "job_11", title: "PHP Intern", company: "RealtyApp", location: "Chennai, India",
    description: `About RealtyApp:
We're a 15-person startup building a property listing and virtual tour platform for the Indian real estate market. Founded in 2025, we've onboarded 200+ property developers.

Internship position:
3-month internship with possible full-time conversion. You'll work alongside our small engineering team building property listing features.

What you'll do:
- Build property search and listing features using PHP and Laravel
- Create database queries and manage MySQL schemas for property data
- Implement basic frontend components with Blade templates
- Write API endpoints for our mobile app integration
- Assist with deployment and server maintenance

Requirements:
- Currently enrolled in or recently graduated from CS/IT program
- Basic knowledge of PHP and SQL
- Understanding of HTML, CSS, and basic JavaScript
- Eagerness to learn in a fast-paced startup environment

Nice to have:
- Any prior web development projects
- Familiarity with Laravel framework
- Basic understanding of REST APIs`,
  },
  {
    id: "job_12", title: "Senior ML Engineer", company: "EduAI", location: "Bangalore, India",
    description: `About EduAI:
We're building AI-powered personalized learning experiences for K-12 students. Our recommendation engine analyzes learning patterns to suggest optimal study paths, exercises, and content.

The role:
Senior ML Engineer bridging our machine learning models with production systems. You'll work across the full ML lifecycle from training to serving.

Responsibilities:
- Build and optimize recommendation models using Python, PyTorch, and TensorFlow
- Design and implement model serving infrastructure with Node.js APIs
- Build React-based dashboards for model performance monitoring and A/B testing
- Create data pipelines for training data collection and feature engineering
- Collaborate with educators and learning scientists to improve model accuracy
- Implement real-time inference for adaptive learning features

Requirements:
- 5+ years of software engineering, 3+ in ML/AI roles
- Strong Python skills with PyTorch or TensorFlow
- Production experience with React and Node.js for ML tooling
- Understanding of recommendation systems and collaborative filtering
- Experience with model evaluation, A/B testing, and experiment tracking

Nice to have:
- EdTech or education domain experience
- Experience with NLP for educational content analysis
- Knowledge of AWS SageMaker or similar ML platforms`,
  },
  {
    id: "job_13", title: "Systems Engineer (Rust)", company: "CryptoSafe Infra", location: "Remote",
    description: `About CryptoSafe Infra:
We provide institutional-grade trading infrastructure for cryptocurrency exchanges. Our matching engine processes 100K+ orders per second with sub-microsecond latency.

The role:
Systems Engineer building high-performance trading infrastructure in Rust. You'll work on the core matching engine, risk management systems, and real-time data feeds.

Responsibilities:
- Design and implement low-latency order matching engine in Rust
- Build WebSocket APIs for real-time market data streaming
- Implement risk management and position tracking systems
- Build TypeScript monitoring dashboards for system health and trading metrics
- Optimize for minimal GC pauses, cache efficiency, and network throughput
- Participate in on-call rotation for trading infrastructure

Requirements:
- 5+ years of systems programming experience
- Strong proficiency in Rust with production deployment experience
- Deep understanding of networking, concurrency, and memory management
- Experience with WebSocket protocols and binary serialization
- Understanding of financial trading systems and order book mechanics

Nice to have:
- Fintech or cryptocurrency exchange experience
- Experience with FPGA or kernel bypass networking
- TypeScript/React for monitoring tools`,
  },
  {
    id: "job_14", title: "Embedded C++ Developer", company: "AutoDrive Corp", location: "Detroit, USA",
    description: `About AutoDrive Corp:
We're building Level 4 autonomous driving systems for commercial vehicles. Our ADAS platform is deployed in 10,000+ trucks across North America.

The role:
Embedded C++ developer working on Advanced Driver Assistance Systems (ADAS) firmware that runs on custom ECUs in commercial vehicles.

Responsibilities:
- Develop real-time ADAS firmware in C++17 targeting ARM Cortex processors
- Implement sensor fusion algorithms for camera, LiDAR, and radar data
- Write CAN bus communication protocols for inter-ECU messaging
- Ensure compliance with automotive safety standards (ISO 26262 ASIL-D)
- Write hardware-in-the-loop (HIL) tests and simulation test suites
- Debug timing issues and optimize for real-time performance constraints

Requirements:
- 2+ years of embedded systems development
- Strong C++17 proficiency with RTOS experience (FreeRTOS, QNX)
- Knowledge of CAN bus protocols and automotive communication standards
- Understanding of ISO 26262 functional safety requirements
- EE or CS degree required

Nice to have:
- Experience with sensor fusion or computer vision algorithms
- Familiarity with AUTOSAR architecture
- Knowledge of vehicle dynamics and control systems`,
  },
  {
    id: "job_15", title: "Staff Software Engineer", company: "Atlassian", location: "Bangalore, India",
    description: `About Atlassian:
We build collaboration tools (Jira, Confluence, Bitbucket) used by millions of software teams worldwide. Our Bangalore office is one of our largest engineering hubs.

The role:
Staff Software Engineer leading the development of next-generation collaboration features. You'll work across our platform, driving architectural decisions that impact all product lines.

Responsibilities:
- Lead design and implementation of full-stack features with TypeScript, React, Node.js, and GraphQL
- Architect scalable systems with PostgreSQL, Redis, and event-driven patterns
- Drive technical strategy and publish architecture decision records
- Lead cross-team initiatives spanning 3-4 engineering teams
- Mentor senior engineers and conduct technical interviews
- Deploy and operate services on Kubernetes with AWS infrastructure

Requirements:
- 10+ years of software engineering experience
- Expert-level TypeScript, React, Node.js, and GraphQL
- Deep experience with PostgreSQL, caching strategies, and distributed systems
- Production Kubernetes and AWS experience
- Track record of leading cross-team technical initiatives
- Enterprise SaaS experience required

Nice to have:
- Developer tools or collaboration platform experience
- Experience with real-time collaboration features (CRDTs, OT)
- Open-source contributions`,
  },
  {
    id: "job_16", title: "Android Developer", company: "SocialBuzz", location: "Mumbai, India",
    description: `About SocialBuzz:
We're building India's next social media platform focused on short-form video content and local communities. 5M+ monthly active users and growing 30% month-over-month.

The role:
Android developer building features for our social media app. You'll work on content feeds, video playback, and community features.

Responsibilities:
- Build social media features for Android using Kotlin and Jetpack Compose
- Implement video recording, editing, and playback with ExoPlayer
- Design UI with Material Design 3 and custom animations
- Build shared components with React Native for cross-platform features
- Implement MVVM architecture with Coroutines and Flow
- Optimize app startup time, memory usage, and battery consumption

Requirements:
- 3-5 years of Android development experience
- Strong Kotlin skills with Jetpack Compose and modern Android architecture
- Published app on Google Play Store
- Experience with video playback (ExoPlayer) or camera APIs
- Social platform or content-heavy app experience preferred

Nice to have:
- React Native experience for cross-platform modules
- Experience with real-time messaging (WebSocket, Firebase)
- Understanding of content recommendation algorithms`,
  },
  {
    id: "job_17", title: "Senior Backend Engineer", company: "LogiTrack", location: "Remote",
    description: `About LogiTrack:
We build logistics tracking and supply chain visibility software for enterprise shippers and carriers. Our platform tracks 2M+ shipments daily across 50 countries.

The role:
Senior Backend Engineer building the core tracking and event processing platform. You'll work on real-time shipment tracking, ETD prediction, and carrier integration APIs.

Responsibilities:
- Design and build backend services with TypeScript, Node.js, and PostgreSQL
- Implement event-driven architecture with Redis Streams and message queues
- Build carrier integration APIs (REST, EDI, webhook) for 100+ logistics providers
- Design Docker-based microservice deployment with health checks and circuit breakers
- Optimize database queries for time-series shipment tracking data
- Implement rate limiting, retry logic, and error handling for external API integrations

Requirements:
- 7+ years of backend engineering experience
- Strong TypeScript and Node.js proficiency
- Production PostgreSQL experience with complex queries and indexing
- Docker and containerized deployment experience
- Experience with event-driven architectures and message queues

Nice to have:
- Supply chain, logistics, or transportation domain experience
- Experience with Redis Streams or Apache Kafka
- GraphQL API design experience`,
  },
  {
    id: "job_18", title: "Data Engineer", company: "InsightMetrics", location: "Bangalore, India (Hybrid)",
    description: `About InsightMetrics:
We're a product analytics company helping SaaS businesses understand user behavior. Our platform processes 10B+ events per day and serves analytics dashboards to 5,000+ companies.

The role:
Data Engineer building and maintaining our data pipeline infrastructure. You'll work on ingestion, transformation, and serving layers of our analytics platform.

Responsibilities:
- Build and optimize data pipelines with Apache Spark and Apache Kafka
- Design data warehouse schemas in AWS Redshift and S3 data lakes
- Build Node.js APIs for serving aggregated analytics to our React dashboards
- Implement real-time streaming analytics for live user behavior tracking
- Monitor pipeline health, data quality, and SLA compliance
- Optimize query performance for interactive analytics dashboards

Requirements:
- 5+ years of data engineering experience
- Strong Apache Spark and Kafka proficiency
- Experience with SQL, data modeling, and warehouse design
- AWS experience (S3, Redshift, EMR, Glue)
- Node.js API development experience

Nice to have:
- React dashboard building experience
- Experience with real-time analytics (Flink, Druid)
- Product analytics or SaaS metrics domain knowledge`,
  },
  {
    id: "job_19", title: "Junior Ruby Developer", company: "CoinSwap", location: "Singapore",
    description: `About CoinSwap:
We're a Singapore-based cryptocurrency exchange with $50M daily trading volume. Our platform supports spot trading, margin trading, and staking for 200+ crypto assets.

The role:
Junior Ruby developer joining our trading platform team. You'll work on order management, wallet integration, and trading features.

Responsibilities:
- Build trading features with Ruby on Rails and PostgreSQL
- Implement WebSocket feeds for real-time order book and price updates
- Integrate with blockchain APIs for wallet deposits and withdrawals
- Write Redis-based caching for frequently accessed market data
- Build admin tools for compliance and transaction monitoring
- Participate in code reviews and learn from senior engineers

Requirements:
- 1-3 years of Ruby on Rails experience
- Basic PostgreSQL and SQL knowledge
- Understanding of WebSocket protocols
- Interest in cryptocurrency and DeFi ecosystems required

Nice to have:
- Experience with Redis caching
- Basic understanding of blockchain concepts
- Financial or trading platform experience`,
  },
  {
    id: "job_20", title: "Senior Product Engineer", company: "Byju's", location: "Bangalore, India",
    description: `About Byju's:
We're India's largest EdTech company with 150M+ registered learners. Our learning management platform serves students from K-12 through competitive exam preparation.

The role:
Senior Product Engineer building learning platform features that directly impact millions of student experiences. Full stack role with emphasis on user-facing product development.

Responsibilities:
- Build and maintain learning platform features with React, Node.js, and GraphQL
- Design PostgreSQL schemas for course content, progress tracking, and assessments
- Implement real-time collaboration features for live tutoring sessions
- Build video integration for recorded lectures and interactive content
- Optimize Redis caching for personalized content delivery
- Work closely with product managers and learning designers on feature specs

Requirements:
- 7+ years of full-stack development experience
- Strong React, Node.js, GraphQL, and PostgreSQL proficiency
- Experience building real-time features (WebSocket, SSE)
- Education technology experience required
- Understanding of video streaming and content delivery

Nice to have:
- Experience with recommendation systems or personalization
- Mobile-responsive design expertise
- Performance optimization for high-traffic applications`,
  },
  {
    id: "job_21", title: "Salesforce Developer", company: "CRMPro", location: "Remote",
    description: `About CRMPro:
We're a Salesforce consulting partner with 50+ enterprise clients. We customize Salesforce implementations for sales, service, and marketing cloud deployments.

The role:
Salesforce Developer building custom solutions for enterprise clients. You'll work on CRM customizations, integrations, and Lightning components.

Responsibilities:
- Develop custom Salesforce applications using Apex and Lightning Web Components
- Build integrations between Salesforce and external systems using REST/SOAP APIs
- Customize Sales Cloud, Service Cloud, and Marketing Cloud implementations
- Write SOQL queries and design efficient data models in Salesforce
- Implement workflow automation with Process Builder and Flow
- Participate in client requirement gathering and solution design sessions

Requirements:
- 3-5 years of Salesforce development experience
- Salesforce Platform Developer I certification (PD1)
- Proficiency in Apex, SOQL, and Lightning Web Components
- Experience with Salesforce REST and SOAP API integrations
- Understanding of Salesforce governor limits and best practices

Nice to have:
- Salesforce Platform Developer II certification
- JavaScript and web development background
- CRM consulting experience with enterprise clients`,
  },
  {
    id: "job_22", title: "Senior Frontend Engineer", company: "HRTech Solutions", location: "Remote",
    description: `About HRTech Solutions:
We build HR analytics and workforce planning software for enterprises with 1,000+ employees. Our dashboards help HR leaders make data-driven decisions about hiring, retention, and compensation.

The role:
Senior Frontend Engineer building complex analytics dashboards and data visualization features. You'll work closely with our design team and backend API developers.

Responsibilities:
- Build HR analytics dashboards with React, TypeScript, and D3.js/Recharts
- Implement Backend-for-Frontend (BFF) layer with Node.js and GraphQL
- Ensure WCAG 2.1 AA accessibility compliance across all dashboard components
- Optimize rendering performance for large datasets (10K+ rows, real-time updates)
- Deploy and manage frontend infrastructure on AWS (CloudFront, S3, Lambda@Edge)
- Establish frontend testing practices (unit, integration, visual regression)

Requirements:
- 6+ years of frontend engineering experience
- Expert React and TypeScript skills
- Node.js BFF layer development experience
- Experience with data visualization libraries
- Understanding of accessibility standards (WCAG 2.1)

Nice to have:
- HR Tech or Enterprise SaaS experience
- GraphQL API design and consumption
- Performance optimization for data-heavy applications`,
  },
  {
    id: "job_23", title: "Full Stack Developer", company: "TravelEase", location: "Goa, India",
    description: `About TravelEase:
We're a travel booking platform focused on domestic tourism in India. Our platform connects travelers with boutique hotels, homestays, and experience providers across 100+ destinations.

The role:
Full Stack Developer building booking, search, and payment features for our travel platform. You'll work across frontend and backend.

Responsibilities:
- Build search and booking features with Vue.js frontend and PHP/Laravel backend
- Implement payment gateway integrations (Razorpay, Stripe) with MySQL transaction handling
- Build search optimization with Elasticsearch for property and experience discovery
- Implement review and rating systems with image upload and moderation
- Build admin dashboards for property owners to manage listings
- Optimize page load performance for mobile-first experience

Requirements:
- 4+ years of full-stack development experience
- Proficiency in Vue.js or React for frontend development
- Strong PHP/Laravel backend experience with MySQL
- Payment integration experience (Razorpay, Stripe, or similar)
- Understanding of search optimization techniques

Nice to have:
- Travel industry or marketplace platform experience
- Experience with Elasticsearch or Algolia
- Mobile-responsive design and PWA development`,
  },
  {
    id: "job_24", title: "COBOL Programmer", company: "LegacyBank Corp", location: "Rural Ohio, USA",
    description: `About LegacyBank Corp:
We're a regional bank with 200 branches across Ohio and Indiana. Our core banking systems run on IBM z/OS mainframes processing 5M+ transactions daily.

The role:
COBOL Programmer maintaining and enhancing our legacy core banking transaction processing systems. Critical role ensuring the reliability of our payment and accounting infrastructure.

Responsibilities:
- Maintain and enhance COBOL programs for transaction processing, account management, and regulatory reporting
- Write JCL scripts for batch processing and job scheduling
- Manage DB2 database queries and stored procedures for financial data
- Implement regulatory compliance updates (SOX, GLBA, BSA/AML)
- Debug production issues in real-time during banking hours
- Document system changes and maintain operations runbooks

Requirements:
- 2+ years of COBOL programming experience on IBM mainframes
- Proficiency in JCL, VSAM, and DB2
- Understanding of banking operations (general ledger, ACH, wire transfers)
- Experience with batch processing and job scheduling (CA-7, TWS)
- Knowledge of banking regulatory requirements

Nice to have:
- CICS online transaction processing experience
- Experience with mainframe modernization projects
- Understanding of SOX compliance and audit requirements`,
  },
  {
    id: "job_25", title: "Staff Platform Engineer", company: "Chargebee", location: "Bangalore, India",
    description: `About Chargebee:
We're a leading subscription management and recurring billing platform serving 5,000+ SaaS companies worldwide. Our platform processes $10B+ in subscription revenue annually.

The role:
Staff Platform Engineer building the infrastructure that powers our subscription billing engine. You'll lead the platform team and drive architectural decisions for our core systems.

Responsibilities:
- Architect and build subscription management microservices with TypeScript and Node.js
- Design React-based admin dashboards for subscription analytics and configuration
- Build high-throughput billing pipelines with PostgreSQL and event-driven architecture
- Implement GraphQL APIs for merchant integrations and partner ecosystem
- Manage Kubernetes deployments on AWS with GitOps (ArgoCD)
- Define SLOs, error budgets, and reliability standards for billing infrastructure
- Lead platform team of 5 engineers, conduct architecture reviews

Requirements:
- 10+ years of software engineering experience
- Expert TypeScript, React, Node.js, and GraphQL proficiency
- Deep PostgreSQL experience with partitioning, replication, and performance tuning
- Production Kubernetes and AWS infrastructure experience
- Experience with billing, payments, or financial systems
- Enterprise SaaS platform experience required

Nice to have:
- Subscription/recurring billing domain expertise
- Experience with event sourcing or CQRS patterns
- PCI DSS compliance experience`,
  },
];

// ─── Scoring Prompt ─────────────────────────────────────────────────────────

const SCORING_PROMPT = `You are a job fit scorer. Score each job against the candidate profile on 4 dimensions (0-100):
- skills: how well the candidate's skills match job requirements
- seniority: whether the candidate's seniority level is appropriate (low score if overqualified or underqualified)
- domain: how well the candidate's domain experience matches
- location: whether location/remote preferences match

Also provide:
- composite: weighted average (skills×0.4 + seniority×0.2 + domain×0.15 + location×0.25)
- overqualified: true if the candidate is significantly overqualified for this role
- matches: array of 2-4 key matching skills/experiences (strings)
- gaps: array of 1-3 missing requirements or concerns (strings)

Return a JSON array with one object per job. Each object must have: jobId, skills, seniority, domain, location, composite, overqualified, matches, gaps.`;

const SINGLE_JOB_PROMPT = `You are a job fit scorer. Score this job against the candidate profile on 4 dimensions (0-100):
- skills: how well the candidate's skills match job requirements
- seniority: whether the candidate's seniority level is appropriate (low score if overqualified or underqualified)
- domain: how well the candidate's domain experience matches
- location: whether location/remote preferences match

Also provide:
- composite: weighted average (skills×0.4 + seniority×0.2 + domain×0.15 + location×0.25)
- overqualified: true if the candidate is significantly overqualified for this role
- matches: array of 2-4 key matching skills/experiences (strings)
- gaps: array of 1-3 missing requirements or concerns (strings)

Return a single JSON object with: jobId, skills, seniority, domain, location, composite, overqualified, matches, gaps.`;

// ─── Types ──────────────────────────────────────────────────────────────────

type ProviderConfig = {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  isGemini?: boolean;
};

type JobScore = {
  jobId: string;
  skills: number;
  seniority: number;
  domain: number;
  location: number;
  composite: number;
  overqualified: boolean;
  matches?: string[];
  gaps?: string[];
};

type BenchmarkResult = {
  provider: string;
  model: string;
  test: string;
  inputTokens: number;
  outputTokens: number;
  totalTimeMs: number;
  firstTokenMs: number | null;
  tokensPerSec: number;
  jsonValid: boolean;
  jobsScored: number;
  scores: JobScore[];
  error?: string;
};

// ─── Input Builders ─────────────────────────────────────────────────────────

function generateJobs(count: number): typeof SAMPLE_JOBS {
  return SAMPLE_JOBS.slice(0, count);
}

function buildBatchInput(jobs: typeof SAMPLE_JOBS): string {
  const jobsXml = jobs.map(
    (j) => `  <job id="${j.id}">
    <title>${j.title}</title>
    <company>${j.company}</company>
    <location>${j.location}</location>
    <description>${j.description}</description>
  </job>`
  ).join("\n");

  return `${SCORING_PROMPT}\n\n${SAMPLE_PROFILE}\n\n<jobs>\n${jobsXml}\n</jobs>`;
}

// ─── API Callers ────────────────────────────────────────────────────────────

type CallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalMs: number;
  firstTokenMs: number | null;
};

const REQUEST_TIMEOUT_MS = 120_000;

async function callOpenAICompatible(config: ProviderConfig, prompt: string): Promise<CallResult> {
  const start = performance.now();
  let firstTokenMs: number | null = null;

  const body: any = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  };

  body.response_format = { type: "json_object" };

  const progressInterval = setInterval(() => {
    const elapsed = Math.round((performance.now() - start) / 1000);
    process.stdout.write(`\r    ⏳ ${elapsed}s elapsed...`);
  }, 5000);

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    clearInterval(progressInterval);
    process.stdout.write("\r" + " ".repeat(40) + "\r");
    throw err;
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${config.name} ${res.status}: ${err.substring(0, 300)}`);
  }

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const data = JSON.parse(line.slice(6));
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) {
          if (firstTokenMs === null) firstTokenMs = performance.now() - start;
          text += delta;
        }
        if (data.usage) {
          inputTokens = data.usage.prompt_tokens ?? 0;
          outputTokens = data.usage.completion_tokens ?? 0;
        }
      } catch {}
    }
  }

  clearInterval(progressInterval);
  process.stdout.write("\r" + " ".repeat(40) + "\r");
  const totalMs = performance.now() - start;
  if (!inputTokens) inputTokens = Math.ceil(prompt.length / 4);
  if (!outputTokens) outputTokens = Math.ceil(text.length / 4);
  return { text, inputTokens, outputTokens, totalMs, firstTokenMs };
}

async function callGemini(config: ProviderConfig, prompt: string): Promise<CallResult> {
  const start = performance.now();

  const genConfig: any = { responseMimeType: "application/json" };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: genConfig,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  const totalMs = performance.now() - start;
  const text = data.candidates[0].content.parts[0].text;
  const inputTokens = data.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
  return { text, inputTokens, outputTokens, totalMs, firstTokenMs: null };
}

async function callProvider(config: ProviderConfig, prompt: string): Promise<CallResult> {
  if (config.isGemini) return callGemini(config, prompt);
  return callOpenAICompatible(config, prompt);
}

// ─── Score Parsing & Validation ─────────────────────────────────────────────

function parseScores(text: string): JobScore[] {
  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/^﻿/, "")
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, "")
      .trim();

    // Try direct parse first
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try extracting JSON from mixed content
      const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})\s*$/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      parsed = JSON.parse(jsonMatch[1]!);
    }

    let arr: any[];
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (typeof parsed === "object") {
      const scoreArrayKey = Object.keys(parsed).find(
        (k) => Array.isArray(parsed[k]) && parsed[k].length > 0 && typeof parsed[k][0] === "object" && ("skills" in parsed[k][0] || "composite" in parsed[k][0])
      );
      if (scoreArrayKey) {
        arr = parsed[scoreArrayKey];
      } else {
        arr = [parsed];
      }
    } else {
      return [];
    }

    return arr
      .filter((s: any) => s && (typeof s.skills === "number" || typeof s.composite === "number" || typeof s.skills_score === "number"))
      .map((s: any) => ({
        jobId: String(s.jobId ?? s.job_id ?? s.id ?? s.jobID ?? ""),
        skills: Number(s.skills ?? s.skills_score ?? 0),
        seniority: Number(s.seniority ?? s.seniority_score ?? 0),
        domain: Number(s.domain ?? s.domain_score ?? 0),
        location: Number(s.location ?? s.location_score ?? 0),
        composite: Number(s.composite ?? s.composite_score ?? s.overall ?? 0),
        overqualified: Boolean(s.overqualified ?? s.is_overqualified ?? false),
        matches: Array.isArray(s.matches) ? s.matches : [],
        gaps: Array.isArray(s.gaps) ? s.gaps : [],
      }));
  } catch (e) {
    console.log(`    ⚠ JSON parse failed: ${(e as Error).message.substring(0, 80)}`);
    console.log(`    ⚠ Raw output (first 200 chars): ${text.substring(0, 200)}`);
    return [];
  }
}

function scoreAccuracy(actual: JobScore[], baselines: BaselineScore[]): { avgDeviation: number; matched: number; total: number; oqCorrect: number; perJob: { jobId: string; deviation: number; overqualifiedMatch: boolean }[] } {
  const perJob: { jobId: string; deviation: number; overqualifiedMatch: boolean }[] = [];

  for (const baseline of baselines) {
    const match = actual.find(
      (a) => a.jobId === baseline.jobId || a.jobId === baseline.jobId.replace("job_", "")
    );
    if (!match) continue;

    const dims = ["skills", "seniority", "domain", "location", "composite"] as const;
    const deviations = dims.map((d) => Math.abs(match[d] - baseline[d]));
    const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;

    perJob.push({
      jobId: baseline.jobId,
      deviation: Math.round(avgDev * 10) / 10,
      overqualifiedMatch: match.overqualified === baseline.overqualified,
    });
  }

  const avgDeviation = perJob.length > 0
    ? Math.round((perJob.reduce((a, b) => a + b.deviation, 0) / perJob.length) * 10) / 10
    : 0;
  const oqCorrect = perJob.filter((p) => p.overqualifiedMatch).length;
  return { avgDeviation, matched: perJob.length, total: baselines.length, oqCorrect, perJob };
}

// ─── Benchmark Runner ───────────────────────────────────────────────────────

const BATCH_SIZES = [5, 10, 15, 20, 25];

async function runBenchmark(config: ProviderConfig): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const size of BATCH_SIZES) {
    console.log(`  [${config.name}] Batch ${size} jobs...`);
    try {
      const jobs = generateJobs(size);
      const prompt = buildBatchInput(jobs);
      const res = await callProvider(config, prompt);
      const scores = parseScores(res.text);
      const tokPerSec = res.outputTokens / (res.totalMs / 1000);
      const perJob = Math.round(res.totalMs / size);

      results.push({
        provider: config.name, model: config.model, test: `batch_${size}`,
        inputTokens: res.inputTokens, outputTokens: res.outputTokens,
        totalTimeMs: Math.round(res.totalMs),
        firstTokenMs: res.firstTokenMs ? Math.round(res.firstTokenMs) : null,
        tokensPerSec: Math.round(tokPerSec),
        jsonValid: scores.length > 0, jobsScored: scores.length, scores,
      });
      console.log(`    → ${Math.round(res.totalMs)}ms (${perJob}ms/job), ${Math.round(tokPerSec)} tok/s, JSON: ${scores.length > 0 ? "✓" : "✗"} (${scores.length}/${size} jobs)`);
    } catch (err: any) {
      console.log(`    → ERROR: ${err.message.substring(0, 100)}`);
      results.push({
        provider: config.name, model: config.model, test: `batch_${size}`,
        inputTokens: 0, outputTokens: 0, totalTimeMs: 0, firstTokenMs: null,
        tokensPerSec: 0, jsonValid: false, jobsScored: 0, scores: [], error: err.message,
      });
    }
  }

  return results;
}

// ─── Results Display ────────────────────────────────────────────────────────

function printResults(allResults: BenchmarkResult[]) {
  console.log("\n" + "═".repeat(130));
  console.log("  BATCH SIZE BENCHMARK RESULTS");
  console.log("═".repeat(130));

  // ── Per-provider batch size comparison ──
  const providers = [...new Set(allResults.map((r) => r.provider))];

  for (const provider of providers) {
    const providerResults = allResults.filter((r) => r.provider === provider);
    console.log(`\n┌── ${provider} (${providerResults[0]?.model}) ${"─".repeat(80)}`);
    console.log(
      "│ " +
      "Batch".padEnd(8) +
      "Time".padEnd(12) +
      "Per Job".padEnd(12) +
      "Tok/s".padEnd(8) +
      "In Tokens".padEnd(12) +
      "Out Tokens".padEnd(12) +
      "JSON".padEnd(6) +
      "Scored"
    );
    console.log("│ " + "─".repeat(72));

    for (const r of providerResults) {
      if (r.error) {
        const size = r.test.replace("batch_", "");
        console.log(`│ ${size.padEnd(8)}ERROR: ${r.error.substring(0, 60)}`);
        continue;
      }
      const size = r.test.replace("batch_", "");
      const perJob = Math.round(r.totalTimeMs / (r.jobsScored || 1));
      console.log(
        "│ " +
        size.padEnd(8) +
        `${r.totalTimeMs}ms`.padEnd(12) +
        `${perJob}ms/job`.padEnd(12) +
        `${r.tokensPerSec}`.padEnd(8) +
        `${r.inputTokens}`.padEnd(12) +
        `${r.outputTokens}`.padEnd(12) +
        `${r.jsonValid ? "✓" : "✗"}`.padEnd(6) +
        `${r.jobsScored}`
      );
    }
  }

  // ── Side-by-side comparison ──
  console.log(`\n┌── Comparison: Time to score N jobs ${"─".repeat(80)}`);
  console.log("│ " + "Batch Size".padEnd(12) + providers.map(p => p.padEnd(25)).join(""));
  console.log("│ " + "─".repeat(12 + providers.length * 25));

  for (const size of BATCH_SIZES) {
    let line = `│ ${String(size).padEnd(12)}`;
    for (const provider of providers) {
      const r = allResults.find((r) => r.provider === provider && r.test === `batch_${size}`);
      if (!r || r.error) {
        line += "ERROR".padEnd(25);
      } else {
        const perJob = Math.round(r.totalTimeMs / (r.jobsScored || 1));
        line += `${r.totalTimeMs}ms (${perJob}ms/job)`.padEnd(25);
      }
    }
    console.log(line);
  }

  // ── 50-job projection ──
  console.log(`\n┌── Projected time for 50 jobs ${"─".repeat(80)}`);
  console.log("│ " + "Strategy".padEnd(20) + providers.map(p => p.padEnd(25)).join(""));
  console.log("│ " + "─".repeat(20 + providers.length * 25));

  for (const size of BATCH_SIZES) {
    const batches = Math.ceil(50 / size);
    let line = `│ ${`${batches}×${size}`.padEnd(20)}`;
    for (const provider of providers) {
      const r = allResults.find((r) => r.provider === provider && r.test === `batch_${size}`);
      if (!r || r.error) {
        line += "N/A".padEnd(25);
      } else {
        const projected = Math.round(r.totalTimeMs * batches / 1000);
        line += `~${projected}s`.padEnd(25);
      }
    }
    console.log(line);
  }

  // ── Accuracy at each batch size vs baseline ──
  console.log(`\n┌── Accuracy vs Baseline at each batch size ${"─".repeat(70)}`);
  console.log("│ " + "Batch".padEnd(8) + providers.map(p => p.padEnd(35)).join(""));
  console.log("│ " + "─".repeat(8 + providers.length * 35));

  for (const size of BATCH_SIZES) {
    let line = `│ ${String(size).padEnd(8)}`;
    for (const provider of providers) {
      const r = allResults.find((x) => x.provider === provider && x.test === `batch_${size}`);
      if (!r || r.error || r.scores.length === 0) {
        line += "N/A".padEnd(35);
        continue;
      }
      const acc = scoreAccuracy(r.scores, BASELINES);
      line += `${acc.avgDeviation} pts, oq ${acc.oqCorrect}/${acc.matched} (${acc.matched} scored)`.padEnd(35);
    }
    console.log(line);
  }

  // ── Cost Estimate ──
  console.log(`\n┌── Estimated Monthly Cost (50 jobs/day batch-scored, 10 resumes/day) ${"─".repeat(45)}`);
  console.log("│ " + "Provider".padEnd(28) + "Model".padEnd(22) + "Monthly Cost");
  console.log("│ " + "─".repeat(60));

  const pricing: Record<string, { input: number; output: number }> = {
    "Gemini 2.5 Flash Lite": { input: 0.10, output: 0.40 },
  };

  const seen = new Set<string>();
  for (const r of allResults) {
    if (seen.has(r.provider)) continue;
    seen.add(r.provider);
    const key = Object.keys(pricing).find((k) => r.provider.includes(k));
    const price = key ? pricing[key]! : null;
    if (!price) continue;
    const dailyIn = 170_000;
    const dailyOut = 42_000;
    const monthly = ((dailyIn * price.input + dailyOut * price.output) / 1_000_000) * 30;
    const costStr = price.input === 0 ? "FREE" : `$${monthly.toFixed(2)}`;
    console.log("│ " + r.provider.padEnd(28) + r.model.padEnd(22) + costStr);
  }

  console.log("│");
  console.log("└" + "─".repeat(130));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const providers: ProviderConfig[] = [];


  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: "Gemini 2.5 Flash Lite",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-2.5-flash-lite",
      apiKey: process.env.GEMINI_API_KEY,
      isGemini: true,
    });
  }

  if (providers.length === 0) {
    console.log("No API keys set. Provide:");
    console.log("  GEMINI_API_KEY=AI...            → Gemini 2.5 Flash Lite");
    process.exit(1);
  }

  console.log(`Benchmarking ${providers.length} provider(s)...\n`);

  const allResults: BenchmarkResult[] = [];

  for (const config of providers) {
    console.log(`[${config.name}] (${config.model})`);
    const results = await runBenchmark(config);
    allResults.push(...results);
  }

  printResults(allResults);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
