import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";
import {
  FEATURED_CATEGORIES,
  DISCIPLINE_CATEGORIES,
  TOP_SKILLS,
  type FeaturedSkill,
  type SkillCategory,
} from "../data/featured-skills.js";

/** Skills from skills.json agent_required — bundled by gateway but installed via clawhub. */
const AGENT_REQUIRED_SKILLS = new Set(["nano-pdf", "xurl", "summarize", "humanizer"]);

/** Base skills that ship with every AcaClaw install (from skills.json). */
const BASE_SKILLS: Skill[] = [
  { name: "summarize", description: "Summarize web pages, PDFs, images, audio, and YouTube", source: "clawhub-repo", bundled: false, disabled: false, eligible: true, install: [] },
  { name: "nano-pdf", description: "Edit PDFs with natural-language instructions", source: "clawhub-repo", bundled: false, disabled: false, eligible: true, install: [] },
  { name: "xurl", description: "Twitter content intelligence and URL extraction", source: "clawhub-repo", bundled: false, disabled: false, eligible: true, install: [] },
  { name: "humanizer", description: "Humanize AI-generated text", source: "clawhub-repo", bundled: false, disabled: false, eligible: true, install: [] },
  { name: "coding-agent", description: "Multi-language code generation, debugging, and refactoring", source: "openclaw-bundled", bundled: true, disabled: false, eligible: true, install: [] },
  { name: "clawhub", description: "Search, install, and manage skills from ClawHub", source: "openclaw-bundled", bundled: true, disabled: false, eligible: true, install: [] },
];

/** A skill counts as user-installed if managed OR in the agent-required list. */
const isUserInstalled = (s: { name: string; source: string }) =>
  s.source !== "openclaw-bundled" || AGENT_REQUIRED_SKILLS.has(s.name);

interface Skill {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  disabled: boolean;
  eligible: boolean;
  install: Array<{ id: string; kind: string; label: string }>;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  requirements?: { bins: string[]; env: string[]; config: string[]; os: string[] };
  missing?: { bins: string[]; env: string[]; config: string[]; os: string[] };
}

interface ClawHubSkill {
  name: string;
  description: string;
  author: string;
  category: string;
  recommended?: boolean;
  /** Gateway skill name when it differs from the clawhub slug. */
  gatewayName?: string;
}

/** Unified target for the detail panel — works for installed, featured, and search skills. */
interface DetailTarget {
  name: string;
  slug: string;
  description: string;
  source?: string;
  url?: string;
  author?: string;
  installed?: Skill;
}

/** ClawHub API response shape for GET /api/skill?slug={slug} */
interface ClawHubDetail {
  skill: {
    slug: string;
    displayName: string;
    summary: string;
    stats: { stars: number; downloads: number; installsAllTime: number; installsCurrent: number; comments: number; versions: number };
  };
  latestVersion: { version: string; changelog: string };
  owner: { handle: string; displayName: string; image: string };
}

/** AcaClaw curated skills available on ClawHub */
const CURATED_SKILLS: ClawHubSkill[] = [
  { name: "ai-humanizer", description: "Detect and remove AI-typical writing patterns", author: "clawhub", category: "Writing", recommended: true, gatewayName: "humanizer" },
  { name: "academic-deep-research", description: "Transparent, rigorous research across academic databases with audit trail", author: "clawhub", category: "Research", recommended: true },
  { name: "academic-citation-manager", description: "Format references in APA, Vancouver, Nature, and 9000+ styles", author: "clawhub", category: "Research", recommended: true },
  { name: "data-analyst", description: "Data visualisation, reports, SQL, spreadsheets", author: "clawhub", category: "Data Analysis", recommended: true },
  { name: "mermaid", description: "Generate diagrams (flowcharts, sequence, class) from text", author: "clawhub", category: "Data Analysis" },
  { name: "academic-writing", description: "Expert agent for scholarly papers, literature reviews, methodology", author: "clawhub", category: "Writing" },
  { name: "literature-review", description: "Search Semantic Scholar, OpenAlex, Crossref, and PubMed with auto-dedup and synthesis", author: "weird-aftertaste", category: "Research", recommended: true },
  { name: "pubmed-edirect", description: "Deep PubMed search via NCBI EDirect — batch abstracts, CSV export, cross-database linking", author: "killgfat", category: "Research", recommended: true },
  { name: "pandoc-convert-openclaw", description: "Convert between Word, PDF, LaTeX, and Markdown via Pandoc", author: "clawhub", category: "Documents", gatewayName: "pandoc-convert" },
  { name: "autonomous-research", description: "Multi-step independent research for qualitative or quantitative studies", author: "clawhub", category: "Research" },
];

/** Category filter options for Featured tab */
type FeaturedFilter = "all" | "academic" | "disciplines";

@customElement("acaclaw-skills")
export class SkillsView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _tab: "installed" | "featured" = "featured";
  @state() private _installed: Skill[] = [];
  @state() private _featuredFilter: FeaturedFilter = "all";
  @state() private _activeCategory = "";
  @state() private _searchQuery = "";
  @state() private _installing = "";
  @state() private _uninstalling = "";
  @state() private _installLog: string[] = [];
  @state() private _searchResults: ClawHubSkill[] | null = null;
  @state() private _searching = false;
  @state() private _logExpanded = true;
  @state() private _logDismissed = false;
  @state() private _detailTarget: DetailTarget | null = null;
  @state() private _detailApiKey = "";
  @state() private _detailSaving = false;
  @state() private _detailMessage: { kind: "success" | "error"; text: string } | null = null;
  @state() private _clawhubDetail: ClawHubDetail | null = null;
  @state() private _clawhubLoading = false;
  /** In-memory cache: slug -> { data, fetchedAt }. 5-min TTL. */
  private _clawhubCache = new Map<string, { data: ClawHubDetail; fetchedAt: number }>();
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private _gatewayListener: EventListener | null = null;
  /** Sequential install queue — prevents concurrent clawhub CLI calls. */
  private _installQueue: Promise<void> = Promise.resolve();

  /** Dynamic slug→gatewayName mapping shared with staff view via localStorage. */
  private _slugToGateway = new Map<string, string>();
  private static readonly SLUG_MAP_KEY = "acaclaw.slugToGateway";

  static override styles = css`
    :host {
      display: block;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 24px;
      color: var(--ac-text);
    }

    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--ac-border);
    }
    .tab {
      padding: 10px 20px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ac-text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color 0.15s;
    }
    .tab:hover {
      color: var(--ac-text);
    }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
      font-weight: 600;
    }

    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      align-items: center;
    }
    .searching-indicator {
      color: var(--ac-text-muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .search-input {
      flex: 1;
      padding: 8px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      background: var(--ac-bg-surface);
    }
    .search-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }

    .skill-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .skill-card {
      display: flex;
      flex-direction: column;
      padding: 20px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      box-shadow: var(--ac-shadow-sm);
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    .skill-card:hover {
      box-shadow: var(--ac-shadow-md, 0 4px 12px rgba(0,0,0,0.08));
      border-color: var(--ac-primary-bg, #dbeafe);
    }

    .skill-info {
      flex: 1;
      min-width: 0;
    }
    .skill-name {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .skill-version {
      font-size: 12px;
      color: var(--ac-text-muted);
      font-weight: 400;
    }
    .skill-desc {
      font-size: 13px;
      color: var(--ac-text-secondary);
      margin-top: 6px;
      line-height: 1.4;
    }
    .skill-meta {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-top: 8px;
    }

    .skill-actions {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      flex-shrink: 0;
    }

    .action-btn {
      padding: 6px 14px;
      border-radius: var(--ac-radius-full);
      font-size: 12px;
      font-weight: 500;
      transition: all var(--ac-transition-fast);
      cursor: pointer;
    }

    .update-btn {
      background: var(--ac-primary-bg);
      color: var(--ac-primary);
      border: 1px solid var(--ac-primary);
    }
    .update-btn:hover {
      background: var(--ac-primary);
      color: #fff;
      box-shadow: var(--ac-shadow-xs);
    }

    .disable-btn {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      color: var(--ac-text-secondary);
    }
    .disable-btn:hover {
      background: var(--ac-bg-hover);
      border-color: var(--ac-text-secondary);
    }
    .uninstall-btn {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      color: var(--ac-danger, #e53935);
      font-size: 11px;
    }
    .uninstall-btn:hover {
      background: var(--ac-danger, #e53935);
      color: #fff;
      border-color: var(--ac-danger, #e53935);
    }
    .uninstall-btn:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .install-btn {
      background: var(--ac-primary);
      color: #fff;
    }
    .install-btn:hover {
      background: var(--ac-primary-dark);
      box-shadow: var(--ac-shadow-xs);
      transform: translateY(-1px);
    }
    .install-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .recommended-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;
      border-radius: 10px;
    }

    .rating {
      font-size: 12px;
      color: var(--ac-text-secondary);
    }

    .footer-stats {
      margin-top: 16px;
      font-size: 12px;
      color: var(--ac-text-muted);
    }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--ac-text-muted);
    }

    /* ══════════════════════════════════════════════
       Featured tab — App Store card-based design
       ══════════════════════════════════════════════ */

    /* ── Hero banner ── */
    .featured-hero {
      margin: 0 -4px 28px;
      padding: 28px 24px 24px;
      background: linear-gradient(145deg, #042f2e 0%, #0f766e 55%, #0d9488 100%);
      border-radius: 20px;
      position: relative;
      overflow: hidden;
    }
    .featured-hero::after {
      content: "";
      position: absolute;
      top: -40%; right: -10%;
      width: 300px; height: 300px;
      background: radial-gradient(circle, rgba(45,212,191,0.18) 0%, transparent 70%);
      pointer-events: none;
    }
    .featured-hero-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(255,255,255,0.55);
      margin-bottom: 6px;
      position: relative;
    }
    .featured-hero h2 {
      font-size: 24px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 4px;
      letter-spacing: -0.02em;
      position: relative;
    }
    .featured-hero p {
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 20px;
      position: relative;
    }

    /* ── Hero card grid ── */
    .hero-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 10px;
      position: relative;
    }
    .hero-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      transition: background 0.15s, transform 0.15s;
    }
    .hero-card:hover {
      background: rgba(255,255,255,0.14);
      transform: translateY(-1px);
    }
    .hero-card-rank {
      font-size: 18px;
      font-weight: 800;
      color: rgba(255,255,255,0.22);
      width: 22px;
      text-align: center;
      flex-shrink: 0;
    }
    .hero-card-info {
      flex: 1;
      min-width: 0;
    }
    .hero-card-name {
      font-weight: 600;
      font-size: 13px;
      color: #fff;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hero-card-desc {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Skill icon (shared) ── */
    .skill-icon {
      width: 44px;
      height: 44px;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }

    /* ── GET / OPEN button ── */
    .get-btn {
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
      background: var(--ac-primary);
      color: #fff;
    }
    .get-btn:hover {
      filter: brightness(1.1);
      box-shadow: 0 2px 8px rgba(13,148,136,0.35);
      transform: translateY(-1px);
    }
    .get-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .get-btn.installed {
      background: var(--ac-success-bg, #ecfdf5);
      color: var(--ac-success, #059669);
      cursor: default;
    }
    .get-btn.installed:hover {
      transform: none;
      box-shadow: none;
      filter: none;
    }
    .get-btn-hero {
      padding: 5px 16px;
      font-size: 13px;
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
    .get-btn-hero:hover {
      background: rgba(255,255,255,0.35);
      box-shadow: none;
    }
    .get-btn-hero.installed {
      background: rgba(52,211,153,0.2);
      color: #6ee7b7;
    }
    .hero-show-more {
      display: block;
      margin-top: 8px;
      padding: 8px 0;
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      color: rgba(255,255,255,0.55);
      cursor: pointer;
      border: none;
      background: none;
      transition: color 0.15s;
      position: relative;
    }
    .hero-show-more:hover { color: #fff; }

    /* ── Filter chips ── */
    .filter-chips {
      display: flex;
      gap: 8px;
      margin-bottom: 28px;
      flex-wrap: wrap;
    }
    .filter-chip {
      padding: 7px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid var(--ac-border);
      color: var(--ac-text-secondary);
      background: var(--ac-bg-surface);
      cursor: pointer;
      transition: all 0.15s;
    }
    .filter-chip:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
    }
    .filter-chip.active {
      background: var(--ac-primary);
      color: #fff;
      border-color: var(--ac-primary);
      box-shadow: 0 2px 8px rgba(13,148,136,0.25);
    }

    /* ── Category section ── */
    .category-section {
      margin-bottom: 36px;
    }
    .category-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--ac-border);
    }
    .category-icon {
      font-size: 22px;
      line-height: 1;
    }
    .category-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--ac-text);
      letter-spacing: -0.02em;
    }
    .category-subtitle {
      font-size: 12px;
      color: var(--ac-text-muted);
      margin-bottom: 14px;
      padding-left: 32px;
    }
    .category-divider-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 6px 0 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ac-text-muted);
    }

    /* ── Featured card grid ── */
    .featured-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      margin-bottom: 8px;
    }
    .featured-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03);
      transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
    }
    .featured-card:hover {
      box-shadow: 0 6px 20px rgba(0,0,0,0.08);
      transform: translateY(-2px);
      border-color: var(--ac-primary-bg, #ccfbf1);
    }
    .featured-card-body {
      flex: 1;
      min-width: 0;
    }
    .featured-card-name {
      font-weight: 700;
      font-size: 14px;
      color: var(--ac-text);
      margin-bottom: 2px;
      line-height: 1.3;
    }
    .featured-card-desc {
      font-size: 12px;
      color: var(--ac-text-secondary);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .featured-card-author {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-top: 3px;
    }
    .featured-card-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .featured-link {
      font-size: 10px;
      color: var(--ac-primary);
      text-decoration: none;
      font-weight: 500;
    }
    .featured-link:hover {
      text-decoration: underline;
    }

    /* ── Install progress panel (sticky bottom) ── */
    .install-panel {
      position: sticky;
      bottom: 0;
      left: 0; right: 0;
      z-index: 100;
      background: var(--ac-bg-surface);
      border-top: 1px solid var(--ac-border);
      box-shadow: 0 -4px 16px rgba(0,0,0,0.08);
      margin: 0 -32px -32px;
      animation: slide-up 0.2s ease;
    }
    @keyframes slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .install-panel-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      cursor: pointer;
      user-select: none;
    }
    .install-panel-header:hover {
      background: var(--ac-bg-hover);
    }
    .install-status-icon {
      width: 18px; height: 18px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .install-spinner {
      width: 16px; height: 16px;
      border: 2px solid var(--ac-border);
      border-top-color: var(--ac-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .install-check { color: var(--ac-success, #059669); font-size: 16px; font-weight: 700; }
    .install-fail { color: var(--ac-error, #ef4444); font-size: 16px; font-weight: 700; }
    .install-panel-title {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      color: var(--ac-text);
    }
    .install-panel-toggle {
      font-size: 11px;
      color: var(--ac-text-muted);
      background: none; border: none; cursor: pointer;
      padding: 2px 8px;
    }
    .install-panel-dismiss {
      font-size: 16px;
      color: var(--ac-text-muted);
      background: none; border: none; cursor: pointer;
      padding: 2px 6px; border-radius: 4px;
      transition: all 0.15s;
    }
    .install-panel-dismiss:hover {
      background: var(--ac-bg-hover); color: var(--ac-text);
    }

    /* Progress bar */
    .install-progress-bar {
      height: 3px;
      background: var(--ac-bg-hover, #f0f0f0);
      overflow: hidden;
    }
    .install-progress-fill {
      height: 100%;
      background: var(--ac-primary);
      border-radius: 2px;
      animation: progress-indeterminate 1.5s ease infinite;
    }
    @keyframes progress-indeterminate {
      0% { width: 0; margin-left: 0; }
      50% { width: 40%; margin-left: 30%; }
      100% { width: 0; margin-left: 100%; }
    }
    .install-progress-fill.done {
      width: 100% !important;
      margin-left: 0 !important;
      animation: none;
      background: var(--ac-success, #059669);
      transition: width 0.3s;
    }
    .install-progress-fill.error {
      width: 100% !important;
      margin-left: 0 !important;
      animation: none;
      background: var(--ac-error, #ef4444);
    }

    /* Log area */
    .install-log {
      max-height: 180px;
      overflow-y: auto;
      padding: 8px 20px 12px;
      font-family: "Fira Code", "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      line-height: 1.6;
      color: var(--ac-text-secondary);
    }
    .install-log-line {
      white-space: pre-wrap;
      word-break: break-all;
    }
    .install-log-line.success { color: var(--ac-success, #059669); }
    .install-log-line.error { color: var(--ac-error, #ef4444); }
    .install-log-line.start { color: var(--ac-primary); font-weight: 600; }

    /* ── Skill detail / setup panel ── */
    .detail-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 200;
      display: flex; align-items: center; justify-content: center;
      animation: fade-in 0.15s ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    .detail-panel {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-lg);
      width: 480px; max-width: 90vw; max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .detail-header {
      display: flex; align-items: center; gap: 12px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--ac-border-subtle);
    }
    .detail-header .skill-icon { width: 48px; height: 48px; font-size: 20px; border-radius: 13px; }
    .detail-header-info { flex: 1; min-width: 0; }
    .detail-header-name { font-size: 18px; font-weight: 700; color: var(--ac-text); }
    .detail-header-source { font-size: 11px; color: var(--ac-text-muted); margin-top: 2px; }
    .detail-close {
      padding: 6px 14px; border-radius: var(--ac-radius-full); font-size: 12px; font-weight: 500;
      background: var(--ac-bg-hover); border: 1px solid var(--ac-border); cursor: pointer;
      color: var(--ac-text-secondary); transition: all 0.15s;
    }
    .detail-close:hover { border-color: var(--ac-primary); color: var(--ac-primary); }
    .detail-body { padding: 20px 24px; display: grid; gap: 16px; }
    .detail-desc { font-size: 14px; line-height: 1.5; color: var(--ac-text); }
    .detail-section { display: grid; gap: 8px; }
    .detail-section-title { font-size: 12px; font-weight: 600; color: var(--ac-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
    .detail-toggle-row { display: flex; align-items: center; gap: 12px; }
    .detail-toggle {
      width: 40px; height: 22px; border-radius: 11px; position: relative;
      background: var(--ac-bg-hover); border: 1px solid var(--ac-border);
      cursor: pointer; transition: all 0.2s;
    }
    .detail-toggle.on { background: var(--ac-primary); border-color: var(--ac-primary); }
    .detail-toggle::after {
      content: ""; position: absolute; top: 2px; left: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #fff; transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .detail-toggle.on::after { transform: translateX(18px); }
    .detail-toggle-label { font-size: 13px; font-weight: 500; color: var(--ac-text); }
    .detail-field { display: grid; gap: 6px; }
    .detail-field label { font-size: 12px; font-weight: 600; color: var(--ac-text-secondary); }
    .detail-field input {
      padding: 8px 12px; font-size: 13px;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius);
      background: var(--ac-bg); color: var(--ac-text); box-sizing: border-box;
    }
    .detail-field input:focus { outline: none; border-color: var(--ac-primary); box-shadow: 0 0 0 2px rgba(13,148,136,0.15); }
    .detail-field .field-hint { font-size: 11px; color: var(--ac-text-muted); }
    .detail-field .field-hint a { color: var(--ac-primary); }
    .detail-save-btn {
      padding: 8px 20px; border-radius: var(--ac-radius-full); font-size: 13px; font-weight: 600;
      background: var(--ac-primary); color: #fff; border: none; cursor: pointer; transition: opacity 0.15s;
    }
    .detail-save-btn:hover { opacity: 0.9; }
    .detail-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .detail-callout {
      padding: 10px 14px; border-radius: var(--ac-radius); font-size: 12px; line-height: 1.5;
    }
    .detail-callout.warn { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .detail-callout.success { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .detail-callout.error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .detail-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .detail-chip {
      padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 500;
    }
    .detail-chip.ok { background: #ecfdf5; color: #059669; }
    .detail-chip.missing { background: #fef2f2; color: #dc2626; }
    .detail-chip.disabled { background: #f3f4f6; color: #6b7280; }

    /* ── ClawHub stats row ── */
    .detail-stats {
      display: flex; gap: 16px; flex-wrap: wrap;
      padding: 10px 0;
    }
    .detail-stat {
      display: flex; align-items: center; gap: 5px;
      font-size: 13px; color: var(--ac-text-secondary); font-weight: 500;
    }
    .detail-stat svg { flex-shrink: 0; }
    .detail-stat .stat-value { font-weight: 700; color: var(--ac-text); }

    /* ── Owner row ── */
    .detail-owner {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: var(--ac-text-secondary);
    }
    .detail-owner-avatar {
      width: 24px; height: 24px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0;
      border: 1px solid var(--ac-border);
    }
    .detail-owner a { color: var(--ac-primary); text-decoration: none; font-weight: 600; }
    .detail-owner a:hover { text-decoration: underline; }

    /* ── Version badge ── */
    .detail-version {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; color: var(--ac-text-muted);
      background: var(--ac-bg-hover); padding: 3px 10px; border-radius: 10px;
    }

    /* ── Loading skeleton ── */
    .detail-skeleton {
      height: 14px; border-radius: 6px;
      background: linear-gradient(90deg, var(--ac-bg-hover) 25%, var(--ac-border) 50%, var(--ac-bg-hover) 75%);
      background-size: 200% 100%;
      animation: skeleton-pulse 1.5s ease infinite;
    }
    @keyframes skeleton-pulse {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadSlugMap();
    // Seed with base skills so installed tab shows content even without gateway
    if (this._installed.length === 0) {
      this._installed = [...BASE_SKILLS];
    }
    if (gateway.state === "connected") {
      this._loadSkills();
    }
    this._gatewayListener = ((e: CustomEvent) => {
      if (e.detail.state === "connected") this._loadSkills();
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

  private async _loadSkills() {
    try {
      const res = await gateway.call<{ skills: Skill[] }>("skills.status");
      if (res?.skills) {
        // Preserve synthetic entries added during this session that the gateway doesn't know about yet
        const returnedNames = new Set(res.skills.map(s => s.name));
        const synthetics = this._installed.filter(
          s => s.source === "clawhub-repo" && !returnedNames.has(s.name),
        );
        this._installed = [...res.skills, ...synthetics];
      }
    } catch { /* gateway not ready — keep empty */ }
  }

  /** Load persisted slug→gateway name map from localStorage. */
  private _loadSlugMap() {
    try {
      const raw = localStorage.getItem(SkillsView.SLUG_MAP_KEY);
      if (raw) {
        this._slugToGateway = new Map(JSON.parse(raw) as [string, string][]);
      }
    } catch { /* ignore */ }
    // Seed with static known mappings from CURATED_SKILLS
    for (const s of CURATED_SKILLS) {
      if (s.gatewayName && !this._slugToGateway.has(s.name)) {
        this._slugToGateway.set(s.name, s.gatewayName);
      }
    }
  }

  /** Resolve installed name for a clawhub slug. */
  private _resolveGatewayName(slug: string): string {
    return this._slugToGateway.get(slug) ?? CURATED_SKILLS.find(s => s.name === slug)?.gatewayName ?? slug;
  }

  private _installSkill(name: string) {
    this._installing = name;
    this._installQueue = this._installQueue
      .then(() => this._queueCooldown())
      .then(() => this._doInstallSkill(name))
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

  private async _doInstallSkill(name: string) {
    this._logDismissed = false;
    this._logExpanded = true;
    this._installLog = [...this._installLog, `▶ Installing "${name}" from ClawHub…`];

    // Snapshot current gateway names for diff
    const namesBefore = new Set(this._installed.map(s => s.name));

    const unsub = gateway.onNotification("acaclaw.skill.install.progress", (data: unknown) => {
      const d = data as { slug?: string; line?: string };
      if (d?.slug === name && d?.line) {
        this._installLog = [...this._installLog, d.line];
      }
    });

    try {
      const res = await gateway.call<{ ok: boolean; slug: string; installed?: boolean; alreadyExists?: boolean }>(
        "acaclaw.skill.install",
        { slug: name },
        { timeoutMs: 120_000 },
      );
      if (res?.installed) {
        this._installLog = [...this._installLog, `✓ "${name}" installed successfully`];
      }
      await this._loadSkills();

      // If install succeeded but gateway's skills.status doesn't list it,
      // add synthetic entry so UI shows it as installed
      if (res?.installed) {
        const resolved = this._resolveGatewayName(name);
        const found = this._installed.some(s => s.name === name || s.name === resolved);
        if (!found) {
          const curated = CURATED_SKILLS.find(s => s.name === name);
          this._installed = [...this._installed, {
            name: resolved, description: curated?.description ?? name,
            source: "clawhub-repo", bundled: false, disabled: false, eligible: true,
            install: [],
          }];
        }
      }

      // Detect slug→gatewayName mapping by finding new entries
      for (const s of this._installed) {
        if (!namesBefore.has(s.name) && s.name !== name) {
          this._slugToGateway.set(name, s.name);
          try { localStorage.setItem(SkillsView.SLUG_MAP_KEY, JSON.stringify([...this._slugToGateway])); } catch { /* */ }
          break;
        }
      }
    } catch (err) {
      this._installLog = [...this._installLog, `✗ Failed: ${err instanceof Error ? err.message : String(err)}`];
    } finally {
      unsub();
      this._lastQueueOp = Date.now();
    }
    this._installing = "";
  }

  private async _toggleSkill(skillKey: string, enabled: boolean) {
    try {
      await gateway.call("skills.update", { skillKey, enabled });
      await this._loadSkills();
    } catch { /* ignore */ }
  }

  /** Resolve the clawhub slug for a gateway skill name (reverse lookup). */
  private _resolveSlug(gatewayName: string): string {
    for (const [slug, gw] of this._slugToGateway) {
      if (gw === gatewayName) return slug;
    }
    for (const s of CURATED_SKILLS) {
      if (s.gatewayName === gatewayName) return s.name;
    }
    return gatewayName;
  }

  private _uninstallSkill(gatewayName: string) {
    this._uninstalling = gatewayName;
    this._installQueue = this._installQueue
      .then(() => this._queueCooldown())
      .then(() => this._doUninstallSkill(gatewayName))
      .catch(() => {});
  }

  private async _doUninstallSkill(gatewayName: string) {
    const slug = this._resolveSlug(gatewayName);
    this._logDismissed = false;
    this._logExpanded = true;
    this._installLog = [...this._installLog, `▶ Uninstalling "${slug}"…`];

    const unsub = gateway.onNotification("acaclaw.skill.uninstall.progress", (data: unknown) => {
      const d = data as { slug?: string; line?: string };
      if (d?.slug === slug && d?.line) {
        this._installLog = [...this._installLog, d.line];
      }
    });

    try {
      const res = await gateway.call<{ ok: boolean; slug: string; uninstalled?: boolean }>(
        "acaclaw.skill.uninstall",
        { slug },
        { timeoutMs: 60_000 },
      );
      if (res?.uninstalled) {
        this._installLog = [...this._installLog, `✓ "${slug}" uninstalled`];
      }
      await this._loadSkills();
    } catch (err) {
      this._installLog = [...this._installLog, `✗ Failed: ${err instanceof Error ? err.message : String(err)}`];
    } finally {
      unsub();
      this._lastQueueOp = Date.now();
      this._uninstalling = "";
    }
  }
  private _filteredInstalled(): Skill[] {
    const sorted = [...this._installed].sort((a, b) => {
      const aUser = isUserInstalled(a) ? 0 : 1;
      const bUser = isUserInstalled(b) ? 0 : 1;
      return aUser - bUser || a.name.localeCompare(b.name);
    });
    if (!this._searchQuery) return sorted;
    const q = this._searchQuery.toLowerCase();
    return sorted.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }

  private async _searchClawHub(query: string) {
    if (!query.trim()) {
      this._searchResults = null;
      return;
    }
    this._searching = true;
    try {
      const res = await gateway.call<{ results: Array<{ slug: string; name: string; score: number }> }>(
        "acaclaw.skill.search", { query: query.trim(), limit: 20 }, { timeoutMs: 15_000 },
      );
      this._searchResults = (res?.results ?? []).map(r => ({
        name: r.slug,
        description: r.name,
        author: "clawhub",
        category: "",
      }));
    } catch (err) {
      console.error("[clawhub-search] error:", err);
      // Fall back to local filtering
      this._searchResults = null;
    } finally {
      this._searching = false;
    }
  }

  override render() {
    return html`
      <h1>${t("skills.title")}</h1>

      <div class="tabs">
        <div
          class="tab ${this._tab === "featured" ? "active" : ""}"
          @click=${() => { this._tab = "featured"; this._searchQuery = ""; }}
        >
          ${t("skills.tab.featured")}
        </div>
        <div
          class="tab ${this._tab === "installed" ? "active" : ""}"
          @click=${() => { this._tab = "installed"; this._searchQuery = ""; }}
        >
          ${t("skills.tab.installed", this._installed.filter(isUserInstalled).length)}
        </div>
      </div>

      ${this._tab === "featured"
        ? this._renderFeatured()
        : this._renderInstalled()}

      ${this._renderDetailPanel()}

      ${this._renderInstallPanel()}
    `;
  }

  /* ── Install progress panel ── */

  private _renderInstallPanel() {
    if (this._installLog.length === 0 || this._logDismissed) return nothing;

    const isActive = !!this._installing || !!this._uninstalling;
    const lastLine = this._installLog[this._installLog.length - 1] ?? "";
    const isDone = !isActive && lastLine.startsWith("\u2713");
    const isError = !isActive && lastLine.startsWith("\u2717");

    const statusLabel = isActive
      ? (this._installing ? `Installing ${this._installing}…` : `Uninstalling ${this._uninstalling}…`)
      : isDone ? "Completed" : isError ? "Failed" : "Done";

    const progressClass = isActive ? "" : isDone ? "done" : isError ? "error" : "done";

    return html`
      <div class="install-panel">
        <div class="install-progress-bar">
          <div class="install-progress-fill ${progressClass}"></div>
        </div>
        <div class="install-panel-header" @click=${() => { this._logExpanded = !this._logExpanded; }}>
          <span class="install-status-icon">
            ${isActive
              ? html`<span class="install-spinner"></span>`
              : isDone
                ? html`<span class="install-check">\u2713</span>`
                : isError
                  ? html`<span class="install-fail">\u2717</span>`
                  : html`<span class="install-check">\u2713</span>`}
          </span>
          <span class="install-panel-title">${statusLabel}</span>
          <button class="install-panel-toggle">${this._logExpanded ? "Hide log \u25B2" : "Show log \u25BC"}</button>
          ${!isActive ? html`
            <button class="install-panel-dismiss" @click=${(e: Event) => { e.stopPropagation(); this._logDismissed = true; this._installLog = []; }}>\u2715</button>
          ` : ""}
        </div>
        ${this._logExpanded ? html`
          <div class="install-log" id="install-log-area">
            ${this._installLog.map((l) => {
              const cls = l.startsWith("\u2713") ? "success" : l.startsWith("\u2717") ? "error" : l.startsWith("\u25B6") ? "start" : "";
              return html`<div class="install-log-line ${cls}">${l}</div>`;
            })}
          </div>
        ` : ""}
      </div>
    `;
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (changed.has("_installLog") && this._logExpanded) {
      const logEl = this.renderRoot.querySelector("#install-log-area");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }
  }

  /* ── Featured tab rendering ── */

  @state() private _heroExpanded = false;

  private _getFilteredCategories(): SkillCategory[] {
    if (this._featuredFilter === "academic") return FEATURED_CATEGORIES;
    if (this._featuredFilter === "disciplines") return DISCIPLINE_CATEGORIES;
    return [...FEATURED_CATEGORIES, ...DISCIPLINE_CATEGORIES];
  }

  private _isSlugInstalled(slug: string): boolean {
    const name = slug.split("/").pop() ?? slug;
    return this._installed.some(
      s => s.name === name || s.name === slug,
    );
  }

  private _iconGradient(name: string): string {
    const palettes = [
      ["#06b6d4", "#0891b2"], ["#8b5cf6", "#7c3aed"], ["#f43f5e", "#e11d48"],
      ["#10b981", "#059669"], ["#f59e0b", "#d97706"], ["#ec4899", "#db2777"],
      ["#6366f1", "#4f46e5"], ["#14b8a6", "#0d9488"], ["#ef4444", "#dc2626"],
      ["#a855f7", "#9333ea"], ["#3b82f6", "#2563eb"], ["#84cc16", "#65a30d"],
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    const [a, b] = palettes[Math.abs(h) % palettes.length];
    return `linear-gradient(135deg, ${a}, ${b})`;
  }

  private _iconInitial(name: string): string {
    return (name.charAt(0) || "?").toUpperCase();
  }

  /** Hero card inside the dark banner */
  private _renderHeroCard(skill: FeaturedSkill, rank: number) {
    const installed = this._isSlugInstalled(skill.slug);
    const installing = this._installing === skill.slug;
    const slugName = skill.slug.split("/").pop() ?? skill.slug;

    return html`
      <div class="hero-card" style="cursor:pointer" @click=${() => this._openDetail(this._detailFromFeatured(skill))}>
        <span class="hero-card-rank">${rank}</span>
        <div class="skill-icon" style="background:${this._iconGradient(skill.name)}">
          ${this._iconInitial(skill.name)}
        </div>
        <div class="hero-card-info">
          <div class="hero-card-name">${skill.name}</div>
          <div class="hero-card-desc">${skill.description}</div>
        </div>
        ${installed
          ? html`<span class="get-btn get-btn-hero installed" @click=${(e: Event) => { e.stopPropagation(); }}>OPEN</span>`
          : html`<button class="get-btn get-btn-hero" ?disabled=${installing}
              @click=${(e: Event) => { e.stopPropagation(); this._installSkill(slugName); }}
            >${installing ? "···" : "GET"}</button>`}
      </div>
    `;
  }

  /** Category skill card */
  private _renderSkillCard(skill: FeaturedSkill) {
    const installed = this._isSlugInstalled(skill.slug);
    const installing = this._installing === skill.slug;
    const slugName = skill.slug.split("/").pop() ?? skill.slug;

    return html`
      <div class="featured-card" style="cursor:pointer" @click=${() => this._openDetail(this._detailFromFeatured(skill))}>
        <div class="skill-icon" style="background:${this._iconGradient(skill.name)}">
          ${this._iconInitial(skill.name)}
        </div>
        <div class="featured-card-body">
          <div class="featured-card-name">${skill.name}</div>
          <div class="featured-card-desc">${skill.description}</div>
          <div class="featured-card-author">@${skill.author}</div>
        </div>
        <div class="featured-card-actions" @click=${(e: Event) => e.stopPropagation()}>
          ${installed
            ? html`<span class="get-btn installed">OPEN</span>`
            : html`<button class="get-btn" ?disabled=${installing}
                @click=${() => this._installSkill(slugName)}
              >${installing ? "···" : "GET"}</button>`}
          <a class="featured-link" href=${skill.url} target="_blank" rel="noopener">ClawHub</a>
        </div>
      </div>
    `;
  }

  private _renderCategorySection(cat: SkillCategory) {
    const hasPopular = cat.popular.length > 0;
    const hasCurated = cat.curated.length > 0;
    if (!hasPopular && !hasCurated) return nothing;

    return html`
      <div class="category-section">
        <div class="category-header">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-title">${cat.title}</span>
        </div>
        <div class="category-subtitle">${cat.subtitle}</div>

        ${hasPopular ? html`
          <div class="category-divider-label">🔥 ${t("skills.featured.popular")}</div>
          <div class="featured-card-grid">
            ${cat.popular.map(s => this._renderSkillCard(s))}
          </div>
        ` : nothing}

        ${hasCurated ? html`
          <div class="category-divider-label">📚 ${t("skills.featured.curated")}</div>
          <div class="featured-card-grid">
            ${cat.curated.map(s => this._renderSkillCard(s))}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderFeatured() {
    const categories = this._getFilteredCategories();
    const visibleTop = this._heroExpanded ? TOP_SKILLS : TOP_SKILLS.slice(0, 6);

    return html`
      <!-- Search bar -->
      <div class="search-bar">
        <input
          class="search-input"
          placeholder="Search ClawHub skills…"
          .value=${this._searchQuery}
          @input=${(e: Event) => {
            this._searchQuery = (e.target as HTMLInputElement).value;
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => this._searchClawHub(this._searchQuery), 500);
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              if (this._searchDebounce) clearTimeout(this._searchDebounce);
              this._searchClawHub(this._searchQuery);
            }
          }}
        />
        ${this._searching ? html`<span class="searching-indicator">${t("skills.searching")}</span>` : ""}
      </div>

      ${this._searchResults !== null ? this._renderSearchResults() : html`
      <!-- Dark hero with top skills cards -->
      <div class="featured-hero">
        <span class="featured-hero-label">TOP SKILLS</span>
        <h2>${t("skills.featured.topTitle")}</h2>
        <p>${t("skills.featured.topSubtitle")}</p>

        <div class="hero-card-grid">
          ${visibleTop.map((s, i) => this._renderHeroCard(s, i + 1))}
        </div>

        ${TOP_SKILLS.length > 6 ? html`
          <button class="hero-show-more" @click=${() => { this._heroExpanded = !this._heroExpanded; }}>
            ${this._heroExpanded ? "Show Less ▲" : `Show All ${TOP_SKILLS.length} ▼`}
          </button>
        ` : nothing}
      </div>

      <!-- Filter chips -->
      <div class="filter-chips">
        <button class="filter-chip ${this._featuredFilter === "all" ? "active" : ""}"
          @click=${() => { this._featuredFilter = "all"; }}>${t("skills.featured.all")}</button>
        <button class="filter-chip ${this._featuredFilter === "academic" ? "active" : ""}"
          @click=${() => { this._featuredFilter = "academic"; }}>${t("skills.featured.academic")}</button>
        <button class="filter-chip ${this._featuredFilter === "disciplines" ? "active" : ""}"
          @click=${() => { this._featuredFilter = "disciplines"; }}>${t("skills.featured.disciplines")}</button>
      </div>

      <!-- Category sections -->
      ${categories.map(cat => this._renderCategorySection(cat))}
    `}`;
  }

  private _renderSearchResults() {
    const installedNames = new Set(this._installed.map(s => s.name));
    const isInstalled = (s: ClawHubSkill) => {
      if (installedNames.has(s.name)) return true;
      const resolved = this._resolveGatewayName(s.name);
      return resolved !== s.name && installedNames.has(resolved);
    };
    const results = (this._searchResults ?? []).filter(s => !isInstalled(s));

    if (results.length === 0) {
      return html`<div class="empty-state">No skills found for "${this._searchQuery}"</div>`;
    }
    return html`
      <div class="skill-grid">
        ${results.map((s) => html`
          <div class="skill-card" style="cursor:pointer" @click=${() => this._openDetail(this._detailFromSearch(s))}>
            <div class="skill-info">
              <div class="skill-name">${s.name}</div>
              <div class="skill-desc">${s.description}</div>
              <div class="skill-meta">By @${s.author}${s.category ? ` · ${s.category}` : ""}</div>
            </div>
            <div class="skill-actions" @click=${(e: Event) => e.stopPropagation()}>
              <button class="action-btn install-btn" ?disabled=${this._installing === s.name}
                @click=${() => this._installSkill(s.name)}>
                ${this._installing === s.name ? "Installing…" : t("skills.install")}
              </button>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private _openDetail(target: DetailTarget) {
    this._detailTarget = target;
    this._detailApiKey = "";
    this._detailSaving = false;
    this._detailMessage = null;
    this._clawhubDetail = null;
    this._fetchClawHubDetail(target.slug);
  }

  private async _fetchClawHubDetail(slug: string) {
    const apiSlug = slug.split("/").pop() ?? slug;
    const cached = this._clawhubCache.get(apiSlug);
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      this._clawhubDetail = cached.data;
      return;
    }
    this._clawhubLoading = true;
    try {
      const res = await fetch(`https://clawhub.ai/api/skill?slug=${encodeURIComponent(apiSlug)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ClawHubDetail;
      this._clawhubCache.set(apiSlug, { data, fetchedAt: Date.now() });
      if (this._detailTarget?.slug === slug) {
        this._clawhubDetail = data;
      }
    } catch {
      // Non-critical; panel still shows local info
    } finally {
      this._clawhubLoading = false;
    }
  }

  /** Build a DetailTarget from a FeaturedSkill. */
  private _detailFromFeatured(fs: FeaturedSkill): DetailTarget {
    const slugName = fs.slug.split("/").pop() ?? fs.slug;
    const installed = this._installed.find(s => s.name === slugName || s.name === fs.slug.split("/").pop());
    return { name: fs.name, slug: fs.slug, description: fs.description, author: fs.author, url: fs.url, installed };
  }

  /** Build a DetailTarget from a ClawHubSkill (search result). */
  private _detailFromSearch(cs: ClawHubSkill): DetailTarget {
    const resolved = this._resolveGatewayName(cs.name);
    const installed = this._installed.find(s => s.name === cs.name || s.name === resolved);
    return { name: cs.name, slug: cs.name, description: cs.description, author: cs.author, installed };
  }

  /** Build a DetailTarget from an installed Skill. */
  private _detailFromInstalled(s: Skill): DetailTarget {
    return { name: s.name, slug: this._resolveSlug(s.name), description: s.description, source: s.source, installed: s };
  }

  private _closeDetail() {
    this._detailTarget = null;
    this._detailMessage = null;
  }

  private async _saveApiKey() {
    const skill = this._detailTarget?.installed;
    if (!skill?.skillKey || !skill.primaryEnv) return;
    this._detailSaving = true;
    this._detailMessage = null;
    try {
      await gateway.call("skills.update", {
        skillKey: skill.skillKey,
        apiKey: this._detailApiKey,
      });
      this._detailMessage = { kind: "success", text: "API key saved" };
      await this._loadSkills();
    } catch (err) {
      this._detailMessage = { kind: "error", text: (err as Error).message ?? "Failed to save" };
    }
    this._detailSaving = false;
  }

  private async _toggleDetailSkill() {
    const skill = this._detailTarget?.installed;
    if (!skill) return;
    const key = skill.skillKey ?? skill.name;
    try {
      await gateway.call("skills.update", { skillKey: key, enabled: skill.disabled });
      await this._loadSkills();
      const updated = this._installed.find(s => s.name === skill.name);
      if (updated && this._detailTarget) {
        this._detailTarget = { ...this._detailTarget, installed: { ...updated } };
      }
    } catch { /* ignore */ }
  }

  /** Format large numbers: 1200 → "1.2k", 214172 → "214k" */
  private _fmtNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
    return String(n);
  }

  private _renderDetailPanel() {
    const target = this._detailTarget;
    if (!target) return nothing;

    const skill = target.installed;
    const ch = this._clawhubDetail;
    const hasMissing = skill?.missing && (
      skill.missing.bins.length > 0 || skill.missing.env.length > 0 ||
      skill.missing.config.length > 0 || skill.missing.os.length > 0
    );
    const needsSetup = !!(skill?.primaryEnv) || hasMissing;
    const displayName = ch?.skill.displayName ?? skill?.name ?? target.name;
    const summary = ch?.skill.summary ?? target.description;
    const slugName = target.slug.split("/").pop() ?? target.slug;
    const isInstalled = !!skill;
    const installing = this._installing === slugName;
    const clawhubUrl = target.url ?? (ch ? `https://clawhub.ai/${ch.owner.handle}/${ch.skill.slug}` : null);

    return html`
      <div class="detail-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeDetail(); }}>
        <div class="detail-panel">
          <div class="detail-header">
            <div class="skill-icon" style="background:${this._iconGradient(displayName)}">
              ${skill?.emoji ?? this._iconInitial(displayName)}
            </div>
            <div class="detail-header-info">
              <div class="detail-header-name">${displayName}</div>
              <div class="detail-header-source">
                ${ch ? `@${ch.owner.handle}` : target.author ? `@${target.author}` : target.source ?? "unknown"}${skill?.bundled ? " · bundled" : ""}
              </div>
            </div>
            <button class="detail-close" @click=${this._closeDetail}>Close</button>
          </div>
          <div class="detail-body">
            <!-- ClawHub stats -->
            ${this._clawhubLoading ? html`
              <div class="detail-stats">
                <div class="detail-skeleton" style="width:180px"></div>
              </div>
            ` : ch ? html`
              <div class="detail-stats">
                <span class="detail-stat" title="Stars">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="color:#eab308"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
                  <span class="stat-value">${this._fmtNum(ch.skill.stats.stars)}</span>
                </span>
                <span class="detail-stat" title="Downloads">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="color:var(--ac-primary)"><path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14zM7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06z"/></svg>
                  <span class="stat-value">${this._fmtNum(ch.skill.stats.downloads)}</span>
                </span>
                <span class="detail-stat" title="Installs (all time)">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--ac-text-muted)"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.5v4M6 7l2 2 2-2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span class="stat-value">${this._fmtNum(ch.skill.stats.installsAllTime)}</span>
                  <span>installs</span>
                </span>
              </div>
            ` : ""}

            <div class="detail-desc">${summary}</div>

            <!-- Owner from ClawHub -->
            ${ch ? html`
              <div class="detail-owner">
                <img class="detail-owner-avatar" src=${ch.owner.image} alt=${ch.owner.handle} loading="lazy" />
                <span>by <a href="https://clawhub.ai/u/${ch.owner.handle}" target="_blank" rel="noopener">@${ch.owner.handle}</a></span>
                ${ch.latestVersion.version ? html`
                  <span class="detail-version">v${ch.latestVersion.version}</span>
                ` : ""}
              </div>
            ` : ""}

            ${isInstalled ? html`
              <div class="detail-chips">
                ${skill.eligible ? html`<span class="detail-chip ok">Eligible</span>` : html`<span class="detail-chip missing">Not Eligible</span>`}
                ${skill.disabled ? html`<span class="detail-chip disabled">Disabled</span>` : html`<span class="detail-chip ok">Enabled</span>`}
                ${needsSetup ? html`<span class="detail-chip missing">Needs Setup</span>` : ""}
              </div>

              <div class="detail-section">
                <div class="detail-section-title">Status</div>
                <div class="detail-toggle-row">
                  <div class="detail-toggle ${skill.disabled ? "" : "on"}" @click=${this._toggleDetailSkill}></div>
                  <span class="detail-toggle-label">${skill.disabled ? "Disabled" : "Enabled"}</span>
                </div>
              </div>

              ${hasMissing ? html`
                <div class="detail-callout warn">
                  <strong>Missing requirements:</strong>
                  ${skill.missing!.bins.length > 0 ? html`<div>Binaries: ${skill.missing!.bins.join(", ")}</div>` : ""}
                  ${skill.missing!.env.length > 0 ? html`<div>Environment: ${skill.missing!.env.join(", ")}</div>` : ""}
                  ${skill.missing!.config.length > 0 ? html`<div>Config: ${skill.missing!.config.join(", ")}</div>` : ""}
                  ${skill.missing!.os.length > 0 ? html`<div>OS: ${skill.missing!.os.join(", ")}</div>` : ""}
                </div>
              ` : ""}

              ${skill.primaryEnv ? html`
                <div class="detail-section">
                  <div class="detail-section-title">API Key</div>
                  <div class="detail-field">
                    <label>API key for <code>${skill.primaryEnv}</code></label>
                    <input type="password" placeholder="Enter API key…"
                      .value=${this._detailApiKey}
                      @input=${(e: Event) => { this._detailApiKey = (e.target as HTMLInputElement).value; }} />
                    ${skill.homepage ? html`<div class="field-hint">Get your key: <a href="${skill.homepage}" target="_blank" rel="noopener">${skill.homepage}</a></div>` : ""}
                  </div>
                  <button class="detail-save-btn" ?disabled=${this._detailSaving || !this._detailApiKey}
                    @click=${this._saveApiKey}>
                    ${this._detailSaving ? "Saving…" : "Save Key"}
                  </button>
                </div>
              ` : ""}

              ${skill.install.length > 0 && skill.missing?.bins?.length ? html`
                <div class="detail-section">
                  <div class="detail-section-title">Installation</div>
                  <button class="detail-save-btn" @click=${() => { this._closeDetail(); this._installSkill(skill.name); }}>
                    ${skill.install[0].label ?? "Install"}
                  </button>
                </div>
              ` : ""}
            ` : html`
              <div class="detail-section">
                <button class="get-btn" style="width:100%;text-align:center" ?disabled=${installing}
                  @click=${() => { this._installSkill(slugName); }}>
                  ${installing ? "Installing…" : "GET"}
                </button>
              </div>
            `}

            ${clawhubUrl ? html`
              <div style="font-size:12px">
                <a href=${clawhubUrl} target="_blank" rel="noopener" style="color:var(--ac-primary)">View on ClawHub</a>
              </div>
            ` : ""}

            ${this._detailMessage ? html`
              <div class="detail-callout ${this._detailMessage.kind}">${this._detailMessage.text}</div>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }

  private _renderInstalled() {
    const skills = this._filteredInstalled();

    return html`
      <div class="search-bar">
        <input
          class="search-input"
          placeholder=${t("skills.search.installed")}
          .value=${this._searchQuery}
          @input=${(e: Event) =>
            (this._searchQuery = (e.target as HTMLInputElement).value)}
        />
      </div>

      ${skills.length === 0
        ? html`<div class="empty-state">${t("skills.empty")}</div>`
        : html`
            <div class="skill-grid">
              ${skills.map(
                (s) => {
                  const needsSetup = !!s.primaryEnv || (s.missing && (
                    s.missing.bins.length > 0 || s.missing.env.length > 0 ||
                    s.missing.config.length > 0 || s.missing.os.length > 0
                  ));
                  return html`
                  <div class="skill-card" style="cursor:pointer" @click=${() => this._openDetail(this._detailFromInstalled(s))}>
                    <div class="skill-info">
                      <div class="skill-name">
                        ${s.emoji ? html`<span style="font-size:16px">${s.emoji}</span>` : ""}
                        ${s.name}
                        ${isUserInstalled(s)
                          ? html`<span class="skill-version">${t("skills.installed")}</span>`
                          : html`<span class="skill-version">${t("skills.bundled")}</span>`}
                        ${needsSetup ? html`<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:#fef3c7;color:#92400e;font-weight:600">Setup</span>` : ""}
                      </div>
                      <div class="skill-desc">${s.description}</div>
                      <div class="skill-meta">
                        ${s.eligible
                          ? html`<span style="color: var(--ac-success)">${t("skills.eligible")}</span>`
                          : html`<span style="color: var(--ac-text-muted)">${t("skills.notEligible")}</span>`}
                        ${s.disabled
                          ? html` · <span style="color: var(--ac-warning)">${t("skills.disabled")}</span>`
                          : ""}
                      </div>
                    </div>
                    <div class="skill-actions" @click=${(e: Event) => e.stopPropagation()}>
                      ${!isUserInstalled(s)
                        ? html`<span
                            style="font-size: 11px; color: var(--ac-text-muted)"
                            >${t("skills.Bundled")}</span
                          >`
                        : html`
                          <button
                            class="action-btn disable-btn"
                            @click=${() => this._toggleSkill(s.name, s.disabled)}
                          >
                            ${s.disabled ? t("skills.enable") : t("skills.disable")}
                          </button>
                          <button
                            class="action-btn uninstall-btn"
                            ?disabled=${this._uninstalling === s.name}
                            @click=${() => this._uninstallSkill(s.name)}
                          >
                            ${this._uninstalling === s.name ? t("skills.removing") : t("settings.tab.uninstall")}
                          </button>`}
                    </div>
                  </div>
                `; },
              )}
            </div>
            <div class="footer-stats">
              ${this._installed.filter(isUserInstalled).length} installed ·
              ${this._installed.filter((s) => !isUserInstalled(s)).length} bundled ·
              ${this._installed.filter((s) => s.eligible).length} eligible
            </div>
          `}
    `;
  }

}
