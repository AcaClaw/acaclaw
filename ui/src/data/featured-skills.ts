/** Featured skills catalog — curated academic skills organized by category.
 *  Source: top-100-skills-by-downloads-categorized.md */

export interface FeaturedSkill {
  name: string;
  slug: string;
  author: string;
  description: string;
  url: string;
  rank?: number;
}

export interface SkillCategory {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  popular: FeaturedSkill[];
  curated: FeaturedSkill[];
}

export const FEATURED_CATEGORIES: SkillCategory[] = [
  {
    id: "literature",
    icon: "🔎",
    title: "Literature & References",
    subtitle: "Paper search, web research, content extraction, research monitoring",
    popular: [
      { name: "Summarize", slug: "steipete/summarize", author: "steipete", description: "Summarize URLs, PDFs, images, audio, and YouTube", url: "https://clawhub.ai/steipete/summarize", rank: 2 },
      { name: "Multi Search Engine", slug: "gpyAngyoujun/multi-search-engine", author: "gpyAngyoujun", description: "Multi-engine web search across 17 providers (8 CN + 9 Global)", url: "https://clawhub.ai/gpyAngyoujun/multi-search-engine", rank: 14 },
      { name: "Brave Search", slug: "steipete/brave-search", author: "steipete", description: "Web search and content extraction via Brave Search API", url: "https://clawhub.ai/steipete/brave-search", rank: 25 },
      { name: "Deep Research Pro", slug: "parags/deep-research-pro", author: "parags", description: "Multi-source deep research: searches, synthesizes, and delivers cited reports", url: "https://clawhub.ai/parags/deep-research-pro", rank: 91 },
    ],
    curated: [
      { name: "Academic Deep Research", slug: "kesslerio/academic-deep-research", author: "kesslerio", description: "Transparent, rigorous research across academic databases with full audit trail", url: "https://clawhub.ai/kesslerio/academic-deep-research" },
      { name: "Agentic Paper Digest", slug: "matanle51/agentic-paper-digest", author: "matanle51", description: "Fetch and summarize recent arXiv and Hugging Face papers automatically", url: "https://clawhub.ai/matanle51/agentic-paper-digest" },
      { name: "arXiv Watcher", slug: "rubenfb23/arxiv-watcher", author: "rubenfb23", description: "Search and summarize arXiv papers on any topic for continuous literature monitoring", url: "https://clawhub.ai/rubenfb23/arxiv-watcher" },
      { name: "Aclawdemy", slug: "nimhar/aclawdemy", author: "nimhar", description: "Academic research platform for AI agents — structured paper discovery and analysis", url: "https://clawhub.ai/nimhar/aclawdemy" },
      { name: "Book Reader", slug: "josharsh/book-reader", author: "josharsh", description: "Read and index academic books/papers in EPUB, PDF, and TXT formats", url: "https://clawhub.ai/josharsh/book-reader" },
    ],
  },
  {
    id: "writing",
    icon: "📝",
    title: "Academic Writing",
    subtitle: "Document creation, format conversion, manuscript editing, AI-writing cleanup",
    popular: [
      { name: "Nano Pdf", slug: "steipete/nano-pdf", author: "steipete", description: "Edit PDFs with natural-language instructions", url: "https://clawhub.ai/steipete/nano-pdf", rank: 11 },
      { name: "Humanizer", slug: "biostartechnology/humanizer", author: "biostartechnology", description: "Removes AI-writing signs: em dashes, AI vocabulary, inflated symbolism", url: "https://clawhub.ai/biostartechnology/humanizer", rank: 13 },
      { name: "Markdown Converter", slug: "steipete/markdown-converter", author: "steipete", description: "Converts PDF, Word, PowerPoint, Excel, HTML, CSV, and more to Markdown", url: "https://clawhub.ai/steipete/markdown-converter", rank: 50 },
      { name: "Word / DOCX", slug: "ivangdavila/word-docx", author: "ivangdavila", description: "Create, inspect, and edit DOCX files with styles, tracked changes, and tables", url: "https://clawhub.ai/ivangdavila/word-docx", rank: 79 },
    ],
    curated: [
      { name: "Academic Writing Refiner", slug: "zihan-zhu/academic-writing-refiner", author: "zihan-zhu", description: "Refine writing for top-tier venues (NeurIPS, ICLR, ICML, AAAI)", url: "https://clawhub.ai/zihan-zhu/academic-writing-refiner" },
      { name: "Academic Writing", slug: "teamolab/academic-writing", author: "teamolab", description: "Expert agent for scholarly papers, literature reviews, and methodology", url: "https://clawhub.ai/teamolab/academic-writing" },
      { name: "Academic Writer", slug: "dayunyan/academic-writer", author: "dayunyan", description: "Professional LaTeX writing assistant that understands academic conventions", url: "https://clawhub.ai/dayunyan/academic-writer" },
      { name: "Chief Editor", slug: "teamolab/chief-editor", author: "teamolab", description: "Professional chief-editor persona with user-personalized writing preferences", url: "https://clawhub.ai/teamolab/chief-editor" },
    ],
  },
  {
    id: "data-analysis",
    icon: "📊",
    title: "Data Analysis",
    subtitle: "CSV/Excel processing, data visualization, statistical workflows, surveys",
    popular: [
      { name: "Typeform", slug: "byungkyu/typeform", author: "byungkyu", description: "Typeform API: create survey forms, manage responses, and access insights", url: "https://clawhub.ai/byungkyu/typeform", rank: 92 },
      { name: "Microsoft Excel", slug: "byungkyu/microsoft-excel", author: "byungkyu", description: "Excel API: read/write workbooks, worksheets, ranges, tables, and charts", url: "https://clawhub.ai/byungkyu/microsoft-excel", rank: 96 },
    ],
    curated: [
      { name: "CSV Pipeline", slug: "gitgoodordietrying/csv-pipeline", author: "gitgoodordietrying", description: "Process, validate, and transform CSV datasets with data quality checks", url: "https://clawhub.ai/gitgoodordietrying/csv-pipeline" },
      { name: "DuckDB Explorer", slug: "camelsprout/duckdb-cli-ai-skills", author: "camelsprout", description: "Fast analytical SQL queries on local datasets without infrastructure overhead", url: "https://clawhub.ai/camelsprout/duckdb-cli-ai-skills" },
      { name: "Chart Image", slug: "dannyshmueli/chart-image", author: "dannyshmueli", description: "Generate publication-quality chart images suitable for papers and presentations", url: "https://clawhub.ai/dannyshmueli/chart-image" },
      { name: "Data Analyst", slug: "oyi77/data-analyst", author: "oyi77", description: "Data visualization, report generation, SQL queries, and spreadsheet operations", url: "https://clawhub.ai/oyi77/data-analyst" },
      { name: "Senior Data Scientist", slug: "alirezarezvani/senior-data-scientist", author: "alirezarezvani", description: "World-class data science workflows for statistical modeling and machine learning", url: "https://clawhub.ai/alirezarezvani/senior-data-scientist" },
    ],
  },
  {
    id: "lab-management",
    icon: "🧰",
    title: "Lab & Data Management",
    subtitle: "Lab notebooks, dataset organization, SOPs, reproducibility",
    popular: [],
    curated: [
      { name: "BookStack", slug: "xenofex7/bookstack", author: "xenofex7", description: "Self-hosted wiki for lab protocols, SOPs, and institutional knowledge", url: "https://clawhub.ai/xenofex7/bookstack" },
      { name: "Bear Notes", slug: "steipete/bear-notes", author: "steipete", description: "Markdown-native note-taking for lab observations and experimental logs", url: "https://clawhub.ai/steipete/bear-notes" },
      { name: "Agent Memory Ultimate", slug: "globalcaos/agent-memory-ultimate", author: "globalcaos", description: "Long-term memory system with daily logs, consolidation, and SQLite indexing", url: "https://clawhub.ai/globalcaos/agent-memory-ultimate" },
      { name: "Paperless NGX", slug: "oskarstark/paperless-ngx", author: "oskarstark", description: "Document management for lab records, consent forms, and protocol archival", url: "https://clawhub.ai/oskarstark/paperless-ngx" },
    ],
  },
  {
    id: "presentation",
    icon: "🎤",
    title: "Presentation",
    subtitle: "Slides, posters, conference talks, diagrams, audio narration",
    popular: [
      { name: "Google Slides", slug: "byungkyu/google-slides", author: "byungkyu", description: "Google Slides API: create presentations, add slides, insert and format content", url: "https://clawhub.ai/byungkyu/google-slides", rank: 89 },
      { name: "AI PPT Generator", slug: "ide-rea/ai-ppt-generator", author: "ide-rea", description: "Generate PPT presentations with Baidu AI; smart template selection", url: "https://clawhub.ai/ide-rea/ai-ppt-generator", rank: 99 },
    ],
    curated: [
      { name: "Gamma", slug: "stopmoclay/gamma", author: "stopmoclay", description: "AI-powered slide deck generator; auto-layouts content into professional presentations", url: "https://clawhub.ai/stopmoclay/gamma" },
      { name: "Mermaid", slug: "jarekbird/mermaid", author: "jarekbird", description: "Generate diagrams (flowcharts, sequence, class) from text for technical presentations", url: "https://clawhub.ai/jarekbird/mermaid" },
      { name: "Excalidraw Flowchart", slug: "swiftlysingh/excalidraw-flowchart", author: "swiftlysingh", description: "Generate flowcharts and diagrams from natural language", url: "https://clawhub.ai/swiftlysingh/excalidraw-flowchart" },
      { name: "Figma", slug: "maddiedreese/figma", author: "maddiedreese", description: "Professional design analysis and asset export for high-quality presentation materials", url: "https://clawhub.ai/maddiedreese/figma" },
    ],
  },
  {
    id: "workflows",
    icon: "⚡",
    title: "Workflows & Automation",
    subtitle: "Pipelines, browser automation, repetitive task elimination, batch processing",
    popular: [
      { name: "Agent Browser", slug: "TheSethRose/agent-browser", author: "TheSethRose", description: "Rust-based headless browser automation CLI: navigate, click, type, snapshot", url: "https://clawhub.ai/TheSethRose/agent-browser", rank: 3 },
      { name: "Automation Workflows", slug: "JK-0001/automation-workflows", author: "JK-0001", description: "Design no-code automation workflows with Zapier, Make, and n8n", url: "https://clawhub.ai/JK-0001/automation-workflows", rank: 23 },
      { name: "Browser Use", slug: "ShawnPana/browser-use", author: "ShawnPana", description: "Browser automation for web testing, form filling, screenshots, data extraction", url: "https://clawhub.ai/ShawnPana/browser-use", rank: 41 },
    ],
    curated: [
      { name: "n8n", slug: "thomasansems/n8n", author: "thomasansems", description: "Low-code workflow automation for research data pipelines and integrations", url: "https://clawhub.ai/thomasansems/n8n" },
      { name: "Casual Cron", slug: "gostlightai/casual-cron", author: "gostlightai", description: "Schedule automated tasks with natural language", url: "https://clawhub.ai/gostlightai/casual-cron" },
    ],
  },
  {
    id: "notes",
    icon: "🗒️",
    title: "Notes & PKM",
    subtitle: "Personal knowledge management, research note-taking, idea capture",
    popular: [
      { name: "Notion", slug: "steipete/notion", author: "steipete", description: "Notion API: create and manage pages, databases, and blocks", url: "https://clawhub.ai/steipete/notion", rank: 15 },
      { name: "Obsidian", slug: "steipete/obsidian", author: "steipete", description: "Work with Obsidian vaults and automate via obsidian-cli", url: "https://clawhub.ai/steipete/obsidian", rank: 16 },
      { name: "Apple Notes", slug: "steipete/apple-notes", author: "steipete", description: "Manage Apple Notes via memo CLI on macOS", url: "https://clawhub.ai/steipete/apple-notes", rank: 57 },
    ],
    curated: [
      { name: "Better Notion", slug: "tyler6204/better-notion", author: "tyler6204", description: "Full CRUD for Notion pages and databases; ideal for structured research wikis", url: "https://clawhub.ai/tyler6204/better-notion" },
      { name: "BookStack", slug: "xenofex7/bookstack", author: "xenofex7", description: "Self-hosted wiki for structured lab knowledge, SOPs, and team documentation", url: "https://clawhub.ai/xenofex7/bookstack" },
    ],
  },
  {
    id: "calendar",
    icon: "📅",
    title: "Calendar & Scheduling",
    subtitle: "Deadline tracking, conference scheduling, meeting coordination",
    popular: [
      { name: "CalDAV Calendar", slug: "Asleep123/caldav-calendar", author: "Asleep123", description: "Sync and query CalDAV calendars (iCloud, Google, Fastmail, Nextcloud)", url: "https://clawhub.ai/Asleep123/caldav-calendar", rank: 64 },
    ],
    curated: [
      { name: "Google Calendar", slug: "adrianmiller99/google-calendar", author: "adrianmiller99", description: "Manage academic calendar events, deadlines, and collaborative lab schedules", url: "https://clawhub.ai/adrianmiller99/google-calendar" },
      { name: "Advanced Calendar", slug: "toughworm/advanced-calendar", author: "toughworm", description: "Natural language calendar querying and management for complex scheduling", url: "https://clawhub.ai/toughworm/advanced-calendar" },
      { name: "BRW Plan My Day", slug: "brianrwagner/brw-plan-my-day", author: "brianrwagner", description: "Energy-optimized time-blocked daily plan based on circadian rhythm and GTD", url: "https://clawhub.ai/brianrwagner/brw-plan-my-day" },
    ],
  },
  {
    id: "email",
    icon: "📧",
    title: "Email & Communication",
    subtitle: "Research correspondence, journal submission, collaboration email",
    popular: [
      { name: "Gmail", slug: "byungkyu/gmail", author: "byungkyu", description: "Gmail API: read, send, and manage emails, threads, labels, and drafts", url: "https://clawhub.ai/byungkyu/gmail", rank: 46 },
      { name: "Outlook", slug: "byungkyu/outlook", author: "byungkyu", description: "Outlook integration via Microsoft Graph: email, calendar, contacts", url: "https://clawhub.ai/byungkyu/outlook", rank: 69 },
    ],
    curated: [
      { name: "Gmail Secretary", slug: "officialdelta/gmail-secretary", author: "officialdelta", description: "Gmail triage: classification, label application, and draft reply generation", url: "https://clawhub.ai/officialdelta/gmail-secretary" },
      { name: "Email Triage", slug: "aronchick/expanso-email-triage", author: "aronchick", description: "AI-powered email triage with calendar sync and automated response drafting", url: "https://clawhub.ai/aronchick/expanso-email-triage" },
    ],
  },
  {
    id: "meetings",
    icon: "🗓️",
    title: "Meetings & Notes",
    subtitle: "Lab meeting transcription, team coordination, action items",
    popular: [
      { name: "OpenAI Whisper", slug: "steipete/openai-whisper", author: "steipete", description: "Local speech-to-text with Whisper CLI (no API key)", url: "https://clawhub.ai/steipete/openai-whisper", rank: 18 },
      { name: "Slack", slug: "steipete/slack", author: "steipete", description: "Control Slack: send messages, react, pin items, manage threads", url: "https://clawhub.ai/steipete/slack", rank: 39 },
    ],
    curated: [
      { name: "Meeting Autopilot", slug: "tkuehnl/meeting-autopilot", author: "tkuehnl", description: "Turn meeting transcripts into action items, decisions, and follow-up emails", url: "https://clawhub.ai/tkuehnl/meeting-autopilot" },
      { name: "Meeting Summarizer", slug: "claudiodrusus/meeting-summarizer", author: "claudiodrusus", description: "Transform raw meeting transcripts into structured, actionable summaries", url: "https://clawhub.ai/claudiodrusus/meeting-summarizer" },
    ],
  },
  {
    id: "teaching",
    icon: "🎓",
    title: "Teaching & Outreach",
    subtitle: "Course materials, adaptive assessments, lesson plans, public engagement",
    popular: [],
    curated: [
      { name: "Adaptive Learning Agents", slug: "vedantsingh60/adaptive-learning-agents", author: "vedantsingh60", description: "Real-time adaptive learning that adjusts to learner errors and corrections", url: "https://clawhub.ai/vedantsingh60/adaptive-learning-agents" },
      { name: "AdaptiveTest", slug: "woodstocksoftware/adaptivetest", author: "woodstocksoftware", description: "Adaptive testing engine with IRT/CAT and AI-powered question generation", url: "https://clawhub.ai/woodstocksoftware/adaptivetest" },
      { name: "Open Lesson", slug: "dncolomer/open-lesson", author: "dncolomer", description: "AI agent for structured course delivery via the openLesson tutoring platform", url: "https://clawhub.ai/dncolomer/open-lesson" },
      { name: "Curriculum Generator", slug: "tarasinghrajput/curriculum-generator", author: "tarasinghrajput", description: "Intelligent curriculum generation with strict step enforcement", url: "https://clawhub.ai/tarasinghrajput/curriculum-generator" },
    ],
  },
  {
    id: "study",
    icon: "📚",
    title: "Study & Learning",
    subtitle: "Active recall, spaced repetition, practice tests, structured reading",
    popular: [],
    curated: [
      { name: "Anki Connect", slug: "gyroninja/anki-connect", author: "gyroninja", description: "Interface with Anki to create, review, and manage spaced-repetition flashcard decks", url: "https://clawhub.ai/gyroninja/anki-connect" },
      { name: "Learn Cog", slug: "nitishgargiitd/learn-cog", author: "nitishgargiitd", description: "Explains concepts five different ways for deep understanding and retention", url: "https://clawhub.ai/nitishgargiitd/learn-cog" },
      { name: "Daily Questions", slug: "daijo-bu/daily-questions", author: "daijo-bu", description: "Daily self-improving questionnaire that refines study focus and learning habits", url: "https://clawhub.ai/daijo-bu/daily-questions" },
    ],
  },
  {
    id: "career",
    icon: "💼",
    title: "Career & Development",
    subtitle: "CV/resume, academic job market, grant applications, professional growth",
    popular: [],
    curated: [
      { name: "ID CV Resume Creator", slug: "rotorstar/id-cv-resume-creator", author: "rotorstar", description: "Create free interactive digital CVs and resumes with structured profiles", url: "https://clawhub.ai/rotorstar/id-cv-resume-creator" },
      { name: "LinkedIn Profile Optimizer", slug: "brianrwagner/brw-linkedin-profile-optimizer", author: "brianrwagner", description: "Audit and rewrite LinkedIn profile for academic or industry connections", url: "https://clawhub.ai/brianrwagner/brw-linkedin-profile-optimizer" },
      { name: "Founder Coach", slug: "goforu/founder-coach", author: "goforu", description: "AI coaching for researchers transitioning to industry or founding startups", url: "https://clawhub.ai/goforu/founder-coach" },
    ],
  },
];

export const DISCIPLINE_CATEGORIES: SkillCategory[] = [
  {
    id: "computer-science",
    icon: "💻",
    title: "Computer Science",
    subtitle: "Algorithms, version control, containers, knowledge graphs, dev tooling",
    popular: [
      { name: "GitHub", slug: "steipete/github", author: "steipete", description: "Interact with GitHub using gh CLI: issues, PRs, CI runs, advanced queries", url: "https://clawhub.ai/steipete/github", rank: 5 },
      { name: "Ontology", slug: "oswalpalash/ontology", author: "oswalpalash", description: "Typed knowledge graph for structured agent memory and composable skills", url: "https://clawhub.ai/oswalpalash/ontology", rank: 6 },
      { name: "Docker Essentials", slug: "Arnarsson/docker-essentials", author: "Arnarsson", description: "Essential Docker commands for container management and debugging", url: "https://clawhub.ai/Arnarsson/docker-essentials", rank: 65 },
      { name: "Git Essentials", slug: "Arnarsson/git-essentials", author: "Arnarsson", description: "Essential Git commands for version control, branching, and collaboration", url: "https://clawhub.ai/Arnarsson/git-essentials", rank: 88 },
    ],
    curated: [
      { name: "Academic Research", slug: "rogersuperbuilderalpha/academic-research", author: "rogersuperbuilderalpha", description: "Search academic papers via OpenAlex API (free, no key) — strong CS/ML coverage", url: "https://clawhub.ai/rogersuperbuilderalpha/academic-research" },
      { name: "Academic Research Hub", slug: "anisafifi/academic-research-hub", author: "anisafifi", description: "Search papers, download documents, extract citations from major CS databases", url: "https://clawhub.ai/anisafifi/academic-research-hub" },
    ],
  },
  {
    id: "ai-ml",
    icon: "🤖",
    title: "AI & Machine Learning",
    subtitle: "Model training, NLP, computer vision, LLM tools, paper discovery",
    popular: [],
    curated: [
      { name: "Agentic Paper Digest", slug: "matanle51/agentic-paper-digest", author: "matanle51", description: "Auto-fetch and summarize recent arXiv and Hugging Face AI/ML papers", url: "https://clawhub.ai/matanle51/agentic-paper-digest" },
      { name: "arXiv Batch Reporter", slug: "xukp20/arxiv-batch-reporter", author: "xukp20", description: "Build collection reports from arXiv paper batches with model-generated summaries", url: "https://clawhub.ai/xukp20/arxiv-batch-reporter" },
      { name: "Academic Deep Research", slug: "kesslerio/academic-deep-research", author: "kesslerio", description: "Rigorous multi-step research across academic databases with full audit trail", url: "https://clawhub.ai/kesslerio/academic-deep-research" },
    ],
  },
  {
    id: "biology",
    icon: "🧬",
    title: "Biology & Life Sciences",
    subtitle: "Genomics, ecology, molecular biology, biochemistry",
    popular: [],
    curated: [
      { name: "BioSkills", slug: "djemec/bioskills", author: "djemec", description: "425 bioinformatics tools: RNA-seq, single-cell, variant calling, metagenomics", url: "https://clawhub.ai/djemec/bioskills" },
      { name: "Lobster Bio Dev", slug: "cewinharhar/lobster-bio-dev", author: "cewinharhar", description: "Multi-agent bioinformatics engine for collaborative genomics pipelines", url: "https://clawhub.ai/cewinharhar/lobster-bio-dev" },
      { name: "ADMET Prediction", slug: "huifer/admet-prediction", author: "huifer", description: "ADMET prediction for drug/compound candidates — ADME and toxicity screening", url: "https://clawhub.ai/huifer/admet-prediction" },
    ],
  },
  {
    id: "chemistry",
    icon: "🧪",
    title: "Chemistry",
    subtitle: "Molecular search, spectral analysis, reaction prediction",
    popular: [],
    curated: [
      { name: "Chemistry Query", slug: "cheminem/chemistry-query", author: "cheminem", description: "PubChem API: compound info, properties, SMILES structures, synthesis routes", url: "https://clawhub.ai/cheminem/chemistry-query" },
      { name: "Paramus Chemistry", slug: "gressling/paramus-chemistry", author: "gressling", description: "Hundreds of chemistry and scientific computing tools in a single skill pack", url: "https://clawhub.ai/gressling/paramus-chemistry" },
    ],
  },
  {
    id: "medicine",
    icon: "🩺",
    title: "Medicine & Health",
    subtitle: "Clinical literature, drug interactions, biomedical databases",
    popular: [],
    curated: [
      { name: "Medical Research Toolkit", slug: "pascalwhoop/medical-research-toolkit", author: "pascalwhoop", description: "Query 14+ biomedical databases for drug repurposing, target discovery, and clinical trials", url: "https://clawhub.ai/pascalwhoop/medical-research-toolkit" },
      { name: "PMC Harvest", slug: "angusthefuzz/pmc-harvest", author: "angusthefuzz", description: "Fetch full-text articles from PubMed Central via NCBI APIs", url: "https://clawhub.ai/angusthefuzz/pmc-harvest" },
      { name: "PubMed EDirect", slug: "killgfat/pubmed-edirect", author: "killgfat", description: "Advanced PubMed search and retrieval via NCBI EDirect command-line tools", url: "https://clawhub.ai/killgfat/pubmed-edirect" },
      { name: "Medical Specialty Briefs", slug: "johnyquest7/medical-specialty-briefs", author: "johnyquest7", description: "Generate daily or on-demand research briefs for any medical specialty", url: "https://clawhub.ai/johnyquest7/medical-specialty-briefs" },
    ],
  },
  {
    id: "physics",
    icon: "⚛️",
    title: "Physics & Mathematics",
    subtitle: "Simulations, data fitting, formal proofs, unit conversion, constants",
    popular: [],
    curated: [
      { name: "Wolfram Alpha", slug: "robert-janssen/wolfram-alpha", author: "robert-janssen", description: "Complex mathematical calculations, physics simulations, unit conversions", url: "https://clawhub.ai/robert-janssen/wolfram-alpha" },
      { name: "Acorn Prover", slug: "flyingnobita/acorn-prover", author: "flyingnobita", description: "Verify and write formal proofs using the Acorn theorem prover", url: "https://clawhub.ai/flyingnobita/acorn-prover" },
      { name: "arXiv CLI Tools", slug: "killgfat/arxiv-cli-tools", author: "killgfat", description: "CLI tools for fetching and managing arXiv papers in physics, math, and CS", url: "https://clawhub.ai/killgfat/arxiv-cli-tools" },
    ],
  },
  {
    id: "earth-environment",
    icon: "🌍",
    title: "Earth & Environment",
    subtitle: "Climate data, GIS, remote sensing, ecology, geology",
    popular: [],
    curated: [
      { name: "Geepers Data", slug: "lukeslp/geepers-data", author: "lukeslp", description: "Fetch data from NASA, Census Bureau, and climate APIs alongside arXiv and PubMed", url: "https://clawhub.ai/lukeslp/geepers-data" },
      { name: "BirdNET", slug: "rappo/birdnet", author: "rappo", description: "Query BirdNET-Go bird detection data for field ecology and bioacoustics research", url: "https://clawhub.ai/rappo/birdnet" },
      { name: "Sun Path", slug: "qrost/sun-path", author: "qrost", description: "Solar position calculations, thermal analysis, and photovoltaic/climate assessment", url: "https://clawhub.ai/qrost/sun-path" },
    ],
  },
  {
    id: "engineering",
    icon: "🔧",
    title: "Engineering",
    subtitle: "Signal processing, circuits, materials, CAD, 3D prototyping",
    popular: [],
    curated: [
      { name: "Create DXF", slug: "ajmwagar/create-dxf", author: "ajmwagar", description: "Create RFQ-ready 2D DXF and optional SVG preview files for engineering drawings", url: "https://clawhub.ai/ajmwagar/create-dxf" },
      { name: "Bambu Lab Skill", slug: "photonixlaser-ux/bambu-lab-skill", author: "photonixlaser-ux", description: "Control Bambu Lab 3D printers (A1, P1P, X1) for rapid lab prototyping", url: "https://clawhub.ai/photonixlaser-ux/bambu-lab-skill" },
    ],
  },
  {
    id: "social-sciences",
    icon: "🏛️",
    title: "Social Sciences",
    subtitle: "Psychology, economics, surveys, policy research, qualitative studies",
    popular: [],
    curated: [
      { name: "Autonomous Research", slug: "tobisamaa/autonomous-research", author: "tobisamaa", description: "Conduct comprehensive multi-step independent research for qualitative or quantitative studies", url: "https://clawhub.ai/tobisamaa/autonomous-research" },
      { name: "Limesurvey", slug: "olegantonov/limesurvey", author: "olegantonov", description: "Automate survey creation and management for social science data collection", url: "https://clawhub.ai/olegantonov/limesurvey" },
      { name: "OSINT Graph Analyzer", slug: "orosha-ai/osint-graph-analyzer", author: "orosha-ai", description: "Build knowledge graphs from OSINT data for social/political research", url: "https://clawhub.ai/orosha-ai/osint-graph-analyzer" },
    ],
  },
];

/** All top-10 popular skills across all categories for the "Top Skills" hero section */
export const TOP_SKILLS: FeaturedSkill[] = [
  { name: "Summarize", slug: "steipete/summarize", author: "steipete", description: "Summarize URLs, PDFs, images, audio, and YouTube", url: "https://clawhub.ai/steipete/summarize", rank: 2 },
  { name: "Agent Browser", slug: "TheSethRose/agent-browser", author: "TheSethRose", description: "Rust-based headless browser automation CLI", url: "https://clawhub.ai/TheSethRose/agent-browser", rank: 3 },
  { name: "GitHub", slug: "steipete/github", author: "steipete", description: "Interact with GitHub using gh CLI: issues, PRs, CI runs", url: "https://clawhub.ai/steipete/github", rank: 5 },
  { name: "Nano Pdf", slug: "steipete/nano-pdf", author: "steipete", description: "Edit PDFs with natural-language instructions", url: "https://clawhub.ai/steipete/nano-pdf", rank: 11 },
  { name: "Humanizer", slug: "biostartechnology/humanizer", author: "biostartechnology", description: "Removes AI-writing signs: em dashes, AI vocabulary", url: "https://clawhub.ai/biostartechnology/humanizer", rank: 13 },
  { name: "Multi Search Engine", slug: "gpyAngyoujun/multi-search-engine", author: "gpyAngyoujun", description: "Multi-engine web search across 17 providers", url: "https://clawhub.ai/gpyAngyoujun/multi-search-engine", rank: 14 },
  { name: "Notion", slug: "steipete/notion", author: "steipete", description: "Notion API: create and manage pages, databases, and blocks", url: "https://clawhub.ai/steipete/notion", rank: 15 },
  { name: "Obsidian", slug: "steipete/obsidian", author: "steipete", description: "Work with Obsidian vaults and automate via obsidian-cli", url: "https://clawhub.ai/steipete/obsidian", rank: 16 },
  { name: "OpenAI Whisper", slug: "steipete/openai-whisper", author: "steipete", description: "Local speech-to-text with Whisper CLI (no API key)", url: "https://clawhub.ai/steipete/openai-whisper", rank: 18 },
  { name: "Brave Search", slug: "steipete/brave-search", author: "steipete", description: "Web search and content extraction via Brave Search API", url: "https://clawhub.ai/steipete/brave-search", rank: 25 },
];
