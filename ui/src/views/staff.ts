import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

export interface StaffMember {
  id: string;
  icon: string;
  name: string;
  role: string;
  discipline: string;
  condaEnv: string;
  description: string;
  editable?: boolean;
  skills: string[];
  envInstalled?: boolean;
  photoUrl?: string;
}

const AVATAR_EMOJIS = [
  "👤","🧑‍🔬","👨‍🔬","👩‍🔬","🧑‍💻","👨‍💻","👩‍💻","🧑‍🏫","👨‍🏫","👩‍🏫","🧑‍⚕️","👨‍⚕️","👩‍⚕️","🧑‍🎓","👨‍🎓","👩‍🎓","🤓","🧔","👱","🧑",
];

/** Available conda environments */
export const CONDA_ENVS = [
  { id: "aca", label: "General (aca)", discipline: "general" },
  { id: "aca-bio", label: "Biology (aca-bio)", discipline: "biology" },
  { id: "aca-med", label: "Medicine (aca-med)", discipline: "medicine" },
  { id: "aca-chem", label: "Chemistry (aca-chem)", discipline: "chemistry" },
  { id: "aca-phys", label: "Physics (aca-phys)", discipline: "physics" },
  { id: "aca-ai", label: "AI / ML (aca-ai)", discipline: "ai" },
  { id: "aca-data", label: "Data Science (aca-data)", discipline: "statistics" },
  { id: "aca-cs", label: "Computer Science (aca-cs)", discipline: "cs" },
];

interface EnvPackage { name: string; version: string; source: string; }

/** Pre-installed packages per env */
const ENV_PACKAGES: Record<string, EnvPackage[]> = {
  "aca": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "pandas", version: "2.2.3", source: "conda" },
    { name: "scipy", version: "1.15.0", source: "conda" },
    { name: "matplotlib", version: "3.10.0", source: "conda" },
    { name: "scikit-learn", version: "1.6.1", source: "conda" },
    { name: "jupyter", version: "1.1.1", source: "conda" },
    { name: "torch", version: "2.5.1", source: "pip" },
    { name: "pandoc", version: "3.6.2", source: "conda" },
    { name: "texlive-core", version: "2024", source: "conda" },
  ],
  "aca-bio": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "pandas", version: "2.2.3", source: "conda" },
    { name: "biopython", version: "1.84", source: "conda" },
    { name: "scanpy", version: "1.10.4", source: "conda" },
    { name: "samtools", version: "1.21", source: "bioconda" },
    { name: "bedtools", version: "2.31.1", source: "bioconda" },
    { name: "fastqc", version: "0.12.1", source: "bioconda" },
    { name: "blast", version: "2.16.0", source: "bioconda" },
  ],
  "aca-med": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "pandas", version: "2.2.3", source: "conda" },
    { name: "scikit-learn", version: "1.6.1", source: "conda" },
    { name: "lifelines", version: "0.29.0", source: "pip" },
    { name: "nibabel", version: "5.3.2", source: "conda" },
    { name: "dcm2niix", version: "1.0", source: "conda" },
  ],
  "aca-chem": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "rdkit", version: "2024.03", source: "conda" },
    { name: "openbabel", version: "3.1.1", source: "conda" },
    { name: "ase", version: "3.23", source: "pip" },
  ],
  "aca-phys": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "scipy", version: "1.15.0", source: "conda" },
    { name: "astropy", version: "6.1", source: "conda" },
    { name: "sympy", version: "1.13", source: "conda" },
  ],
  "aca-ai": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "torch", version: "2.5.1", source: "pip" },
    { name: "transformers", version: "4.47", source: "pip" },
    { name: "datasets", version: "3.2", source: "pip" },
    { name: "scikit-learn", version: "1.6.1", source: "conda" },
  ],
  "aca-data": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "pandas", version: "2.2.3", source: "conda" },
    { name: "matplotlib", version: "3.10.0", source: "conda" },
    { name: "seaborn", version: "0.13", source: "conda" },
    { name: "statsmodels", version: "0.14", source: "conda" },
  ],
  "aca-cs": [
    { name: "numpy", version: "2.2.1", source: "conda" },
    { name: "networkx", version: "3.4", source: "conda" },
    { name: "pytest", version: "8.3", source: "conda" },
    { name: "black", version: "24.10", source: "conda" },
  ],
};

/**
 * Discipline tags for skill filtering.
 * "cross" = cross-discipline (available to all staff).
 * Others match StaffMember.discipline (case-insensitive).
 */
type SkillDiscipline = "cross" | "biology" | "medicine" | "chemistry" | "physics" | "mathematics"
  | "ai" | "cs" | "statistics" | "ecology" | "earth-environment" | "social-sciences" | "engineering" | "linguistics";

interface AvailableSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  default: boolean;
  disciplines: SkillDiscipline[];
  /** Gateway skill name when it differs from the clawhub slug (id). */
  gatewayName?: string;
}

/** Cross-discipline skills that can be assigned to any staff member.
 *  Every entry is verified to exist on ClawHub. */
export const AVAILABLE_SKILLS: AvailableSkill[] = [
  // ── Foundation (defaults for every staff) ──
  { id: "nano-pdf", name: "nano-pdf", description: "Read and extract text from PDF files", category: "Foundation", default: true, disciplines: ["cross"] },
  { id: "xurl", name: "xurl", description: "Fetch and read web pages", category: "Foundation", default: true, disciplines: ["cross"] },
  { id: "summarize", name: "summarize", description: "Summarize documents and text", category: "Foundation", default: true, disciplines: ["cross"] },

  // ── Writing ──
  { id: "academic-citation-manager", name: "academic-citation-manager", description: "Format references in APA, Vancouver, Nature, and 9000+ styles", category: "Writing", default: false, disciplines: ["cross"] },
  { id: "ai-humanizer", name: "ai-humanizer", description: "Detect and remove AI-typical writing patterns", category: "Writing", default: false, disciplines: ["cross"], gatewayName: "humanizer" },
  { id: "academic-writing", name: "academic-writing", description: "Expert agent for scholarly papers, literature reviews, methodology", category: "Writing", default: false, disciplines: ["cross"] },

  // ── Literature & Research ──
  { id: "literature-search", name: "literature-search", description: "Search arXiv, PubMed, Semantic Scholar", category: "Literature", default: false, disciplines: ["cross"] },
  { id: "academic-deep-research", name: "academic-deep-research", description: "Transparent, rigorous research across academic databases with audit trail", category: "Literature", default: false, disciplines: ["cross"] },
  { id: "literature-review", name: "literature-review", description: "Structured literature reviews with synthesis and gap analysis", category: "Literature", default: false, disciplines: ["cross"] },
  { id: "arxiv-cli-tools", name: "arxiv-cli-tools", description: "CLI tools for fetching and searching arXiv papers", category: "Literature", default: false, disciplines: ["cross"] },
  { id: "autonomous-research", name: "autonomous-research", description: "Multi-step independent research for qualitative or quantitative studies", category: "Research", default: false, disciplines: ["cross"] },

  // ── Data & Visualisation ──
  { id: "data-analyst", name: "data-analyst", description: "Data visualisation, reports, SQL, spreadsheets", category: "Data Analysis", default: false, disciplines: ["cross"] },
  { id: "mermaid", name: "mermaid", description: "Generate diagrams (flowcharts, sequence, class) from text", category: "Data Analysis", default: false, disciplines: ["cross"] },

  // ── Documents ──
  { id: "pandoc-convert-openclaw", name: "pandoc-convert-openclaw", description: "Convert between Word, PDF, LaTeX, and Markdown via Pandoc", category: "Documents", default: false, disciplines: ["cross"], gatewayName: "pandoc-convert" },

  // ── Research Design ──
  { id: "survey-designer", name: "survey-designer", description: "Design and manage surveys for research data collection", category: "Research", default: false, disciplines: ["cross"] },

  // ── Development ──
  { id: "agentic-coding", name: "agentic-coding", description: "Write and execute code autonomously", category: "Development", default: false, disciplines: ["cross"], gatewayName: "Agentic Coding" },
  { id: "docker-essentials", name: "docker-essentials", description: "Essential Docker commands for container management", category: "Development", default: false, disciplines: ["cross"] },
  { id: "git-essentials", name: "git-essentials", description: "Essential Git commands for version control", category: "Development", default: false, disciplines: ["cross"] },
];

const DEFAULT_SKILLS = AVAILABLE_SKILLS.filter((s) => s.default).map((s) => s.id);

/** Bundled skills that also count as user-installed (same set as skills.ts). */
const AGENT_REQUIRED_SKILLS = new Set(["nano-pdf", "xurl", "summarize", "humanizer"]);

/** Map StaffMember.discipline display string → SkillDiscipline tag(s) */
function disciplineTags(staffDiscipline: string): SkillDiscipline[] {
  const key = staffDiscipline.toLowerCase();
  const map: Record<string, SkillDiscipline[]> = {
    "general": [], // General sees cross-discipline only
    "biology": ["biology"],
    "medicine": ["medicine"],
    "chemistry": ["chemistry"],
    "physics": ["physics"],
    "mathematics": ["mathematics"],
    "ai / machine learning": ["ai"],
    "statistics": ["statistics"],
    "computer science": ["cs"],
    "ecology": ["ecology", "earth-environment", "biology"],
    "linguistics": ["linguistics", "social-sciences"],
    "engineering": ["engineering"],
    "social sciences": ["social-sciences"],
    "earth science": ["earth-environment"],
  };
  return map[key] ?? [];
}

/** Check if a skill matches a staff member's discipline */
function skillMatchesDiscipline(skill: AvailableSkill, staffDiscipline: string): boolean {
  // cross-discipline skills are always visible
  if (skill.disciplines.includes("cross")) return true;
  // check overlap between staff's discipline tags and skill's discipline tags
  const tags = disciplineTags(staffDiscipline);
  return skill.disciplines.some(d => tags.includes(d));
}

/** Prebuilt staff templates for +New */
const PREBUILT_TEMPLATES: Omit<StaffMember, "skills" | "envInstalled">[] = [
  { id: "chemist", icon: "\u{1F9EA}", name: "Dr. Mendeleev", role: "Computational Chemist", discipline: "Chemistry", condaEnv: "aca-chem", description: "Molecular dynamics, drug design, quantum chemistry, cheminformatics" },
  { id: "physicist", icon: "\u{269B}\uFE0F", name: "Dr. Feynman", role: "Theoretical Physicist", discipline: "Physics", condaEnv: "aca-phys", description: "Quantum mechanics, simulations, astrophysics, numerical methods" },
  { id: "ecologist", icon: "\u{1F331}", name: "Dr. Carson", role: "Ecologist", discipline: "Ecology", condaEnv: "aca-bio", description: "Population dynamics, biodiversity, GIS, environmental modeling" },
  { id: "mathematician", icon: "\u{1F4D0}", name: "Dr. Euler", role: "Applied Mathematician", discipline: "Mathematics", condaEnv: "aca", description: "Optimization, ODEs/PDEs, numerical analysis, proof assistants" },
  { id: "linguist", icon: "\u{1F4DA}", name: "Dr. Chomsky", role: "Computational Linguist", discipline: "Linguistics", condaEnv: "aca", description: "NLP, corpus analysis, translation, text mining" },
];

export const STAFF_MEMBERS: StaffMember[] = [
  {
    id: "default",
    icon: "\u{1F464}",
    name: "Aca",
    role: "General Assistant",
    discipline: "General",
    condaEnv: "aca",
    description: "Your personal research assistant \u2014 rename and customize freely",
    editable: true,
    skills: [...DEFAULT_SKILLS],
    envInstalled: true,
  },
  {
    id: "biologist",
    icon: "\u{1F9EC}",
    name: "Dr. Gene",
    role: "Computational Biologist",
    discipline: "Biology",
    condaEnv: "aca-bio",
    description: "Genomics, sequence analysis, phylogenetics, RNA-seq, pathway enrichment",
    skills: [...DEFAULT_SKILLS],
    envInstalled: false,
  },
  {
    id: "medscientist",
    icon: "\u{1F3E5}",
    name: "Dr. Curie",
    role: "Medical Scientist",
    discipline: "Medicine",
    condaEnv: "aca-med",
    description: "Clinical trials, survival analysis, epidemiology, medical imaging",
    skills: [...DEFAULT_SKILLS],
    envInstalled: false,
  },
  {
    id: "ai-researcher",
    icon: "\u{1F916}",
    name: "Dr. Turing",
    role: "AI Researcher",
    discipline: "AI / Machine Learning",
    condaEnv: "aca-ai",
    description: "Deep learning, NLP, computer vision, model training, arxiv search",
    skills: [...DEFAULT_SKILLS],
    envInstalled: false,
  },
  {
    id: "data-analyst",
    icon: "\u{1F4CA}",
    name: "Dr. Bayes",
    role: "Data Analyst",
    discipline: "Statistics",
    condaEnv: "aca-data",
    description: "Pandas, R/tidyverse, visualization, hypothesis testing, EDA",
    skills: [...DEFAULT_SKILLS],
    envInstalled: false,
  },
  {
    id: "cs-scientist",
    icon: "\u{1F4BB}",
    name: "Dr. Knuth",
    role: "Computer Scientist",
    discipline: "Computer Science",
    condaEnv: "aca-cs",
    description: "Algorithm design, systems programming, code review, architecture",
    skills: [...DEFAULT_SKILLS],
    envInstalled: false,
  },
];

type PanelType = "config" | "skills";

interface PanelState {
  staffId: string;
  type: PanelType;
}

const STAFF_STORAGE_KEY = "acaclaw-staff-customizations";
const STAFF_ADDED_KEY = "acaclaw-staff-added";

interface StaffCustomization {
  icon?: string;
  name?: string;
  photoUrl?: string;
  skills?: string[];
}

function loadStaffCustomizations(): Record<string, StaffCustomization> {
  try {
    const raw = localStorage.getItem(STAFF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadAddedStaff(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STAFF_ADDED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function applyCustomizations(staff: StaffMember[]): StaffMember[] {
  const customs = loadStaffCustomizations();
  const base = staff.map((s) => {
    const c = customs[s.id];
    if (!c) return s;
    return { ...s, ...(c.name && { name: c.name }), ...(c.icon !== undefined && { icon: c.icon }), ...(c.photoUrl !== undefined && { photoUrl: c.photoUrl || undefined }), ...(c.skills && { skills: c.skills }) };
  });
  const existingIds = new Set(base.map((s) => s.id));
  const added = loadAddedStaff().filter((s) => !existingIds.has(s.id));
  return [...base, ...added];
}

/** Returns STAFF_MEMBERS with localStorage customizations (name, icon, photoUrl) applied. */
export function getCustomizedStaff(): StaffMember[] {
  return applyCustomizations(STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] })));
}

@customElement("acaclaw-staff")
export class StaffView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _staff: StaffMember[] = applyCustomizations(STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] })));
  @state() private _panel: PanelState | null = null;
  /** Tracks editable name — which staff id is being edited */
  @state() private _editingNameId = "";
  @state() private _editNameValue = "";
  /** +New staff picker */
  @state() private _showNewPicker = false;
  /** Avatar picker */
  @state() private _showAvatarPicker = "";
  /** Per-staff env install state */
  @state() private _envAction: Record<string, "installing" | "uninstalling"> = {};
  /** Package install input per staff */
  @state() private _pkgInput: Record<string, string> = {};
  /** Per-staff installed packages (mutable copy) */
  @state() private _staffPkgs: Record<string, EnvPackage[]> = {};
  /** Per-package action state */
  @state() private _pkgAction: Record<string, string> = {};
  /** Per-staff skill install/remove state */
  @state() private _skillAction: Record<string, string> = {};
  /** Per-staff install/uninstall log lines */
  @state() private _installLog: Record<string, string[]> = {};
  /** Per-staff install error message */
  @state() private _installError: Record<string, string> = {};
  /** Clawhub search */
  @state() private _searchQuery: Record<string, string> = {};
  @state() private _searchResults: Array<{ id: string; name: string; description: string; category: string }> = [];
  @state() private _searching = false;
  /** Gateway-reported skills from skills.status */
  @state() private _gatewaySkills: Array<{
    name: string; description: string; source: string; bundled: boolean;
    disabled: boolean; eligible: boolean;
    install: Array<{ id: string; kind: string; label: string }>;
  }> = [];
  @state() private _gatewaySkillsLoaded = false;
  /** Per-skill install state */
  @state() private _skillInstalling: Record<string, boolean> = {};
  /** Per-skill uninstall state */
  @state() private _skillUninstalling: Record<string, boolean> = {};
  /** Skill install log lines */
  @state() private _skillInstallLog: string[] = [];
  /** Sequential install queue — prevents concurrent clawhub CLI calls. */
  private _installQueue: Promise<void> = Promise.resolve();

  /** Dynamic clawhub slug → gateway name mapping, persisted in localStorage.
   *  Populated after each successful install by diffing gateway skill names. */
  private _slugToGateway = new Map<string, string>();
  private static readonly SLUG_MAP_KEY = "acaclaw.slugToGateway";

  private _gatewayListener: EventListener | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this._loadSlugMap();
    // If already connected, sync immediately; otherwise wait for connection
    if (gateway.state === "connected") {
      this._syncEnvStatus();
      this._loadGatewaySkills();
    }
    this._gatewayListener = ((e: CustomEvent) => {
      if (e.detail.state === "connected") { this._syncEnvStatus(); this._loadGatewaySkills(); }
    }) as EventListener;
    gateway.addEventListener("state-change", this._gatewayListener);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._gatewayListener) {
      gateway.removeEventListener("state-change", this._gatewayListener);
      this._gatewayListener = null;
    }
  }

  private async _syncEnvStatus() {
    try {
      const res = await gateway.call<{ environments: Array<{ name: string; installed: boolean }> }>("acaclaw.env.list");
      if (!res?.environments) return;
      const envMap = new Map(res.environments.map(e => [e.name, e.installed]));
      this._staff = this._staff.map(s => {
        const installed = envMap.get(s.condaEnv);
        return installed !== undefined ? { ...s, envInstalled: installed } : s;
      });
    } catch { /* gateway not connected yet — keep defaults */ }
  }

  static override styles = css`
    :host {
      display: block;
      animation: fade-in 0.3s ease-out forwards;
    }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: var(--ac-text);
      margin-bottom: 4px;
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
    }
    .page-header-left { flex: 1; }
    .subtitle {
      font-size: 15px;
      color: var(--ac-text-muted);
      line-height: 1.5;
    }
    .btn-new-staff {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 10px;
      border: 1px solid var(--ac-primary);
      background: var(--ac-primary);
      color: #fff;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .btn-new-staff:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(59,130,246,0.2); }
    .new-picker-overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
    }
    .new-picker {
      position: absolute;
      top: 44px;
      right: 0;
      z-index: 91;
      background: #fff;
      border: 1px solid var(--ac-border);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      width: 320px;
      padding: 8px;
    }
    .new-picker-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s;
      font-size: 13px;
    }
    .new-picker-item:hover { background: var(--ac-bg-hover); }
    .new-picker-icon {
      font-size: 22px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      border-radius: 10px;
      flex-shrink: 0;
    }
    .new-picker-info { flex: 1; min-width: 0; }
    .new-picker-name { font-weight: 700; color: var(--ac-text); }
    .new-picker-role { font-size: 11px; color: var(--ac-text-muted); }
    .new-picker-divider {
      height: 1px;
      background: var(--ac-border-subtle);
      margin: 4px 8px;
    }

    /* ── Grid & Cards ── */
    .staff-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 1024px) { .staff-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) { .staff-grid { grid-template-columns: 1fr; } }

    .staff-card {
      background: #fafafa;
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      transition: all var(--ac-transition-fast);
      min-height: 260px;
    }
    .staff-card:hover {
      border-color: var(--ac-primary);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
      transform: translateY(-2px);
    }
    .staff-card.is-default {
      border: 2px dashed var(--ac-primary);
      background: rgba(59, 130, 246, 0.02);
    }

    .staff-header {
      display: flex;
      gap: 14px;
      align-items: center;
      margin-bottom: 16px;
    }
    .staff-avatar {
      width: 56px;
      height: 56px;
      background: #ffffff;
      border: 1px solid var(--ac-border);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
      flex-shrink: 0;
      position: relative;
    }
    .staff-avatar { cursor: pointer; }
    .staff-avatar:hover { border-color: var(--ac-primary); }
    .staff-avatar::after {
      content: "✏️";
      position: absolute;
      bottom: -4px;
      right: -4px;
      font-size: 12px;
      background: #fff;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--ac-border);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .staff-avatar:hover::after { opacity: 1; }

    .avatar-picker {
      position: absolute;
      top: 62px;
      left: 0;
      z-index: 50;
      background: #fff;
      border: 1px solid var(--ac-border);
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
      width: 200px;
    }
    .avatar-picker button {
      width: 36px;
      height: 36px;
      font-size: 20px;
      border: none;
      background: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-picker button:hover {
      background: var(--ac-bg-hover);
    }
    .avatar-picker .avatar-upload-btn {
      grid-column: 1 / -1;
      width: 100% !important;
      height: auto !important;
      padding: 6px;
      font-size: 12px !important;
      font-weight: 600;
      border: 1px dashed var(--ac-border);
      background: var(--ac-bg-hover);
      border-radius: 8px;
      cursor: pointer;
      color: var(--ac-text-secondary);
      margin-bottom: 4px;
    }
    .avatar-upload-btn:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
    }
    .avatar-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 14px;
    }
    .manage-link {
      font-size: 11px;
      font-weight: 600;
      color: var(--ac-primary);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      margin-left: 8px;
    }
    .manage-link:hover { text-decoration: underline; }
    .staff-identity { flex: 1; min-width: 0; }
    .staff-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ac-text);
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .staff-role {
      font-size: 12px;
      color: var(--ac-text-secondary);
      line-height: 1.4;
    }

    .editable-badge {
      font-size: 9px;
      padding: 2px 6px;
      background: var(--ac-primary-bg, #eff6ff);
      color: var(--ac-primary);
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .edit-name-input {
      font-size: 16px;
      font-weight: 800;
      border: 1px solid var(--ac-primary);
      border-radius: 6px;
      padding: 2px 8px;
      background: #fff;
      outline: none;
      width: 120px;
      letter-spacing: -0.02em;
    }

    .kv-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .kv-label {
      width: 70px;
      flex-shrink: 0;
      color: var(--ac-text-muted);
      font-weight: 500;
    }
    .kv-value {
      flex: 1;
      color: var(--ac-text);
      font-weight: 600;
      line-height: 1.5;
      word-break: break-word;
    }
    .kv-value.secondary {
      font-weight: 500;
      color: var(--ac-text-secondary);
      font-size: 12px;
    }

    .env-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #15803d;
      font-family: monospace;
    }
    .skills-count {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #7c3aed;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .status-badge.idle { background: #f1f5f9; color: #64748b; }
    .status-badge.installed { background: #dcfce7; color: #16a34a; }
    .status-badge.installing { background: #fef3c7; color: #d97706; }

    /* ── Inline Env & Skills ── */
    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ac-text-muted);
      margin-bottom: 6px;
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .env-status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .env-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .env-status-dot.installed { background: #16a34a; }
    .env-status-dot.not-installed { background: #d1d5db; }
    .env-status-name {
      font-size: 12px;
      font-weight: 600;
      font-family: monospace;
      color: var(--ac-text);
      flex: 1;
    }
    .env-action-sm {
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid;
      white-space: nowrap;
    }
    .env-install-sm {
      background: var(--ac-primary);
      color: #fff;
      border-color: var(--ac-primary);
    }
    .env-install-sm:hover { opacity: 0.9; }
    .env-install-sm:disabled { opacity: 0.5; cursor: not-allowed; }
    .env-uninstall-sm {
      background: transparent;
      color: var(--ac-error, #ef4444);
      border-color: var(--ac-error, #ef4444);
    }
    .env-uninstall-sm:hover {
      background: var(--ac-error, #ef4444);
      color: #fff;
    }
    .env-uninstall-sm:disabled { opacity: 0.5; cursor: not-allowed; }

    .skill-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 6px;
    }
    .skill-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      color: #7c3aed;
    }
    .skill-pill .remove-x {
      cursor: pointer;
      font-size: 12px;
      color: #a78bfa;
      margin-left: 2px;
      line-height: 1;
    }
    .skill-pill .remove-x:hover { color: #ef4444; }
    .skill-pill.bundled {
      background: #f0fdf4;
      border-color: #bbf7d0;
      color: #15803d;
    }
    .skill-pill.required .remove-x { display: none; }
    .skill-pill.required .lock-icon { display: inline; }
    .lock-icon { display: none; font-size: 10px; color: #a78bfa; margin-left: 2px; }
    .skill-pill.not-installed {
      background: #fef3c7;
      border-color: #fde68a;
      color: #92400e;
    }

    .search-skill-bar {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .search-skill-input {
      flex: 1;
      padding: 5px 10px;
      font-size: 12px;
      border: 1px solid var(--ac-border);
      border-radius: 6px;
      background: var(--ac-bg);
    }
    .search-skill-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 2px var(--ac-primary-bg);
    }
    .search-skill-btn {
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--ac-primary);
      background: var(--ac-primary);
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
    }
    .search-skill-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .search-results {
      margin-top: 6px;
      border: 1px solid var(--ac-border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    .search-result-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      font-size: 12px;
      border-bottom: 1px solid var(--ac-border-subtle);
    }
    .search-result-item:last-child { border-bottom: none; }
    .search-result-item:hover { background: var(--ac-bg-hover); }
    .search-result-name { font-weight: 600; color: var(--ac-text); }
    .search-result-desc { flex: 1; color: var(--ac-text-secondary); }
    .search-result-add {
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--ac-primary);
      background: var(--ac-primary-bg, #eff6ff);
      color: var(--ac-primary);
      border-radius: 6px;
      cursor: pointer;
    }
    .search-result-add:hover {
      background: var(--ac-primary);
      color: #fff;
    }

    /* ── Action Buttons ── */
    .staff-actions {
      display: flex;
      gap: 6px;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--ac-border-subtle);
    }

    .btn-action {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
      border: 1px solid var(--ac-border);
      background: var(--ac-bg-surface);
      color: var(--ac-text);
    }
    .btn-action:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-text-muted);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }

    .btn-install {
      background: var(--ac-primary);
      color: #fff;
      border-color: var(--ac-primary);
    }
    .btn-install:hover {
      background: var(--ac-primary-dark);
      border-color: var(--ac-primary-dark);
    }
    .btn-install:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .btn-install.installed {
      background: #dcfce7;
      color: #16a34a;
      border-color: #bbf7d0;
      cursor: default;
    }

    /* ── Slide-out Panel ── */
    .panel-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.25);
      z-index: 100;
      animation: overlay-in 0.2s ease;
    }
    @keyframes overlay-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .panel {
      position: fixed;
      top: 0;
      right: 0;
      width: 440px;
      height: 100vh;
      background: #fff;
      box-shadow: -8px 0 32px rgba(0,0,0,0.12);
      z-index: 101;
      display: flex;
      flex-direction: column;
      animation: panel-slide 0.25s ease;
    }
    @keyframes panel-slide {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 28px 16px;
      border-bottom: 1px solid var(--ac-border-subtle);
    }
    .panel-title {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ac-text);
    }
    .panel-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: var(--ac-bg-hover);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ac-text-secondary);
      transition: all var(--ac-transition-fast);
    }
    .panel-close:hover {
      background: #f1f5f9;
      color: var(--ac-text);
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px 28px;
    }

    .panel-section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ac-text-muted);
      margin-bottom: 12px;
    }

    /* Config panel */
    /* Config panel — env dropdown */
    .env-select {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--ac-border);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      background: #fff;
      color: var(--ac-text);
      cursor: pointer;
      margin-bottom: 20px;
      appearance: auto;
    }
    .env-select:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
    }

    /* Config panel — package list */
    .pkg-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }
    .pkg-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      background: var(--ac-bg-hover);
    }
    .pkg-row:hover { background: #f1f5f9; }
    .pkg-name { font-weight: 600; color: var(--ac-text); min-width: 110px; }
    .pkg-ver { color: var(--ac-text-muted); font-size: 12px; min-width: 60px; }
    .pkg-src { color: var(--ac-text-muted); font-size: 11px; flex: 1; }
    .pkg-remove-btn {
      background: none;
      border: none;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .pkg-row:hover .pkg-remove-btn { opacity: 1; }
    .pkg-remove-btn:hover { background: #fef2f2; }
    .pkg-remove-btn:disabled { opacity: 0.4; cursor: wait; }

    .pkg-install-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .pkg-install-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--ac-border);
      border-radius: 8px;
      font-size: 13px;
    }
    .pkg-install-input:focus {
      outline: none;
      border-color: var(--ac-primary);
    }
    .pkg-install-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      background: var(--ac-primary);
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .pkg-install-btn:hover { background: var(--ac-primary-dark); }
    .pkg-install-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Skills panel */
    .skill-check-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      border: 1px solid var(--ac-border-subtle);
      border-radius: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all var(--ac-transition-fast);
    }
    .skill-check-item:hover {
      border-color: var(--ac-primary);
      background: rgba(59, 130, 246, 0.02);
    }
    .skill-check-item.assigned {
      border-color: #a78bfa;
      background: #faf5ff;
    }

    .skill-checkbox {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      border: 2px solid var(--ac-border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
      font-size: 12px;
      color: #fff;
    }
    .skill-check-item.assigned .skill-checkbox {
      background: #7c3aed;
      border-color: #7c3aed;
    }

    .skill-check-info { flex: 1; }
    .skill-check-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--ac-text);
    }
    .skill-check-desc {
      font-size: 12px;
      color: var(--ac-text-secondary);
      margin-top: 2px;
    }
    .skill-check-cat {
      font-size: 10px;
      color: var(--ac-text-muted);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
    }

    /* Inline install progress */
    .btn-install.installing {
      opacity: 0.7;
      cursor: wait;
    }
    @keyframes spin-install {
      to { transform: rotate(360deg); }
    }
    .install-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #fff;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin-install 0.8s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }

    /* ── Install Status Bar ── */
    .install-status-bar {
      margin-top: 8px;
      padding: 8px 10px;
      background: #1a1b2e;
      border-radius: 8px;
      max-height: 120px;
      overflow-y: auto;
      font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.6;
      scrollbar-width: thin;
    }
    .install-status-bar::-webkit-scrollbar { width: 4px; }
    .install-status-bar::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
    .status-line {
      color: #a6adc8;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .status-line.error { color: #f38ba8; font-weight: 600; }
    .status-line.success { color: #a6e3a1; font-weight: 600; }
    .status-bar-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }
    .status-bar-dismiss {
      background: none;
      border: none;
      font-size: 10px;
      color: var(--ac-text-muted);
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
    }
    .status-bar-dismiss:hover { color: var(--ac-text); }

    .panel-footer {
      padding: 16px 28px;
      border-top: 1px solid var(--ac-border-subtle);
    }
    .btn-panel-action {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      background: var(--ac-primary);
      color: #fff;
      transition: all var(--ac-transition-fast);
    }
    .btn-panel-action:hover {
      background: var(--ac-primary-dark);
    }
    .btn-panel-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  private _getStaff(staffId: string): StaffMember | undefined {
    return this._staff.find((s) => s.id === staffId);
  }

  private _persistStaff() {
    const customs: Record<string, StaffCustomization> = {};
    const defaults = new Map(STAFF_MEMBERS.map((s) => [s.id, s]));
    const added: StaffMember[] = [];
    for (const s of this._staff) {
      const d = defaults.get(s.id);
      if (!d) { added.push(s); continue; }
      const c: StaffCustomization = {};
      if (s.name !== d.name) c.name = s.name;
      if (s.icon !== d.icon) c.icon = s.icon;
      if (s.photoUrl) c.photoUrl = s.photoUrl;
      // Always persist skills (even if same as default, to capture additions)
      const defaultSkills = d.skills.slice().sort().join(",");
      const currentSkills = s.skills.slice().sort().join(",");
      if (currentSkills !== defaultSkills) c.skills = s.skills;
      if (Object.keys(c).length) customs[s.id] = c;
    }
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(customs));
      localStorage.setItem(STAFF_ADDED_KEY, JSON.stringify(added));
    } catch { /* quota */ }
  }

  private _openPanel(staffId: string, type: PanelType) {
    this._panel = { staffId, type };
    if (type === "skills" && gateway.state === "connected") {
      this._loadGatewaySkills();
    }
    if (type === "config" && gateway.state === "connected") {
      this._loadStaffPackages(staffId);
    }
  }

  private async _loadStaffPackages(staffId: string) {
    const staff = this._getStaff(staffId);
    if (!staff) return;
    try {
      const res = await gateway.call<{ packages: Array<{ name: string; version: string; source: string }> }>(
        "acaclaw.env.pip.list", { env: staff.condaEnv }
      );
      if (res?.packages) {
        this._staffPkgs = { ...this._staffPkgs, [staffId]: res.packages };
      }
    } catch { /* gateway not ready */ }
  }

  /** Skills that count as installed — non-bundled + agent-required bundled (same logic as Skills view). */
  private get _installedGatewaySkills() {
    return this._gatewaySkills.filter(
      g => g.source !== "openclaw-bundled" || AGENT_REQUIRED_SKILLS.has(g.name)
    );
  }

  /** Load persisted slug→gateway name map from localStorage. */
  private _loadSlugMap() {
    try {
      const raw = localStorage.getItem(StaffView.SLUG_MAP_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as [string, string][];
        this._slugToGateway = new Map(entries);
      }
    } catch { /* ignore */ }
    // Seed with static known mappings from AVAILABLE_SKILLS
    for (const av of AVAILABLE_SKILLS) {
      if (av.gatewayName && !this._slugToGateway.has(av.id)) {
        this._slugToGateway.set(av.id, av.gatewayName);
      }
    }
  }

  /** Persist slug→gateway name map to localStorage. */
  private _saveSlugMap() {
    try {
      localStorage.setItem(StaffView.SLUG_MAP_KEY, JSON.stringify([...this._slugToGateway]));
    } catch { /* ignore */ }
  }

  /** Resolve a gateway name from a clawhub slug (uses dynamic map, then static hints, then identity). */
  private _resolveGatewayName(slug: string): string {
    return this._slugToGateway.get(slug) ?? AVAILABLE_SKILLS.find(a => a.id === slug)?.gatewayName ?? slug;
  }

  /** Find a gateway skill entry by clawhub slug, checking dynamic map and static mappings. */
  private _findGatewaySkill(slug: string) {
    const gwName = this._resolveGatewayName(slug);
    return this._gatewaySkills.find(g => g.name === slug || g.name === gwName);
  }

  private async _loadGatewaySkills() {
    try {
      const res = await gateway.call<{ skills: typeof this._gatewaySkills }>("skills.status");
      if (res?.skills) {
        // Preserve synthetic entries added during this session that the gateway doesn't know about yet
        const returnedNames = new Set(res.skills.map(s => s.name));
        const synthetics = this._gatewaySkills.filter(
          s => s.source === "clawhub-repo" && !returnedNames.has(s.name),
        );
        this._gatewaySkills = [...res.skills, ...synthetics];
        this._gatewaySkillsLoaded = true;
        this.requestUpdate();
      }
    } catch { /* gateway not ready */ }
  }

  private async _installGatewaySkill(skillName: string, installId: string) {
    this._skillInstalling = { ...this._skillInstalling, [skillName]: true };
    this._skillInstallLog = [`\u25b6 Installing ${skillName} (${installId})\u2026`];
    try {
      const res = await gateway.call<{
        ok: boolean; message: string; stdout: string; stderr: string; code: number | null;
      }>("skills.install", { name: skillName, installId }, { timeoutMs: 300_000 });
      // Append stdout/stderr lines
      if (res?.stdout) {
        for (const line of res.stdout.split("\n").filter(Boolean)) {
          this._skillInstallLog = [...this._skillInstallLog, line];
        }
      }
      if (res?.stderr) {
        for (const line of res.stderr.split("\n").filter(Boolean)) {
          this._skillInstallLog = [...this._skillInstallLog, `\u26a0 ${line}`];
        }
      }
      if (res?.ok) {
        this._skillInstallLog = [...this._skillInstallLog, `\u2713 ${skillName} installed successfully`];
      } else {
        this._skillInstallLog = [...this._skillInstallLog, `\u2717 ${res?.message ?? "Install failed"}`];
      }
      await this._loadGatewaySkills();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._skillInstallLog = [...this._skillInstallLog, `\u2717 Failed: ${msg}`];
      console.error(`Failed to install skill ${skillName}:`, err);
    } finally {
      const { [skillName]: _, ...rest } = this._skillInstalling;
      this._skillInstalling = rest;
    }
  }

  private _installClawHubSkill(staffId: string, slug: string) {
    this._skillInstalling = { ...this._skillInstalling, [slug]: true };
    // Queue the install with a cooldown delay to avoid clawhub rate limits
    this._installQueue = this._installQueue
      .then(() => this._queueCooldown())
      .then(() => this._doInstallClawHub(staffId, slug))
      .catch(() => {});
  }

  /** Short delay between queued operations to respect clawhub rate limits. */
  private _queueCooldown(): Promise<void> {
    if (!this._lastQueueOp) return Promise.resolve();
    const elapsed = Date.now() - this._lastQueueOp;
    const wait = Math.max(0, 3000 - elapsed);
    return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve();
  }
  private _lastQueueOp = 0;

  private async _doInstallClawHub(staffId: string, slug: string) {
    this._skillInstallLog = [...this._skillInstallLog, `▶ Installing "${slug}" from ClawHub…`];

    // Snapshot current gateway names so we can detect what was added after install
    const namesBefore = new Set(this._gatewaySkills.map(g => g.name));

    const unsub = gateway.onNotification("acaclaw.skill.install.progress", (data: unknown) => {
      const d = data as { slug?: string; name?: string; line?: string };
      const matchSlug = d?.slug === slug || d?.name === slug;
      if (matchSlug && d?.line) {
        console.log(`[skill-install] ${d.line}`);
        this._skillInstallLog = [...this._skillInstallLog, d.line];
      }
    });

    try {
      console.log(`[skill-install] calling acaclaw.skill.install slug=${slug}`);
      const res = await gateway.call<{ ok: boolean; slug: string; installed?: boolean; alreadyExists?: boolean }>("acaclaw.skill.install", { slug }, { timeoutMs: 120_000 });
      console.log(`[skill-install] result:`, res);
      if (res?.installed) {
        this._skillInstallLog = [...this._skillInstallLog, `✓ "${slug}" installed successfully`];
      }
      if (res?.installed || res?.alreadyExists) {
        console.log(`[skill-install] adding "${slug}" to staff ${staffId}`);
        this._addSkillToStaff(staffId, slug);
        this.requestUpdate();
      }
      await this._loadGatewaySkills();

      // If install succeeded but the gateway's skills.status doesn't list the skill yet
      // (gateway may need restart to rescan), add a synthetic entry so the UI shows it as installed
      if (res?.installed) {
        const resolved = this._resolveGatewayName(slug);
        const found = this._gatewaySkills.some(g => g.name === slug || g.name === resolved);
        if (!found) {
          const avail = AVAILABLE_SKILLS.find(a => a.id === slug);
          this._gatewaySkills = [...this._gatewaySkills, {
            name: resolved, description: avail?.description ?? slug,
            source: "clawhub-repo", bundled: false, disabled: false, eligible: true,
            install: [],
          }];
          console.log(`[skill-install] added synthetic gateway entry for "${resolved}"`);
        }
      }

      // Detect slug→gatewayName mapping by finding new entries
      for (const gw of this._gatewaySkills) {
        if (!namesBefore.has(gw.name) && gw.name !== slug) {
          console.log(`[skill-install] discovered mapping: ${slug} → ${gw.name}`);
          this._slugToGateway.set(slug, gw.name);
          this._saveSlugMap();
          break;
        }
      }
      // If alreadyExists and no mapping yet, the gateway name matches the slug OR was already mapped
      if (res?.alreadyExists && !this._slugToGateway.has(slug)) {
        // Find the gateway entry — try fuzzy match: slug minus common prefixes/suffixes
        const candidate = this._gatewaySkills.find(g =>
          g.name === slug ||
          g.name.toLowerCase().replace(/[\s-]/g, '') === slug.toLowerCase().replace(/[\s-]/g, '')
        );
        if (candidate && candidate.name !== slug) {
          this._slugToGateway.set(slug, candidate.name);
          this._saveSlugMap();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[skill-install] error:`, err);
      this._skillInstallLog = [...this._skillInstallLog, `✗ Failed: ${msg}`];
    } finally {
      unsub();
      this._lastQueueOp = Date.now();
      const { [slug]: _, ...rest } = this._skillInstalling;
      this._skillInstalling = rest;
    }
  }

  /** Resolve the clawhub slug for a gateway skill name (reverse lookup). */
  private _resolveSlug(gatewayName: string): string {
    for (const [slug, gw] of this._slugToGateway) {
      if (gw === gatewayName) return slug;
    }
    for (const a of AVAILABLE_SKILLS) {
      if (a.gatewayName === gatewayName) return a.id;
    }
    return gatewayName;
  }

  private _uninstallSkill(skillId: string) {
    this._skillUninstalling = { ...this._skillUninstalling, [skillId]: true };
    // Queue with cooldown to prevent concurrent clawhub CLI calls and rate limits
    this._installQueue = this._installQueue
      .then(() => this._queueCooldown())
      .then(() => this._doUninstallSkill(skillId))
      .catch(() => {});
  }

  private async _doUninstallSkill(skillId: string) {
    const slug = this._resolveSlug(skillId);
    this._skillInstallLog = [...this._skillInstallLog, `▶ Uninstalling "${slug}"…`];

    const unsub = gateway.onNotification("acaclaw.skill.uninstall.progress", (data: unknown) => {
      const d = data as { slug?: string; line?: string };
      if (d?.slug === slug && d?.line) {
        this._skillInstallLog = [...this._skillInstallLog, d.line];
      }
    });

    try {
      const res = await gateway.call<{ ok: boolean; slug: string; uninstalled?: boolean }>(
        "acaclaw.skill.uninstall",
        { slug },
        { timeoutMs: 60_000 },
      );
      if (res?.uninstalled) {
        this._skillInstallLog = [...this._skillInstallLog, `✓ "${slug}" uninstalled`];
        // Remove slug→gateway mapping
        this._slugToGateway.delete(slug);
        this._saveSlugMap();
      }
      await this._loadGatewaySkills();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._skillInstallLog = [...this._skillInstallLog, `✗ Failed: ${msg}`];
    } finally {
      unsub();
      this._lastQueueOp = Date.now();
      const { [skillId]: _, ...rest } = this._skillUninstalling;
      this._skillUninstalling = rest;
    }
  }

  private _closePanel() {
    this._panel = null;
  }

  private _setEnv(staffId: string, envId: string) {
    this._staff = this._staff.map((s) =>
      s.id === staffId ? { ...s, condaEnv: envId } : s
    );
  }

  private async _installPackage(staffId: string) {
    const name = (this._pkgInput[staffId] ?? "").trim();
    if (!name) return;
    const staff = this._getStaff(staffId);
    const key = `${staffId}:install`;
    this._pkgAction = { ...this._pkgAction, [key]: "installing" };
    this._appendLog(staffId, `Installing package "${name}"…`);
    try {
      await gateway.call("acaclaw.env.pip.install", { packages: [name], env: staff?.condaEnv }, { timeoutMs: 300_000 });
      this._appendLog(staffId, `✓ Package "${name}" installed`);
      await this._loadStaffPackages(staffId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this._appendLog(staffId, `✗ Failed to install "${name}": ${msg}`);
    }
    this._pkgInput = { ...this._pkgInput, [staffId]: "" };
    const { [key]: _, ...rest } = this._pkgAction;
    this._pkgAction = rest;
  }

  private async _removePackage(staffId: string, pkgName: string) {
    const staff = this._getStaff(staffId);
    const key = `${staffId}:${pkgName}`;
    this._pkgAction = { ...this._pkgAction, [key]: "removing" };
    this._appendLog(staffId, `Removing package "${pkgName}"…`);
    try {
      await gateway.call("acaclaw.env.pip.uninstall", { packages: [pkgName], env: staff?.condaEnv }, { timeoutMs: 300_000 });
      this._appendLog(staffId, `✓ Package "${pkgName}" removed`);
      await this._loadStaffPackages(staffId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this._appendLog(staffId, `✗ Failed to remove "${pkgName}": ${msg}`);
    }
    const { [key]: _, ...rest } = this._pkgAction;
    this._pkgAction = rest;
  }

  private _toggleSkill(staffId: string, skillId: string) {
    this._staff = this._staff.map((s) => {
      if (s.id !== staffId) return s;
      const has = s.skills.includes(skillId);
      return {
        ...s,
        skills: has ? s.skills.filter((sk) => sk !== skillId) : [...s.skills, skillId],
      };
    });
    this._persistStaff();
  }



  private _startEditName(staff: StaffMember) {
    this._editingNameId = staff.id;
    this._editNameValue = staff.name;
  }

  private _saveEditName(staffId: string) {
    if (this._editNameValue.trim()) {
      this._staff = this._staff.map((s) =>
        s.id === staffId ? { ...s, name: this._editNameValue.trim() } : s
      );
      this._persistStaff();
    }
    this._editingNameId = "";
  }

  private _addNewStaff(template?: typeof PREBUILT_TEMPLATES[number]) {
    const id = template?.id ?? `custom-${Date.now()}`;
    if (this._staff.find((s) => s.id === id)) { this._showNewPicker = false; return; }
    const newMember: StaffMember = template
      ? { ...template, skills: [...DEFAULT_SKILLS], envInstalled: false }
      : { id, icon: "\u{1F464}", name: "New Assistant", role: "Research Assistant", discipline: "General", condaEnv: "aca", description: "Custom research assistant", skills: [...DEFAULT_SKILLS], envInstalled: false };
    this._staff = [...this._staff, newMember];
    this._showNewPicker = false;
    this._persistStaff();
  }

  private _toggleAvatarPicker(staffId: string) {
    this._showAvatarPicker = this._showAvatarPicker === staffId ? "" : staffId;
  }

  private _setAvatar(staffId: string, emoji: string) {
    this._staff = this._staff.map((s) =>
      s.id === staffId ? { ...s, icon: emoji, photoUrl: undefined } : s
    );
    this._showAvatarPicker = "";
    this._persistStaff();
  }

  private _triggerPhotoUpload(staffId: string) {
    const input = this.renderRoot.querySelector(`#avatar-file-${staffId}`) as HTMLInputElement;
    input?.click();
  }

  private _handlePhotoUpload(staffId: string, e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      this._staff = this._staff.map((s) =>
        s.id === staffId ? { ...s, photoUrl: reader.result as string, icon: "" } : s
      );
      this._showAvatarPicker = "";
      this._persistStaff();
    };
    reader.readAsDataURL(file);
  }

  private _appendLog(staffId: string, line: string) {
    const current = this._installLog[staffId] ?? [];
    this._installLog = { ...this._installLog, [staffId]: [...current, line] };
    // Auto-scroll the status bar
    this.updateComplete.then(() => {
      const bar = this.renderRoot.querySelector(`#status-bar-${staffId}`);
      if (bar) bar.scrollTop = bar.scrollHeight;
    });
  }

  private _clearLog(staffId: string) {
    const { [staffId]: _l, ...logRest } = this._installLog;
    this._installLog = logRest;
    const { [staffId]: _e, ...errRest } = this._installError;
    this._installError = errRest;
  }

  private async _installStaffEnv(staffId: string) {
    this._envAction = { ...this._envAction, [staffId]: "installing" };
    this._installLog = { ...this._installLog, [staffId]: [] };
    this._installError = { ...this._installError, [staffId]: "" };
    const staff = this._getStaff(staffId);
    this._appendLog(staffId, `Creating conda environment "${staff?.condaEnv}"…`);

    const unsub = gateway.onNotification("acaclaw.env.install.progress", (data: unknown) => {
      const d = data as { name?: string; line?: string };
      if (d?.name === staff?.condaEnv && d?.line) {
        this._appendLog(staffId, d.line);
      }
    });

    try {
      await gateway.call("acaclaw.env.install", { name: staff?.condaEnv }, { timeoutMs: 600_000 });
      this._appendLog(staffId, "✓ Environment installed successfully");
      this._staff = this._staff.map((s) =>
        s.id === staffId ? { ...s, envInstalled: true } : s
      );
      this._persistStaff();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this._appendLog(staffId, `✗ Failed: ${msg}`);
      this._installError = { ...this._installError, [staffId]: msg };
    } finally {
      unsub();
      const { [staffId]: _, ...rest } = this._envAction;
      this._envAction = rest;
    }
  }

  private async _uninstallStaffEnv(staffId: string) {
    this._envAction = { ...this._envAction, [staffId]: "uninstalling" };
    this._installLog = { ...this._installLog, [staffId]: [] };
    this._installError = { ...this._installError, [staffId]: "" };
    const staff = this._getStaff(staffId);
    this._appendLog(staffId, `Removing conda environment "${staff?.condaEnv}"…`);

    const unsub = gateway.onNotification("acaclaw.env.remove.progress", (data: unknown) => {
      const d = data as { name?: string; line?: string };
      if (d?.name === staff?.condaEnv && d?.line) {
        this._appendLog(staffId, d.line);
      }
    });

    try {
      await gateway.call("acaclaw.env.remove", { name: staff?.condaEnv }, { timeoutMs: 600_000 });
      this._appendLog(staffId, "✓ Environment removed");
      this._staff = this._staff.map((s) =>
        s.id === staffId ? { ...s, envInstalled: false } : s
      );
      this._persistStaff();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this._appendLog(staffId, `✗ Failed: ${msg}`);
      this._installError = { ...this._installError, [staffId]: msg };
    } finally {
      unsub();
      const { [staffId]: _, ...rest2 } = this._envAction;
      this._envAction = rest2;
    }
  }

  private _removeSkillFromStaff(staffId: string, skillId: string) {
    this._staff = this._staff.map((s) => {
      if (s.id !== staffId) return s;
      return { ...s, skills: s.skills.filter((sk) => sk !== skillId) };
    });
    this._persistStaff();
  }

  private _addSkillToStaff(staffId: string, skillId: string) {
    this._staff = this._staff.map((s) => {
      if (s.id !== staffId) return s;
      if (s.skills.includes(skillId)) return s;
      return { ...s, skills: [...s.skills, skillId] };
    });
    this._persistStaff();
  }

  private async _searchClawhub(staffId: string) {
    const q = (this._searchQuery[staffId] ?? "").trim();
    if (!q) return;
    this._searching = true;
    try {
      const res = await gateway.call<{ results: Array<{ slug: string; name: string; score: number }> }>(
        "acaclaw.skill.search", { query: q, limit: 20 }, { timeoutMs: 15_000 },
      );
      const staff = this._getStaff(staffId);
      this._searchResults = (res?.results ?? [])
        .filter(r => !staff?.skills.includes(r.slug))
        .map(r => ({ id: r.slug, name: r.name, description: "", category: "" }));
    } catch (err) {
      console.error("[clawhub-search] error:", err);
      this._searchResults = [];
    } finally {
      this._searching = false;
    }
  }

  private _openChat(staffId: string) {
    this.dispatchEvent(
      new CustomEvent("open-agent-chat", {
        detail: { agentId: staffId },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    const available = PREBUILT_TEMPLATES.filter((t) => !this._staff.find((s) => s.id === t.id));
    return html`
      <h1>${t("staff.title")}</h1>
      <div class="page-header">
        <div class="page-header-left">
          <div class="subtitle">
            ${t("staff.subtitle")}
          </div>
        </div>
        <div style="position:relative">
          <button class="btn-new-staff" @click=${() => { this._showNewPicker = !this._showNewPicker; }}>${t("staff.newStaff")}</button>
          ${this._showNewPicker ? html`
            <div class="new-picker-overlay" @click=${() => { this._showNewPicker = false; }}></div>
            <div class="new-picker">
              ${available.map((tmpl) => html`
                <div class="new-picker-item" @click=${() => this._addNewStaff(tmpl)}>
                  <div class="new-picker-icon">${tmpl.icon}</div>
                  <div class="new-picker-info">
                    <div class="new-picker-name">${tmpl.name}</div>
                    <div class="new-picker-role">${t("staff.role." + tmpl.id) || tmpl.role} \u2014 ${tmpl.discipline}</div>
                  </div>
                </div>
              `)}
              ${available.length ? html`<div class="new-picker-divider"></div>` : ""}
              <div class="new-picker-item" @click=${() => this._addNewStaff()}>
                <div class="new-picker-icon">\u2795</div>
                <div class="new-picker-info">
                  <div class="new-picker-name">${t("staff.customStaff")}</div>
                  <div class="new-picker-role">${t("staff.customStaff.desc")}</div>
                </div>
              </div>
            </div>
          ` : ""}
        </div>
      </div>

      <div class="staff-grid">
        ${this._staff.map((s) => this._renderCard(s))}
      </div>

      ${this._panel ? this._renderPanel() : ""}
    `;
  }

  private _renderCard(s: StaffMember) {
    const isEditing = this._editingNameId === s.id;
    return html`
      <div class="staff-card ${s.editable ? "is-default" : ""}">
        <div class="staff-header">
          <div class="staff-avatar"
            @click=${() => this._toggleAvatarPicker(s.id)}>
            ${s.photoUrl
              ? html`<img class="avatar-photo" src="${s.photoUrl}" alt="${s.name}" />`
              : s.icon}
            ${this._showAvatarPicker === s.id ? html`
              <div class="avatar-picker" @click=${(e: Event) => e.stopPropagation()}>
                <button class="avatar-upload-btn" @click=${() => this._triggerPhotoUpload(s.id)}>${t("staff.uploadPhoto")}</button>
                ${AVATAR_EMOJIS.map(em => html`
                  <button @click=${() => this._setAvatar(s.id, em)}>${em}</button>
                `)}
              </div>
            ` : ""}
            <input type="file" accept="image/*" style="display:none"
              id="avatar-file-${s.id}"
              @change=${(e: Event) => this._handlePhotoUpload(s.id, e)} />
          </div>
          <div class="staff-identity">
            <div class="staff-name">
              ${isEditing
                ? html`<input
                    class="edit-name-input"
                    .value=${this._editNameValue}
                    @input=${(e: Event) => (this._editNameValue = (e.target as HTMLInputElement).value)}
                    @blur=${() => this._saveEditName(s.id)}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._saveEditName(s.id); }}
                  />`
                : html`
                    <span style="cursor:pointer" @click=${() => this._startEditName(s)}>${s.name}</span>
                  `}
            </div>
            <div class="staff-role">${t("staff.role." + s.id) || s.role}</div>
          </div>
        </div>

        <div class="kv-row">
          <div class="kv-label">${t("staff.about")}</div>
          <div class="kv-value secondary">${t("staff.desc." + s.id) || s.description}</div>
        </div>

        <div class="kv-row">
          <div class="kv-label">${t("agents.env")}</div>
          <div class="kv-value" style="display:flex;align-items:center;gap:6px">
            <span class="env-badge">
              <span class="env-status-dot ${s.envInstalled ? "installed" : "not-installed"}" style="width:6px;height:6px"></span>
              ${s.condaEnv}
            </span>
            <button class="manage-link" @click=${() => this._openPanel(s.id, "config")}>${t("staff.manage")}</button>
          </div>
        </div>

        <div class="kv-row">
          <div class="kv-label">${t("skills.title")}</div>
          <div class="kv-value" style="display:flex;align-items:center;gap:6px">
            ${this._gatewaySkillsLoaded
              ? html`<span class="skills-count">${t("staff.skillsCount", this._installedGatewaySkills.length)}</span>`
              : html`<span class="skills-count" style="color:var(--ac-text-muted)">…</span>`}
            <button class="manage-link" @click=${() => this._openPanel(s.id, "skills")}>${t("staff.manage")}</button>
          </div>
        </div>

        <div class="staff-actions">
          ${s.envInstalled ? html`
            <button class="btn-action" @click=${() => this._openPanel(s.id, "config")}>${t("staff.config")}</button>
            <button class="btn-action" @click=${() => this._openChat(s.id)}>${t("staff.chat")}</button>
          ` : html`
            ${this._envAction[s.id] === "installing" ? html`
              <button class="btn-action btn-install installing" disabled>
                <span class="install-spinner"></span>${t("staff.installing")}
              </button>
            ` : html`
              <button class="btn-action btn-install" @click=${() => this._installStaffEnv(s.id)}>${t("staff.install")}</button>
            `}
          `}
        </div>

        ${(this._installLog[s.id]?.length ?? 0) > 0 ? html`
          <div class="install-status-bar" id="status-bar-${s.id}">
            ${this._installLog[s.id]!.map(line => html`
              <div class="status-line ${line.startsWith("\u2717") ? "error" : line.startsWith("\u2713") ? "success" : ""}">${line}</div>
            `)}
          </div>
          ${!this._envAction[s.id] ? html`
            <div class="status-bar-actions">
              <button class="status-bar-dismiss" @click=${() => this._clearLog(s.id)}>${t("staff.dismiss")}</button>
            </div>
          ` : ""}
        ` : ""}
      </div>
    `;
  }

  private _renderPanel() {
    if (!this._panel) return "";
    const { staffId, type } = this._panel;
    const staff = this._getStaff(staffId);
    if (!staff) return "";

    let title = "";
    if (type === "config") title = t("staff.panel.env", staff.name);
    if (type === "skills") title = t("staff.panel.skills", staff.name);

    return html`
      <div class="panel-overlay" @click=${this._closePanel}></div>
      <div class="panel" @click=${(e: Event) => e.stopPropagation()}>
        <div class="panel-header">
          <div class="panel-title">${title}</div>
          <button class="panel-close" @click=${this._closePanel}>\u2715</button>
        </div>
        <div class="panel-body">
          ${type === "config" ? this._renderConfigPanel(staff) : ""}
          ${type === "skills" ? this._renderSkillsPanel(staff) : ""}
        </div>
        ${type === "config"
          ? html`
              <div class="panel-footer">
                <button
                  class="btn-panel-action"
                  @click=${this._closePanel}
                >${t("monitor.done")}</button>
              </div>
            `
          : ""}
        ${type === "skills"
          ? html`
              <div class="panel-footer">
                <button
                  class="btn-panel-action"
                  @click=${() => { this._persistStaff(); this._closePanel(); }}
                >${t("staff.close")}</button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private _renderConfigPanel(staff: StaffMember) {
    const envAct = this._envAction[staff.id];
    const packages = this._staffPkgs[staff.id] ?? ENV_PACKAGES[staff.condaEnv] ?? [];
    const pkgInput = this._pkgInput[staff.id] ?? "";

    return html`
      <div class="panel-section-title">${t("env.title")}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <select class="env-select" style="margin-bottom:0;flex:1"
          .value=${staff.condaEnv}
          @change=${(e: Event) => {
            const val = (e.target as HTMLSelectElement).value;
            this._setEnv(staff.id, val);
            this._loadStaffPackages(staff.id);
          }}
        >
          ${CONDA_ENVS.map(env => html`
            <option value=${env.id} ?selected=${staff.condaEnv === env.id}>${env.label}</option>
          `)}
        </select>
        <span class="env-status-dot ${staff.envInstalled ? "installed" : "not-installed"}" style="width:8px;height:8px;flex-shrink:0"></span>
        ${envAct ? html`
          <button class="env-action-sm ${envAct === "installing" ? "env-install-sm" : "env-uninstall-sm"}" disabled style="white-space:nowrap">
            ${envAct === "installing" ? t("staff.installingEnv") : t("staff.removingEnv")}
          </button>
        ` : staff.envInstalled ? html`
          <button class="env-action-sm env-uninstall-sm" @click=${() => this._uninstallStaffEnv(staff.id)} style="white-space:nowrap">${t("apikeys.remove")}</button>
        ` : html`
          <button class="env-action-sm env-install-sm" @click=${() => this._installStaffEnv(staff.id)} style="white-space:nowrap">${t("skills.install")}</button>
        `}
      </div>

      <div class="panel-section-title" style="margin-top:20px">${t("staff.packages", packages.length)}</div>
      ${packages.length > 0 ? html`
        <div class="pkg-list">
          ${packages.map(pkg => html`
            <div class="pkg-row">
              <span class="pkg-name">${pkg.name}</span>
              <span class="pkg-ver">${pkg.version}</span>
              <span class="pkg-src">${pkg.source}</span>
              <button class="pkg-remove-btn"
                ?disabled=${this._pkgAction[`${staff.id}:${pkg.name}`] === "removing"}
                @click=${() => this._removePackage(staff.id, pkg.name)}>
                ${this._pkgAction[`${staff.id}:${pkg.name}`] === "removing" ? t("staff.removingPkg") : t("staff.remove")}
              </button>
            </div>
          `)}
        </div>
      ` : html`<p style="color:var(--ac-text-muted);font-size:13px;margin-bottom:12px">${t("staff.noPackages")}</p>`}

      <div class="pkg-install-row">
        <input class="pkg-install-input"
          placeholder=${t("staff.pkgPlaceholder")}
          .value=${pkgInput}
          @input=${(e: Event) => { this._pkgInput = { ...this._pkgInput, [staff.id]: (e.target as HTMLInputElement).value }; }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" && pkgInput.trim()) this._installPackage(staff.id); }}
        />
        <button class="pkg-install-btn"
          ?disabled=${!pkgInput.trim() || this._pkgAction[`${staff.id}:install`] === "installing"}
          @click=${() => this._installPackage(staff.id)}>
          ${this._pkgAction[`${staff.id}:install`] === "installing" ? t("staff.pkgInstalling") : t("staff.addPkg")}
        </button>
      </div>

      ${(this._installLog[staff.id]?.length ?? 0) > 0 ? html`
        <div class="panel-section-title" style="margin-top:20px">${t("agents.status")}</div>
        <div class="install-status-bar" id="status-bar-${staff.id}">
          ${this._installLog[staff.id]!.map(line => html`
            <div class="status-line ${line.startsWith("\u2717") ? "error" : line.startsWith("\u2713") ? "success" : ""}">${line}</div>
          `)}
        </div>
        ${!this._envAction[staff.id] && !Object.keys(this._pkgAction).some(k => k.startsWith(staff.id)) ? html`
          <div class="status-bar-actions">
            <button class="status-bar-dismiss" @click=${() => this._clearLog(staff.id)}>${t("staff.clearLog")}</button>
          </div>
        ` : ""}
      ` : ""}
    `;
  }

  private _renderSkillsPanel(staff: StaffMember) {
    const query = this._searchQuery[staff.id] ?? "";
    // Merge AVAILABLE_SKILLS + gateway skills into unified list
    const seenNames = new Set<string>();
    const allSkills: Array<{
      id: string; name: string; description: string; category: string;
      installed: boolean; bundled: boolean; eligible: boolean;
      installOptions: Array<{ id: string; kind: string; label: string }>;
      disciplines: SkillDiscipline[];
    }> = [];
    // Gateway skills first
    for (const gw of this._gatewaySkills) {
      seenNames.add(gw.name);
      // Match curated entry by slug or dynamic/static gateway name mapping
      const avail = AVAILABLE_SKILLS.find(a =>
        a.id === gw.name || this._resolveGatewayName(a.id) === gw.name
      );
      if (avail) {
        // Mark the curated slug as seen so it's not double-added below
        seenNames.add(avail.id);
      }
      allSkills.push({
        id: avail?.id ?? gw.name, name: avail?.name ?? gw.name,
        description: avail?.description ?? gw.description,
        category: avail?.category ?? (gw.bundled ? "Foundation" : gw.source),
        installed: gw.eligible, bundled: gw.bundled, eligible: gw.eligible,
        installOptions: gw.install ?? [],
        disciplines: avail?.disciplines ?? ["cross"],
      });
    }
    // Then AVAILABLE_SKILLS not in gateway (check both slug and resolved gateway name)
    for (const av of AVAILABLE_SKILLS) {
      if (seenNames.has(av.id)) continue;
      // Also skip if the resolved gateway name was already added
      const resolved = this._resolveGatewayName(av.id);
      if (resolved !== av.id && seenNames.has(resolved)) continue;
      allSkills.push({
        id: av.id, name: av.name, description: av.description,
        category: av.category, installed: false, bundled: false,
        eligible: false, installOptions: [],
        disciplines: av.disciplines,
      });
    }

    // Filter skills by this staff member's discipline, excluding bundled (always available)
    const relevantSkills = allSkills.filter(s =>
      !s.bundled && skillMatchesDiscipline({ disciplines: s.disciplines } as AvailableSkill, staff.discipline)
    );

    // Group by category, preserving order
    const categoryOrder: string[] = [];
    const byCategory = new Map<string, typeof relevantSkills>();
    for (const skill of relevantSkills) {
      if (!byCategory.has(skill.category)) {
        categoryOrder.push(skill.category);
        byCategory.set(skill.category, []);
      }
      byCategory.get(skill.category)!.push(skill);
    }

    // Installed skills = non-bundled + agent-required bundled (same definition as Skills view)
    const installed = this._installedGatewaySkills;

    return html`
      <div class="panel-section-title">${t("staff.installedSkills", installed.length)}</div>
      <div class="skill-pills" style="margin-bottom:20px">
        ${installed.map(gw => html`
          <span class="skill-pill ${gw.bundled ? "bundled" : ""}" title="${gw.description || gw.name}">
            ${gw.name}
          </span>
        `)}
      </div>

      <div class="panel-section-title">${t("staff.searchClawHub")}</div>
      <div class="search-skill-bar" style="margin-bottom:12px">
        <input class="search-skill-input" placeholder=${t("staff.searchPlaceholder")}
          .value=${query}
          @input=${(e: Event) => { this._searchQuery = { ...this._searchQuery, [staff.id]: (e.target as HTMLInputElement).value }; this._searchResults = []; }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._searchClawhub(staff.id); }}
        />
        <button class="search-skill-btn" ?disabled=${!query.trim() || this._searching}
          @click=${() => this._searchClawhub(staff.id)}>\u{1F50D}</button>
      </div>
      ${this._searchResults.length > 0 && query ? html`
        <div class="search-results" style="margin-bottom:20px">
          ${this._searchResults.slice(0, 5).map(r => html`
            <div class="search-result-item">
              <span class="search-result-name">${r.name}</span>
              <span class="search-result-desc">${r.description}</span>
              <button class="search-result-add"
                ?disabled=${this._skillInstalling[r.id] ?? false}
                @click=${() => {
                if (!AVAILABLE_SKILLS.find(a => a.id === r.id)) {
                  AVAILABLE_SKILLS.push({ ...r, default: false, disciplines: ["cross"] });
                }
                this._searchResults = this._searchResults.filter(x => x.id !== r.id);
                this._installClawHubSkill(staff.id, r.id);
              }}>${this._skillInstalling[r.id] ? t("skills.installing") : t("staff.installAndAdd")}</button>
            </div>
          `)}
        </div>
      ` : ""}

      <div class="panel-section-title" style="margin-bottom:4px">
        ${t("staff.recommendedFor", staff.discipline)}
        <span style="font-size:11px;color:var(--ac-text-muted);font-weight:normal;margin-left:6px">(${t("staff.skillsCount", relevantSkills.length)})</span>
      </div>
      ${categoryOrder.map(cat => html`
        <div style="margin-top:12px;margin-bottom:6px;font-size:12px;font-weight:600;color:var(--ac-text-muted);text-transform:uppercase;letter-spacing:0.5px">${cat}</div>
        ${byCategory.get(cat)!.map((skill) => {
          const installing = this._skillInstalling[skill.name] ?? false;
          const uninstalling = this._skillUninstalling[skill.id] ?? false;
          // skill.installed and skill.bundled/eligible are set during the gateway merge above —
          // no need to re-lookup by name (which would fail for slug≠gatewayName cases)
          const isBundledEligible = skill.bundled && skill.eligible;
          const isAvailable = isBundledEligible || skill.installed;
          return html`
            <div class="skill-check-item ${isAvailable ? "assigned" : ""}">
              <div class="skill-checkbox">${isAvailable ? "\u2713" : ""}</div>
              <div class="skill-check-info">
                <div class="skill-check-name">${skill.name}</div>
                <div class="skill-check-desc">${skill.description}</div>
              </div>
              ${isAvailable ? html`
                <span style="flex-shrink:0;font-size:11px;color:var(--ac-text-muted)">${isBundledEligible ? t("skills.Bundled") : ""}</span>
                ${!isBundledEligible ? html`
                  <button class="search-result-add" style="flex-shrink:0;font-size:11px;background:transparent;color:var(--ac-danger,#e53935);border-color:var(--ac-danger,#e53935)"
                    ?disabled=${uninstalling}
                    @click=${(e: Event) => { e.stopPropagation(); this._uninstallSkill(skill.id); }}>
                    ${uninstalling ? t("staff.removing") : t("settings.tab.uninstall")}
                  </button>
                ` : ""}
              ` : html`
                <button class="search-result-add" style="flex-shrink:0;background:var(--ac-primary);color:#fff;border-color:var(--ac-primary)"
                  ?disabled=${installing}
                  @click=${(e: Event) => { e.stopPropagation(); this._installClawHubSkill(staff.id, skill.id); }}>
                  ${installing ? t("staff.skillInstalling") : t("env.pkgInstall")}
                </button>
              `}
            </div>
          `;
        })}
      `)}

      ${this._skillInstallLog.length > 0 ? html`
        <div class="panel-section-title" style="margin-top:20px">${t("staff.installLog")}</div>
        <div class="install-status-bar" style="max-height:200px;overflow-y:auto">
          ${this._skillInstallLog.map(line => html`
            <div class="status-line ${line.startsWith("\u2717") ? "error" : line.startsWith("\u2713") ? "success" : ""}">${line}</div>
          `)}
        </div>
        ${Object.keys(this._skillInstalling).length === 0 ? html`
          <div class="status-bar-actions">
            <button class="status-bar-dismiss" @click=${() => { this._skillInstallLog = []; }}>${t("staff.clearLog")}</button>
          </div>
        ` : ""}
      ` : ""}
    `;
  }
}
