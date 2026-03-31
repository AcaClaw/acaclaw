import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway, updateConfig } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";
import { providerEnvVar } from "../models/provider-mapping.js";

interface DisciplineOption {
  id: string;
  label: string;
  icon: string;
  description: string;
  packages: string;
  sizeGB: number;
}

const DISCIPLINES: DisciplineOption[] = [
  {
    id: "general",
    label: "General",
    icon: "📚",
    description: "Core scientific computing stack",
    packages: "NumPy, SciPy, Pandas, Matplotlib, SymPy",
    sizeGB: 1.4,
  },
  {
    id: "biology",
    label: "Biology",
    icon: "🧬",
    description: "Genomics, sequence analysis, bioinformatics",
    packages: "Biopython, Scanpy, PyMOL, BioPandas",
    sizeGB: 2.1,
  },
  {
    id: "chemistry",
    label: "Chemistry",
    icon: "⚗️",
    description: "Molecular modeling, cheminformatics",
    packages: "RDKit, ASE, MDAnalysis, OpenBabel",
    sizeGB: 1.8,
  },
  {
    id: "medicine",
    label: "Medicine",
    icon: "🏥",
    description: "Clinical data, DICOM imaging, survival analysis",
    packages: "Lifelines, PyDICOM, Statsmodels, NiBabel",
    sizeGB: 1.6,
  },
  {
    id: "physics",
    label: "Physics",
    icon: "⚛️",
    description: "Astrophysics, particle physics, simulations",
    packages: "AstroPy, LMfit, Pint, Uncertainties",
    sizeGB: 1.5,
  },
];

type WizardStep =
  | "discipline"
  | "provider"
  | "workspace"
  | "security"
  | "ready";

@customElement("acaclaw-onboarding")
export class OnboardingView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _step: WizardStep = "discipline";
  @state() private _selectedDisciplines: Set<string> = new Set([
    "general",
  ]);
  @state() private _provider: "anthropic" | "openai" | "google" | "web" =
    "anthropic";
  @state() private _apiKey = "";
  @state() private _testResult:
    | "untested"
    | "testing"
    | "success"
    | "failed" = "untested";
  @state() private _workspacePath = "~/AcaClaw/";
  @state() private _securityLevel: "standard" | "maximum" = "standard";
  @state() private _installing = false;
  @state() private _installProgress = 0;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--ac-bg);
      padding: 24px;
    }

    .wizard {
      max-width: 680px;
      width: 100%;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .wizard-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px 32px;
      border-bottom: 1px solid var(--ac-border);
    }
    .wizard-header img {
      width: 36px;
      height: 36px;
    }
    .wizard-header .title {
      font-size: 20px;
      font-weight: 700;
      color: var(--ac-primary);
    }
    .wizard-header .subtitle {
      font-size: 13px;
      color: var(--ac-text-muted);
    }

    .steps {
      display: flex;
      padding: 16px 32px;
      gap: 4px;
      border-bottom: 1px solid var(--ac-border);
    }
    .step-dot {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: var(--ac-border);
    }
    .step-dot.done {
      background: var(--ac-primary);
    }
    .step-dot.current {
      background: var(--ac-primary-light);
    }

    .wizard-body {
      padding: 32px;
    }

    h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .step-desc {
      font-size: 14px;
      color: var(--ac-text-secondary);
      margin-bottom: 24px;
    }

    /* Discipline cards */
    .discipline-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .discipline-card {
      display: flex;
      gap: 12px;
      padding: 16px;
      border: 2px solid var(--ac-border);
      border-radius: var(--ac-radius);
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .discipline-card:hover {
      border-color: var(--ac-primary-light);
    }
    .discipline-card.selected {
      border-color: var(--ac-primary);
      background: var(--ac-primary-bg);
    }
    .discipline-icon {
      font-size: 28px;
      flex-shrink: 0;
    }
    .discipline-info {
      min-width: 0;
    }
    .discipline-name {
      font-weight: 600;
      font-size: 14px;
    }
    .discipline-desc {
      font-size: 12px;
      color: var(--ac-text-secondary);
      margin-top: 2px;
    }
    .discipline-packages {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-top: 4px;
    }
    .discipline-size {
      font-size: 11px;
      color: var(--ac-text-muted);
      margin-top: 2px;
    }

    /* Provider selection */
    .provider-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }
    .provider-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 2px solid var(--ac-border);
      border-radius: var(--ac-radius);
      cursor: pointer;
    }
    .provider-option:hover {
      border-color: var(--ac-primary-light);
    }
    .provider-option.selected {
      border-color: var(--ac-primary);
      background: var(--ac-primary-bg);
    }
    .provider-option input[type="radio"] {
      accent-color: var(--ac-primary);
    }
    .provider-option-label {
      font-weight: 500;
      font-size: 14px;
    }

    .key-group {
      margin-bottom: 20px;
    }
    .key-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    .key-row {
      display: flex;
      gap: 8px;
    }
    .key-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      font-family: monospace;
      background: var(--ac-bg);
    }
    .key-input:focus {
      outline: none;
      border-color: var(--ac-primary);
      box-shadow: 0 0 0 3px var(--ac-primary-bg);
    }
    .test-btn {
      padding: 10px 20px;
      background: var(--ac-bg-hover);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 13px;
      font-weight: 500;
    }
    .test-btn:hover {
      background: var(--ac-bg-active);
    }
    .test-result {
      margin-top: 8px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .test-result.success {
      color: var(--ac-success);
    }
    .test-result.failed {
      color: var(--ac-error);
    }
    .test-result.testing {
      color: var(--ac-text-muted);
    }

    /* Workspace */
    .path-input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      font-family: monospace;
      background: var(--ac-bg);
      margin-bottom: 16px;
    }
    .path-input:focus {
      outline: none;
      border-color: var(--ac-primary);
    }
    .tree-preview {
      font-size: 13px;
      font-family: monospace;
      line-height: 1.8;
      color: var(--ac-text-secondary);
      padding: 16px;
      background: var(--ac-bg);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
    }

    /* Security */
    .security-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .security-option {
      display: flex;
      gap: 12px;
      padding: 16px;
      border: 2px solid var(--ac-border);
      border-radius: var(--ac-radius);
      cursor: pointer;
    }
    .security-option:hover {
      border-color: var(--ac-primary-light);
    }
    .security-option.selected {
      border-color: var(--ac-primary);
      background: var(--ac-primary-bg);
    }
    .security-option input[type="radio"] {
      accent-color: var(--ac-primary);
      margin-top: 2px;
    }
    .security-label {
      font-weight: 600;
      font-size: 14px;
    }
    .security-desc {
      font-size: 13px;
      color: var(--ac-text-secondary);
      margin-top: 4px;
    }

    /* Ready */
    .summary-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      background: var(--ac-bg);
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
    }
    .summary-item .label {
      color: var(--ac-text-secondary);
    }
    .summary-item .value {
      font-weight: 600;
    }

    /* Progress */
    .progress-container {
      margin: 24px 0;
    }
    .progress-bar {
      height: 8px;
      background: var(--ac-bg-hover);
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--ac-primary);
      border-radius: 4px;
      transition: width 0.3s;
    }
    .progress-label {
      text-align: center;
      font-size: 13px;
      color: var(--ac-text-secondary);
      margin-top: 8px;
    }

    /* Navigation */
    .wizard-footer {
      display: flex;
      justify-content: space-between;
      padding: 20px 32px;
      border-top: 1px solid var(--ac-border);
    }
    .nav-btn {
      padding: 10px 24px;
      border-radius: var(--ac-radius-sm);
      font-size: 14px;
      font-weight: 500;
    }
    .back-btn {
      background: var(--ac-bg-hover);
      border: 1px solid var(--ac-border);
      color: var(--ac-text);
    }
    .back-btn:hover {
      background: var(--ac-bg-active);
    }
    .next-btn {
      background: var(--ac-primary);
      color: #fff;
    }
    .next-btn:hover {
      background: var(--ac-primary-dark);
    }
    .next-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .help-link {
      font-size: 12px;
      color: var(--ac-primary);
      margin-top: 8px;
      display: inline-block;
    }

    @media (max-width: 600px) {
      .discipline-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  private _stepIndex(): number {
    const order: WizardStep[] = [
      "discipline",
      "provider",
      "workspace",
      "security",
      "ready",
    ];
    return order.indexOf(this._step);
  }

  private _toggleDiscipline(id: string) {
    const next = new Set(this._selectedDisciplines);
    if (id === "general") return; // Always selected
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._selectedDisciplines = next;
  }

  private async _testConnection() {
    this._testResult = "testing";
    try {
      await gateway.call("models.list");
      this._testResult = "success";
    } catch {
      this._testResult = "failed";
    }
  }

  private _prev() {
    const order: WizardStep[] = [
      "discipline",
      "provider",
      "workspace",
      "security",
      "ready",
    ];
    const i = order.indexOf(this._step);
    if (i > 0) this._step = order[i - 1];
  }

  private _next() {
    const order: WizardStep[] = [
      "discipline",
      "provider",
      "workspace",
      "security",
      "ready",
    ];
    const i = order.indexOf(this._step);
    if (i < order.length - 1) this._step = order[i + 1];
  }

  private async _finish() {
    this._installing = true;
    this._installProgress = 0;

    try {
      // Save via read-modify-write (same pattern as OpenClaw config.set)
      this._installProgress = 20;
      await updateConfig((cfg) => {
        const agents = (cfg.agents ?? {}) as Record<string, unknown>;
        const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
        defaults.workspace = this._workspacePath;
        agents.defaults = defaults;
        cfg.agents = agents;
        if (this._apiKey && this._provider !== "web") {
          // Write only the env var — OpenClaw's plugin catalog discovers keys
          // via env vars, and the extension handles base URLs and model lists.
          const envVar = providerEnvVar(this._provider);
          const env = (cfg.env ?? {}) as Record<string, string>;
          env[envVar] = this._apiKey;
          cfg.env = env;
        }
        return cfg;
      });

      // Install discipline environments
      this._installProgress = 60;
      for (const d of this._selectedDisciplines) {
        if (d !== "general") {
          await gateway.call("acaclaw.env.install", { discipline: d }, { timeoutMs: 600_000 });
        }
      }

      // Set security
      this._installProgress = 80;
      if (this._securityLevel === "maximum") {
        await updateConfig((cfg) => {
          const agents = (cfg.agents ?? {}) as Record<string, unknown>;
          const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
          const sandbox = (defaults.sandbox ?? {}) as Record<string, unknown>;
          sandbox.mode = "docker";
          defaults.sandbox = sandbox;
          agents.defaults = defaults;
          cfg.agents = agents;
          return cfg;
        });
      }

      this._installProgress = 100;

      // Redirect to API keys page after brief delay
      setTimeout(() => {
        location.hash = "api-keys";
      }, 1000);
    } catch {
      this._installing = false;
    }
  }

  override render() {
    const stepIdx = this._stepIndex();

    return html`
      <div class="wizard">
        <div class="wizard-header">
          <img src="/logo/AcaClaw.svg" alt="AcaClaw" />
          <div>
            <div class="title">${t("onboarding.welcome")}</div>
            <div class="subtitle">
              Set up your AI research assistant
            </div>
          </div>
        </div>

        <div class="steps">
          ${["discipline", "provider", "workspace", "security", "ready"].map(
            (_, i) => html`
              <div
                class="step-dot ${i < stepIdx
                  ? "done"
                  : i === stepIdx
                    ? "current"
                    : ""}"
              ></div>
            `,
          )}
        </div>

        <div class="wizard-body">
          ${this._step === "discipline" ? this._renderDiscipline() : ""}
          ${this._step === "provider" ? this._renderProvider() : ""}
          ${this._step === "workspace" ? this._renderWorkspace() : ""}
          ${this._step === "security" ? this._renderSecurity() : ""}
          ${this._step === "ready" ? this._renderReady() : ""}
        </div>

        <div class="wizard-footer">
          ${stepIdx > 0
            ? html`<button class="nav-btn back-btn" @click=${this._prev}>
                ← Back
              </button>`
            : html`<div></div>`}
          ${this._step === "ready"
            ? html`<button
                class="nav-btn next-btn"
                @click=${this._finish}
                ?disabled=${this._installing}
              >
                ${this._installing ? t("onboarding.settingUp") : t("onboarding.finishSetup")}
              </button>`
            : html`<button class="nav-btn next-btn" @click=${this._next}>
                Next →
              </button>`}
        </div>
      </div>
    `;
  }

  private _renderDiscipline() {
    const totalSize = DISCIPLINES.filter((d) =>
      this._selectedDisciplines.has(d.id),
    ).reduce((sum, d) => sum + d.sizeGB, 0);

    return html`
      <h2>${t("onboarding.discipline.title")}</h2>
      <p class="step-desc">
        Select the disciplines you work in. Each adds specialized
        packages to your computing environment.
      </p>

      <div class="discipline-grid">
        ${DISCIPLINES.map(
          (d) => html`
            <div
              class="discipline-card ${this._selectedDisciplines.has(
                d.id,
              )
                ? "selected"
                : ""}"
              @click=${() => this._toggleDiscipline(d.id)}
            >
              <span class="discipline-icon">${d.icon}</span>
              <div class="discipline-info">
                <div class="discipline-name">${d.label}</div>
                <div class="discipline-desc">${d.description}</div>
                <div class="discipline-packages">${d.packages}</div>
                <div class="discipline-size">~${d.sizeGB} GB</div>
              </div>
            </div>
          `,
        )}
      </div>

      <p style="margin-top: 16px; font-size: 13px; color: var(--ac-text-secondary)">
        Estimated install size: <strong>${totalSize.toFixed(1)} GB</strong>
      </p>
    `;
  }

  private _renderProvider() {
    return html`
      <h2>${t("onboarding.provider.title")}</h2>
      <p class="step-desc">
        Choose your AI provider and enter your API key. You can change this later in Settings.
      </p>

      <div class="provider-options">
        ${(
          [
            { id: "anthropic", label: "Anthropic (Claude)" },
            { id: "openai", label: "OpenAI (GPT)" },
            { id: "google", label: "Google AI (Gemini)" },
            { id: "web", label: "OpenClaw Web (no API key needed)" },
          ] as const
        ).map(
          (p) => html`
            <div
              class="provider-option ${this._provider === p.id
                ? "selected"
                : ""}"
              @click=${() => (this._provider = p.id)}
            >
              <input
                type="radio"
                name="provider"
                ?checked=${this._provider === p.id}
              />
              <span class="provider-option-label">${p.label}</span>
            </div>
          `,
        )}
      </div>

      ${this._provider !== "web"
        ? html`
            <div class="key-group">
              <label class="key-label">${t("onboarding.provider.apiKey")}</label>
              <div class="key-row">
                <input
                  class="key-input"
                  type="password"
                  placeholder="${this._provider === "anthropic"
                    ? "sk-ant-..."
                    : this._provider === "openai"
                      ? "sk-..."
                      : "AIza..."}"
                  .value=${this._apiKey}
                  @input=${(e: Event) =>
                    (this._apiKey = (
                      e.target as HTMLInputElement
                    ).value)}
                />
                <button class="test-btn" @click=${this._testConnection}>
                  Test
                </button>
              </div>
              ${this._testResult !== "untested"
                ? html`
                    <div class="test-result ${this._testResult}">
                      ${this._testResult === "testing"
                        ? "Testing connection…"
                        : this._testResult === "success"
                          ? "✓ Connection successful"
                          : t("onboarding.provider.failed")}
                    </div>
                  `
                : ""}
            </div>
          `
        : ""}
    `;
  }

  private _renderWorkspace() {
    return html`
      <h2>${t("onboarding.workspace.title")}</h2>
      <p class="step-desc">
        Your workspace is where AcaClaw stores your research files. The
        default location works for most users.
      </p>

      <label class="key-label">${t("onboarding.workspace.path")}</label>
      <input
        class="path-input"
        .value=${this._workspacePath}
        @input=${(e: Event) =>
          (this._workspacePath = (
            e.target as HTMLInputElement
          ).value)}
      />

      <label class="key-label" style="margin-top: 16px">${t("onboarding.workspace.structure")}</label>
      <div class="tree-preview">
        📁 ${this._workspacePath}<br />
        ├── 📁 data/<br />
        │&nbsp;&nbsp;&nbsp;├── 📁 raw/<br />
        │&nbsp;&nbsp;&nbsp;└── 📁 processed/<br />
        ├── 📁 documents/<br />
        │&nbsp;&nbsp;&nbsp;├── 📁 drafts/<br />
        │&nbsp;&nbsp;&nbsp;└── 📁 final/<br />
        ├── 📁 figures/<br />
        ├── 📁 references/<br />
        ├── 📁 notes/<br />
        └── 📁 output/
      </div>
    `;
  }

  private _renderSecurity() {
    return html`
      <h2>${t("onboarding.security.title")}</h2>
      <p class="step-desc">
        Choose how tightly AcaClaw controls what the AI can do.
      </p>

      <div class="security-options">
        <div
          class="security-option ${this._securityLevel === "standard"
            ? "selected"
            : ""}"
          @click=${() => (this._securityLevel = "standard")}
        >
          <input
            type="radio"
            name="security"
            ?checked=${this._securityLevel === "standard"}
          />
          <div>
            <div class="security-label">
              Standard (recommended)
            </div>
            <div class="security-desc">
              Workspace confinement, tool deny-lists, command
              deny-lists, network allowlist, credential scrubbing,
              injection detection, pre-modification backup, audit
              logging.
            </div>
          </div>
        </div>
        <div
          class="security-option ${this._securityLevel === "maximum"
            ? "selected"
            : ""}"
          @click=${() => (this._securityLevel = "maximum")}
        >
          <input
            type="radio"
            name="security"
            ?checked=${this._securityLevel === "maximum"}
          />
          <div>
            <div class="security-label">
              Maximum (Docker sandbox)
            </div>
            <div class="security-desc">
              All Standard protections plus full container isolation.
              All code runs in a disposable Docker container. Requires
              Docker installed and running.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderReady() {
    return html`
      <h2>${t("onboarding.ready.title")}</h2>
      <p class="step-desc">
        Here's a summary of your setup. Click "Finish Setup" to start
        using AcaClaw.
      </p>

      <div class="summary-list">
        <div class="summary-item">
          <span class="label">${t("onboarding.ready.disciplines")}</span>
          <span class="value"
            >${[...this._selectedDisciplines]
              .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
              .join(", ")}</span
          >
        </div>
        <div class="summary-item">
          <span class="label">${t("onboarding.ready.aiProvider")}</span>
          <span class="value"
            >${this._provider.charAt(0).toUpperCase() +
            this._provider.slice(1)}</span
          >
        </div>
        <div class="summary-item">
          <span class="label">${t("backup.snapshots.header.workspace")}</span>
          <span class="value">${this._workspacePath}</span>
        </div>
        <div class="summary-item">
          <span class="label">${t("settings.tab.security")}</span>
          <span class="value"
            >${this._securityLevel === "standard"
              ? "Standard"
              : t("onboarding.ready.maximum")}</span
          >
        </div>
      </div>

      ${this._installing
        ? html`
            <div class="progress-container">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  style="width: ${this._installProgress}%"
                ></div>
              </div>
              <div class="progress-label">
                ${this._installProgress < 100
                  ? "Setting up your environment…"
                  : t("onboarding.ready.done")}
              </div>
            </div>
          `
        : ""}
    `;
  }
}
