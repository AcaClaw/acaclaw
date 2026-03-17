import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";

type EcoTab = "python" | "system" | "r" | "cuda" | "nodejs";

interface Pkg {
  name: string;
  version: string;
  source: string;
  description?: string;
}

interface CondaEnv {
  name: string;
  python: string;
  rVersion: string;
  condaVersion: string;
  path: string;
  sizeGB: number;
  active: boolean;
  installed: boolean;
}

// Demo packages keyed by "envName:ecosystem"
const DEMO_PKGS: Record<string, Pkg[]> = {
  "aca:python": [
    { name: "numpy", version: "2.2.1", source: "conda-forge", description: "Array computing" },
    { name: "pandas", version: "2.2.3", source: "conda-forge", description: "Data analysis" },
    { name: "scipy", version: "1.15.0", source: "conda-forge", description: "Scientific computing" },
    { name: "matplotlib", version: "3.10.0", source: "conda-forge", description: "Plotting library" },
    { name: "scikit-learn", version: "1.6.1", source: "conda-forge", description: "Machine learning" },
    { name: "jupyter", version: "1.1.1", source: "conda-forge", description: "Interactive notebooks" },
    { name: "torch", version: "2.5.1", source: "pip", description: "Deep learning framework" },
  ],
  "aca:system": [
    { name: "pdftk", version: "3.3.3", source: "conda-forge", description: "PDF toolkit (merge, split, stamp)" },
    { name: "pandoc", version: "3.6.2", source: "conda-forge", description: "Document format converter" },
    { name: "texlive-core", version: "2024", source: "conda-forge", description: "LaTeX typesetting" },
    { name: "imagemagick", version: "7.1.1", source: "conda-forge", description: "Image conversion & editing" },
    { name: "poppler", version: "24.12.0", source: "conda-forge", description: "PDF rendering (pdftotext, pdfinfo)" },
    { name: "ffmpeg", version: "7.1", source: "conda-forge", description: "Audio/video processing" },
    { name: "graphviz", version: "12.2.1", source: "conda-forge", description: "Graph visualization (dot)" },
  ],
  "aca:r": [],
  "aca:cuda": [
    { name: "cuda-toolkit", version: "12.4.1", source: "nvidia", description: "CUDA compiler & runtime" },
    { name: "cudnn", version: "9.5.1", source: "nvidia", description: "Deep neural network library" },
  ],
  "aca:nodejs": [
    { name: "typescript", version: "5.7.3", source: "npm", description: "Typed JavaScript" },
    { name: "prettier", version: "3.4.2", source: "npm", description: "Code formatter" },
  ],
  "aca-bio:python": [
    { name: "numpy", version: "2.2.1", source: "conda-forge", description: "Array computing" },
    { name: "pandas", version: "2.2.3", source: "conda-forge", description: "Data analysis" },
    { name: "biopython", version: "1.84", source: "conda-forge", description: "Computational biology" },
    { name: "scanpy", version: "1.10.4", source: "conda-forge", description: "Single-cell analysis" },
  ],
  "aca-bio:system": [
    { name: "samtools", version: "1.21", source: "bioconda", description: "SAM/BAM file tools" },
    { name: "bedtools", version: "2.31.1", source: "bioconda", description: "Genome arithmetic" },
    { name: "fastqc", version: "0.12.1", source: "bioconda", description: "Sequence quality control" },
    { name: "blast", version: "2.16.0", source: "bioconda", description: "Sequence alignment search" },
    { name: "pandoc", version: "3.6.2", source: "conda-forge", description: "Document format converter" },
  ],
  "aca-bio:r": [
    { name: "ggplot2", version: "3.5.1", source: "CRAN", description: "Elegant data visualization" },
    { name: "DESeq2", version: "1.44.0", source: "Bioconductor", description: "Differential expression" },
    { name: "Seurat", version: "5.1.0", source: "CRAN", description: "Single-cell analysis" },
    { name: "edgeR", version: "4.2.2", source: "Bioconductor", description: "RNA-seq analysis" },
  ],
  "aca-bio:cuda": [],
  "aca-bio:nodejs": [],
  "aca-med:python": [
    { name: "numpy", version: "2.2.1", source: "conda-forge", description: "Array computing" },
    { name: "pandas", version: "2.2.3", source: "conda-forge", description: "Data analysis" },
    { name: "scikit-learn", version: "1.6.1", source: "conda-forge", description: "Machine learning" },
    { name: "lifelines", version: "0.29.0", source: "pip", description: "Survival analysis" },
    { name: "nibabel", version: "5.3.2", source: "conda-forge", description: "Neuroimaging I/O" },
  ],
  "aca-med:system": [
    { name: "dcm2niix", version: "1.0.20240202", source: "conda-forge", description: "DICOM to NIfTI converter" },
    { name: "pandoc", version: "3.6.2", source: "conda-forge", description: "Document format converter" },
    { name: "texlive-core", version: "2024", source: "conda-forge", description: "LaTeX typesetting" },
  ],
  "aca-med:r": [
    { name: "survival", version: "3.7-0", source: "CRAN", description: "Survival analysis" },
    { name: "ggplot2", version: "3.5.1", source: "CRAN", description: "Elegant data visualization" },
  ],
  "aca-med:cuda": [
    { name: "cuda-toolkit", version: "12.4.1", source: "nvidia", description: "CUDA compiler & runtime" },
    { name: "cudnn", version: "9.5.1", source: "nvidia", description: "Deep neural network library" },
  ],
  "aca-med:nodejs": [],
};

const TAB_META: Record<EcoTab, {
  icon: string; label: string; installCmd: string; installAction: string;
}> = {
  python:  { icon: "🐍", label: "Python",  installCmd: "conda install / pip install package",  installAction: "acaclaw.env.pip.install" },
  system:  { icon: "🔧", label: "Tools",   installCmd: "conda install tool-name (pdftk, pandoc…)", installAction: "acaclaw.env.sys.install" },
  r:       { icon: "📊", label: "R",       installCmd: "install.packages('pkg') or conda",     installAction: "acaclaw.env.r.install" },
  cuda:    { icon: "⚡", label: "CUDA",    installCmd: "conda install cuda-toolkit",            installAction: "acaclaw.env.cuda.install" },
  nodejs:  { icon: "📦", label: "Node.js", installCmd: "npm install -g package",                installAction: "acaclaw.env.npm.install" },
};

const DEMO_ENVS: CondaEnv[] = [
  { name: "aca", python: "3.12.8", rVersion: "not installed", condaVersion: "Miniforge 24.11", path: "~/.acaclaw/miniforge3/envs/aca", sizeGB: 1.4, active: true, installed: true },
  { name: "aca-bio", python: "3.12.8", rVersion: "4.4.2", condaVersion: "Miniforge 24.11", path: "~/.acaclaw/miniforge3/envs/aca-bio", sizeGB: 3.2, active: false, installed: false },
  { name: "aca-med", python: "3.12.8", rVersion: "4.4.2", condaVersion: "Miniforge 24.11", path: "~/.acaclaw/miniforge3/envs/aca-med", sizeGB: 2.8, active: false, installed: false },
];

@customElement("acaclaw-environment")
export class EnvironmentView extends LitElement {
  @state() private _environments: CondaEnv[] = [];
  @state() private _packages: Record<string, Pkg[]> = {};
  @state() private _searchQuery = "";
  @state() private _installQuery = "";
  @state() private _installing = false;
  @state() private _uninstalling = "";
  @state() private _creatingEnv = false;
  @state() private _newEnvName = "";
  @state() private _showCreateForm = false;
  @state() private _removingEnv = "";
  @state() private _installingEnv = "";
  @state() private _activeTab: EcoTab = "python";
  @state() private _selectedEnv = "";

  static override styles = css`
    :host { display: block; }
    h1 {
      font-size: 32px; font-weight: 800;
      letter-spacing: -0.03em; margin-bottom: 4px;
      color: var(--ac-text);
    }
    .subtitle {
      font-size: 14px; color: var(--ac-text-secondary);
      margin-bottom: 24px;
    }

    .tabs {
      display: flex; gap: 2px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--ac-border-subtle);
      flex-wrap: wrap;
    }
    .tab {
      padding: 10px 16px;
      font-size: 13px; font-weight: 500;
      color: var(--ac-text-secondary);
      cursor: pointer; border: none; background: none;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .tab:hover { color: var(--ac-text); }
    .tab.active {
      color: var(--ac-primary);
      border-bottom-color: var(--ac-primary);
      font-weight: 600;
    }

    .card {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      padding: 24px; margin-bottom: 20px;
    }
    .card h2 {
      font-size: 16px; font-weight: 700;
      color: var(--ac-text); margin-bottom: 16px;
      letter-spacing: -0.02em;
    }

    /* Env selector bar */
    .env-selector {
      display: flex; gap: 10px; align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .env-selector label {
      font-size: 13px; font-weight: 600;
      color: var(--ac-text-secondary);
      white-space: nowrap;
    }
    .env-dropdown {
      padding: 8px 14px; font-size: 13px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      background: var(--ac-bg-surface);
      color: var(--ac-text);
      cursor: pointer; min-width: 180px;
    }
    .env-dropdown:focus {
      outline: none; border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }
    .env-info {
      font-size: 12px; color: var(--ac-text-muted);
      display: flex; gap: 12px; align-items: center;
    }
    .env-info .active-badge {
      font-size: 10px; font-weight: 600;
      padding: 2px 8px; border-radius: var(--ac-radius-full);
      background: var(--ac-success-bg, #dcfce7);
      color: var(--ac-success, #16a34a);
    }
    .env-actions {
      display: flex; gap: 6px; margin-left: auto;
    }
    .env-action-btn {
      padding: 6px 14px; font-size: 12px; font-weight: 500;
      border-radius: var(--ac-radius-sm);
      cursor: pointer; transition: all 0.15s;
      white-space: nowrap;
    }
    .env-new-btn {
      background: var(--ac-bg-surface);
      border: 1px dashed var(--ac-border);
      color: var(--ac-text-secondary);
    }
    .env-new-btn:hover {
      border-color: var(--ac-primary); color: var(--ac-primary);
    }
    .env-del-btn {
      background: transparent;
      border: 1px solid var(--ac-error, #ef4444);
      color: var(--ac-error, #ef4444);
    }
    .env-del-btn:hover {
      background: var(--ac-error, #ef4444); color: #fff;
    }
    .env-del-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .env-del-btn:disabled:hover {
      background: transparent; color: var(--ac-error, #ef4444);
    }

    .create-inline {
      display: flex; gap: 8px; align-items: center;
      padding: 12px 16px;
      background: var(--ac-bg-hover);
      border-radius: var(--ac-radius-sm);
      margin-bottom: 20px;
    }
    .create-inline input {
      flex: 1; padding: 7px 12px; font-size: 13px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      background: var(--ac-bg);
    }
    .create-inline input:focus {
      outline: none; border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }
    .create-inline .create-btn {
      padding: 7px 18px; font-size: 13px; font-weight: 600;
      background: var(--ac-primary); color: #fff;
      border: none; border-radius: var(--ac-radius-sm);
      cursor: pointer;
    }
    .create-inline .create-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .create-inline .cancel-btn {
      padding: 7px 14px; font-size: 12px;
      border: none; cursor: pointer;
      background: transparent; color: var(--ac-text-secondary);
    }

    .install-bar {
      display: flex; gap: 8px;
      align-items: center;
    }
    .install-input {
      flex: 1; padding: 9px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px; background: var(--ac-bg);
    }
    .install-input:focus {
      outline: none; border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }
    .install-btn {
      padding: 8px 20px; font-size: 13px; font-weight: 600;
      background: var(--ac-primary); color: #fff;
      border: none; border-radius: var(--ac-radius-sm);
      cursor: pointer; transition: all 0.15s;
      white-space: nowrap;
    }
    .install-btn:hover { opacity: 0.9; }
    .install-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .search-bar { margin-bottom: 16px; }
    .search-input {
      width: 100%; padding: 8px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px; background: var(--ac-bg);
      box-sizing: border-box;
    }
    .search-input:focus {
      outline: none; border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }

    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; font-size: 12px; font-weight: 600;
      color: var(--ac-text-secondary);
      padding: 10px 12px;
      border-bottom: 1px solid var(--ac-border);
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--ac-border-subtle);
      font-size: 13px;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: var(--ac-bg-hover); }
    .desc { color: var(--ac-text-muted); font-size: 12px; }

    .source-badge {
      font-size: 11px; font-weight: 500;
      padding: 2px 8px; border-radius: var(--ac-radius-full);
      background: var(--ac-bg-hover); color: var(--ac-text-secondary);
    }
    .source-badge.pip { background: #e8f4fd; color: #3776ab; }
    .source-badge.conda-forge { background: #e8f8e8; color: #43a047; }
    .source-badge.npm { background: #fce8e8; color: #cb3837; }
    .source-badge.cran { background: #eef2ff; color: #276dc3; }
    .source-badge.bioconductor { background: #f3e8ff; color: #7c3aed; }
    .source-badge.bioconda { background: #fff3e0; color: #e65100; }
    .source-badge.nvidia { background: #e8f5e9; color: #76b900; }

    .uninstall-btn {
      padding: 3px 10px; font-size: 11px; font-weight: 500;
      background: transparent;
      border: 1px solid var(--ac-error, #ef4444);
      border-radius: var(--ac-radius-full);
      cursor: pointer; color: var(--ac-error, #ef4444);
      transition: all 0.15s;
    }
    .uninstall-btn:hover {
      background: var(--ac-error, #ef4444); color: #fff;
    }
    .uninstall-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .empty-msg {
      color: var(--ac-text-muted); font-size: 13px;
      padding: 16px 0;
    }

    .pkg-summary {
      display: flex; gap: 20px; margin-bottom: 16px;
      font-size: 13px; color: var(--ac-text-secondary);
    }
    .pkg-summary strong { color: var(--ac-text); }
  `;

  private _gatewayListener: EventListener | null = null;

  override connectedCallback() {
    super.connectedCallback();
    // Set demo defaults immediately so first render has data
    this._environments = [...DEMO_ENVS];
    this._packages = { ...DEMO_PKGS };
    this._selectedEnv = "aca";
    // If already connected, load immediately; otherwise wait for connection
    if (gateway.state === "connected") {
      this._loadEnvironments();
    }
    this._gatewayListener = ((e: CustomEvent) => {
      if (e.detail.state === "connected") this._loadEnvironments();
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

  private async _loadEnvironments() {
    try {
      const res = await gateway.call<{ environments: CondaEnv[] }>("acaclaw.env.list");
      if (res?.environments) {
        this._environments = res.environments;
        // Update selection if current env not in list
        const validEnv = res.environments.find(e => e.name === this._selectedEnv);
        if (!validEnv) {
          this._selectedEnv = (res.environments.find(e => e.active) ?? res.environments[0])?.name ?? "";
        }
        await this._loadPackages();
      }
    } catch { /* keep demo data */ }
  }

  private async _loadPackages() {
    if (!this._selectedEnv) return;
    const env = this._environments.find(e => e.name === this._selectedEnv);
    if (!env?.installed) return;
    try {
      const res = await gateway.call<{ packages: Array<{ name: string; version: string; source: string }> }>("acaclaw.env.pip.list", { env: this._selectedEnv });
      if (res?.packages) {
        const key = `${this._selectedEnv}:python`;
        this._packages = { ...this._packages, [key]: res.packages };
      }
    } catch { /* keep demo/cached data */ }
  }

  private _pkgKey(): string {
    return `${this._selectedEnv}:${this._activeTab}`;
  }

  private _currentPkgs(): Pkg[] {
    const pkgs = this._packages[this._pkgKey()] ?? [];
    if (!this._searchQuery) return pkgs;
    const q = this._searchQuery.toLowerCase();
    return pkgs.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    );
  }

  private _selectedEnvObj(): CondaEnv | undefined {
    return this._environments.find(e => e.name === this._selectedEnv);
  }

  private _isActiveEnv(): boolean {
    return this._selectedEnvObj()?.active === true;
  }

  private _isInstalledEnv(): boolean {
    return this._selectedEnvObj()?.installed === true;
  }

  private async _installEnv() {
    const name = this._selectedEnv;
    if (!name) return;
    this._installingEnv = name;
    try {
      await gateway.call("acaclaw.env.install", { name }, { timeoutMs: 600_000 });
      await this._loadEnvironments();
    } catch { /* handle error */ }
    this._installingEnv = "";
  }

  private async _installPackage() {
    const pkg = this._installQuery.trim();
    if (!pkg) return;
    const meta = TAB_META[this._activeTab];
    this._installing = true;
    try {
      await gateway.call(meta.installAction, { packages: [pkg], env: this._selectedEnv }, { timeoutMs: 300_000 });
      this._installQuery = "";
      await this._loadPackages();
    } catch { /* handle error */ }
    this._installing = false;
  }

  private async _uninstallPackage(name: string) {
    this._uninstalling = name;
    try {
      await gateway.call(
        TAB_META[this._activeTab].installAction.replace("install", "uninstall"),
        { packages: [name], env: this._selectedEnv },
      );
      await this._loadPackages();
    } catch { /* handle error */ }
    this._uninstalling = "";
  }

  private async _createEnv() {
    const name = this._newEnvName.trim();
    if (!name) return;
    this._creatingEnv = true;
    try {
      await gateway.call("acaclaw.env.create", { name });
      this._newEnvName = "";
      this._showCreateForm = false;
      await this._loadEnvironments();
      this._selectedEnv = name;
    } catch { /* handle error */ }
    this._creatingEnv = false;
  }

  private async _removeEnv() {
    const name = this._selectedEnv;
    if (!name || !this._isInstalledEnv()) return;
    this._removingEnv = name;
    try {
      await gateway.call("acaclaw.env.remove", { name }, { timeoutMs: 600_000 });
      await this._loadEnvironments();
      this._selectedEnv = this._environments[0]?.name ?? "";
    } catch { /* handle error */ }
    this._removingEnv = "";
  }

  private _onEnvChange(e: Event) {
    this._selectedEnv = (e.target as HTMLSelectElement).value;
    this._searchQuery = "";
    this._loadPackages();
  }

  override render() {
    const meta = TAB_META[this._activeTab];
    const env = this._selectedEnvObj();
    const isActive = this._isActiveEnv();
    const isInstalled = this._isInstalledEnv();
    const pkgs = isInstalled ? this._currentPkgs() : [];
    const allPkgs = isInstalled ? (this._packages[this._pkgKey()] ?? []) : [];

    return html`
      <h1>Environment</h1>
      <div class="subtitle">Manage packages and tools across Python, R, CUDA, Node.js, and system environments</div>

      <!-- Tabs -->
      <div class="tabs">
        ${(Object.keys(TAB_META) as EcoTab[]).map(t => html`
          <button class="tab ${this._activeTab === t ? "active" : ""}"
            @click=${() => { this._activeTab = t; this._searchQuery = ""; }}>
            ${TAB_META[t].icon} ${TAB_META[t].label}
          </button>
        `)}
      </div>

      <!-- Env selector -->
      <div class="env-selector">
        <label>Environment:</label>
        <select class="env-dropdown" .value=${this._selectedEnv} @change=${this._onEnvChange}>
          ${this._environments.map(e => html`
            <option value=${e.name} ?selected=${e.name === this._selectedEnv}>
              ${e.name}${e.active ? " ● active" : !e.installed ? " ○ not installed" : ""}
            </option>
          `)}
        </select>
        ${env ? html`
          <div class="env-info">
            ${isInstalled ? html`
              <span>Python ${env.python}</span>
              <span>R ${env.rVersion}</span>
              <span>${env.sizeGB.toFixed(1)} GB</span>
              ${isActive ? html`<span class="active-badge">Active</span>` : nothing}
            ` : html`<span style="color:var(--ac-text-muted)">Not installed</span>`}
          </div>
        ` : nothing}
        <div class="env-actions">
          <button class="env-action-btn env-new-btn"
            @click=${() => { this._showCreateForm = !this._showCreateForm; }}>
            + New Env
          </button>
          ${isInstalled ? html`
            <button class="env-action-btn env-del-btn"
              ?disabled=${this._removingEnv !== "" && this._removingEnv === this._selectedEnv}
              @click=${this._removeEnv}>
              ${this._removingEnv !== "" && this._removingEnv === this._selectedEnv ? "Uninstalling…" : `Uninstall ${this._selectedEnv}`}
            </button>
          ` : html`
            <button class="env-action-btn env-new-btn" style="border-style:solid;color:var(--ac-primary);border-color:var(--ac-primary)"
              ?disabled=${this._installingEnv !== "" && this._installingEnv === this._selectedEnv}
              @click=${this._installEnv}>
              ${this._installingEnv !== "" && this._installingEnv === this._selectedEnv ? "Installing…" : `Install ${this._selectedEnv}`}
            </button>
          `}
        </div>
      </div>

      <!-- Create env inline -->
      ${this._showCreateForm ? html`
        <div class="create-inline">
          <input placeholder="New environment name (e.g. acaclaw-nlp)"
            .value=${this._newEnvName}
            @input=${(e: Event) => { this._newEnvName = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._createEnv(); }}
          />
          <button class="create-btn" ?disabled=${this._creatingEnv || !this._newEnvName.trim()}
            @click=${this._createEnv}>
            ${this._creatingEnv ? "Creating…" : "Create"}
          </button>
          <button class="cancel-btn" @click=${() => { this._showCreateForm = false; }}>Cancel</button>
        </div>
      ` : nothing}

      ${isInstalled ? html`
      <!-- Install package -->
      <div class="card">
        <h2>${meta.icon} Install ${meta.label} Package</h2>
        <div class="install-bar">
          <input class="install-input"
            placeholder="${meta.installCmd}"
            .value=${this._installQuery}
            @input=${(e: Event) => { this._installQuery = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._installPackage(); }}
          />
          <button class="install-btn" ?disabled=${this._installing || !this._installQuery.trim()}
            @click=${this._installPackage}>
            ${this._installing ? "Installing…" : "Install"}
          </button>
        </div>
      </div>

      <!-- Package table -->
      <div class="card">
        <h2>Installed ${meta.label} Packages — ${this._selectedEnv}</h2>
        <div class="pkg-summary">
          <span><strong>${allPkgs.length}</strong> packages</span>
        </div>
        <div class="search-bar">
          <input class="search-input" placeholder="Search ${meta.label.toLowerCase()} packages…"
            .value=${this._searchQuery}
            @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
          />
        </div>
        ${pkgs.length === 0
          ? html`<p class="empty-msg">${this._searchQuery ? "No packages match" : `No ${meta.label.toLowerCase()} packages in ${this._selectedEnv}`}</p>`
          : html`
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Version</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${pkgs.map(p => html`
                  <tr>
                    <td>
                      ${p.name}
                      ${p.description ? html`<div class="desc">${p.description}</div>` : nothing}
                    </td>
                    <td>${p.version}</td>
                    <td><span class="source-badge ${p.source.toLowerCase()}">${p.source}</span></td>
                    <td>
                      <button class="uninstall-btn"
                        ?disabled=${this._uninstalling === p.name}
                        @click=${() => this._uninstallPackage(p.name)}>
                        ${this._uninstalling === p.name ? "…" : "Uninstall"}
                      </button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
      </div>
      ` : html`
      <div class="card">
        <p class="empty-msg">Environment <strong>${this._selectedEnv}</strong> is not installed. Click <strong>Install ${this._selectedEnv}</strong> above to set it up.</p>
      </div>
      `}
    `;
  }
}
