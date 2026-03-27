import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

/* ── Modern SVG file/folder icons ── */
const _svg = (body: string, size = 16) =>
  html`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${unsafeHTML(body)}</svg>`;

const wsIconFolder = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
const wsIconFolderOpen = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`;
const wsIconFile = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
const wsIconFileText = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`;
const wsIconCode = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
const wsIconImage = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
const wsIconChart = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`;
const wsIconSettings = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
const wsIconTerminal = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`;
const wsIconBook = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;
const wsIconGlobe = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
const wsIconArrowUp = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`;

interface FileEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
  modified?: string;
}

interface FilePreview {
  type: "image" | "text" | "unsupported";
  name: string;
  ext: string;
  size: number;
  data?: string;
  mime?: string;
  content?: string;
  truncated?: boolean;
}

const MD_EXTS = new Set(["md", "rmd", "qmd"]);

const CORE_FILE_NAMES = new Set([
  "AGENTS.md", "SOUL.md", "TOOLS.md", "IDENTITY.md", "USER.md",
  "HEARTBEAT.md", "BOOTSTRAP.md", "MEMORY.md", "memory.md",
]);
const CODE_EXTS = new Set([
  "py", "r", "js", "ts", "jsx", "tsx", "json", "yml", "yaml", "sh", "bash",
  "csv", "html", "css", "xml", "toml", "ini", "cfg", "conf", "ipynb", "tex",
  "bib", "sql", "rb", "rs", "c", "cpp", "h", "hpp", "java", "go", "lua",
  "pl", "m", "jl", "nix", "dockerfile", "makefile", "txt",
]);

@customElement("acaclaw-workspace")
export class WorkspaceView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _currentPath: string[] = [];
  @state() private _entries: FileEntry[] = [];
  @state() private _loading = false;
  // Dialogs
  @state() private _showCreateProject = false;
  @state() private _showCreateFolder = false;
  @state() private _showCreateFile = false;
  @state() private _createName = "";
  @state() private _createDesc = "";
  @state() private _createDiscipline = "general";
  @state() private _createError = "";
  @state() private _preview: FilePreview | null = null;
  @state() private _previewLoading = false;
  @state() private _zoom = 100;
  @state() private _editMode = false;
  @state() private _editDraft = "";
  @state() private _saving = false;
  @state() private _saveError = "";
  @state() private _coreTab: string | null = null;
  @state() private _coreContent = "";
  @state() private _coreDraft = "";
  @state() private _coreLoading = false;
  @state() private _coreSaving = false;
  @state() private _coreSaveError = "";

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

    /* Toolbar */
    .toolbar {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 16px; flex-wrap: wrap;
    }
    .toolbar-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 6px 14px;
      font-size: 12px; font-weight: 500;
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full);
      cursor: pointer;
      color: var(--ac-text-secondary);
      transition: all 0.15s;
    }
    .toolbar-btn:hover {
      border-color: var(--ac-primary);
      color: var(--ac-primary);
      background: var(--ac-bg-hover);
    }
    .toolbar-btn.primary {
      background: var(--ac-primary);
      color: #fff;
      border-color: var(--ac-primary);
    }
    .toolbar-btn.primary:hover {
      opacity: 0.9;
    }

    /* Breadcrumb */
    .breadcrumb {
      display: flex; align-items: center; gap: 4px;
      font-size: 13px; color: var(--ac-text-secondary);
      margin-bottom: 16px; flex-wrap: wrap;
    }
    .breadcrumb-item {
      cursor: pointer; padding: 2px 6px;
      border-radius: 4px; transition: all 0.15s;
    }
    .breadcrumb-item:hover {
      background: var(--ac-bg-hover); color: var(--ac-text);
    }
    .breadcrumb-sep { color: var(--ac-text-muted); }

    /* File list */
    .file-list {
      display: flex; flex-direction: column;
      border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg);
      overflow: hidden;
    }
    .file-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--ac-border-subtle);
      cursor: pointer;
      transition: background 0.12s;
    }
    .file-row:last-child { border-bottom: none; }
    .file-row:hover { background: var(--ac-bg-hover); }
    .file-icon { display: inline-flex; align-items: center; width: 24px; justify-content: center; flex-shrink: 0; color: var(--ac-text-secondary); }
    .file-name { flex: 1; font-weight: 500; color: var(--ac-text); }
    .file-name.dir { color: var(--ac-primary); }
    .file-meta { font-size: 12px; color: var(--ac-text-muted); }
    .file-size { min-width: 60px; text-align: right; }
    .file-modified { min-width: 120px; text-align: right; }

    /* Empty state */
    .empty-state {
      padding: 48px 24px; text-align: center;
      color: var(--ac-text-muted); font-size: 13px;
    }
    .empty-icon { display: flex; justify-content: center; margin-bottom: 12px; color: var(--ac-text-tertiary); }
    .empty-icon svg { width: 32px; height: 32px; }

    /* Dialog overlay */
    .overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 1000;
      display: flex; align-items: center; justify-content: center;
      animation: fade-in 0.15s ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    .dialog {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-lg);
      padding: 28px;
      width: 420px; max-width: 90vw;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .dialog h3 {
      font-size: 18px; font-weight: 700;
      color: var(--ac-text); margin: 0 0 20px;
    }
    .field { margin-bottom: 16px; }
    .field label {
      display: block; font-size: 12px; font-weight: 600;
      color: var(--ac-text-secondary); margin-bottom: 6px;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .field input, .field select, .field textarea {
      width: 100%; padding: 8px 12px;
      font-size: 13px;
      background: var(--ac-bg);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius);
      color: var(--ac-text);
      box-sizing: border-box;
    }
    .field textarea { min-height: 60px; resize: vertical; font-family: inherit; }
    .field input:focus, .field select:focus, .field textarea:focus {
      outline: none; border-color: var(--ac-primary);
      box-shadow: 0 0 0 2px var(--ac-primary-bg, rgba(99, 102, 241, 0.15));
    }
    .dialog-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      margin-top: 20px;
    }
    .btn-cancel {
      padding: 8px 16px; font-size: 13px; font-weight: 500;
      background: none; border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-full);
      cursor: pointer; color: var(--ac-text-secondary);
    }
    .btn-cancel:hover { background: var(--ac-bg-hover); }
    .btn-create {
      padding: 8px 20px; font-size: 13px; font-weight: 600;
      background: var(--ac-primary); color: #fff;
      border: none; border-radius: var(--ac-radius-full);
      cursor: pointer; transition: opacity 0.15s;
    }
    .btn-create:hover { opacity: 0.9; }
    .btn-create:disabled { opacity: 0.5; cursor: not-allowed; }
    .form-error {
      font-size: 12px; color: var(--ac-error);
      margin-top: 8px;
    }

    /* Preview panel */
    .preview-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 1000;
      display: flex; align-items: center; justify-content: center;
      animation: fade-in 0.15s ease;
    }
    .preview-panel {
      background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-lg);
      width: 95vw; max-width: 1200px;
      max-height: 92vh;
      display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .preview-header {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--ac-border-subtle);
      flex-shrink: 0;
    }
    .preview-header .file-name {
      flex: 1; font-size: 14px; font-weight: 600;
      color: var(--ac-text); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .preview-header .file-badge {
      font-size: 11px; padding: 2px 8px;
      background: var(--ac-bg-hover);
      border-radius: var(--ac-radius-full);
      color: var(--ac-text-muted); text-transform: uppercase;
    }
    .zoom-controls {
      display: flex; align-items: center; gap: 4px;
    }
    .zoom-btn {
      padding: 3px 8px; font-size: 14px; font-weight: 600;
      background: var(--ac-bg-hover); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius); cursor: pointer;
      color: var(--ac-text-secondary); transition: all 0.15s;
      line-height: 1;
    }
    .zoom-btn:hover {
      border-color: var(--ac-primary); color: var(--ac-primary);
    }
    .zoom-label {
      font-size: 11px; min-width: 36px; text-align: center;
      color: var(--ac-text-muted);
    }
    .preview-close {
      padding: 4px 10px; font-size: 18px;
      background: none; border: none;
      cursor: pointer; color: var(--ac-text-muted);
      border-radius: var(--ac-radius);
      transition: all 0.15s; margin-left: 4px;
    }
    .preview-close:hover {
      background: var(--ac-bg-hover); color: var(--ac-text);
    }
    .preview-body {
      flex: 1; overflow: auto; padding: 20px;
      min-height: 200px;
    }
    .preview-body img {
      display: block; margin: 0 auto;
      border-radius: var(--ac-radius);
      background: repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%)
        50% / 16px 16px;
      transition: transform 0.15s ease;
      transform-origin: top center;
    }
    .preview-code {
      font-family: "Fira Code", "JetBrains Mono", "Cascadia Code", ui-monospace, monospace;
      font-size: 13px; line-height: 1.6;
      white-space: pre-wrap; word-break: break-word;
      color: var(--ac-text);
      background: var(--ac-bg);
      padding: 16px; border-radius: var(--ac-radius);
      border: 1px solid var(--ac-border-subtle);
      overflow-x: auto; tab-size: 4;
    }
    .preview-md {
      font-size: 14px; line-height: 1.7;
      color: var(--ac-text);
    }
    .preview-md h1, .preview-md h2, .preview-md h3 {
      margin: 1em 0 0.5em; font-weight: 700;
      color: var(--ac-text);
    }
    .preview-md h1 { font-size: 24px; }
    .preview-md h2 { font-size: 20px; }
    .preview-md h3 { font-size: 16px; }
    .preview-md p { margin: 0.5em 0; }
    .preview-md code {
      font-family: ui-monospace, monospace; font-size: 12px;
      background: var(--ac-bg); padding: 2px 5px;
      border-radius: 3px;
    }
    .preview-md pre {
      background: var(--ac-bg); padding: 12px;
      border-radius: var(--ac-radius);
      border: 1px solid var(--ac-border-subtle);
      overflow-x: auto; font-size: 13px;
    }
    .preview-md pre code { background: none; padding: 0; }
    .preview-md ul, .preview-md ol { padding-left: 1.5em; }
    .preview-md blockquote {
      border-left: 3px solid var(--ac-primary);
      padding: 4px 12px; margin: 0.5em 0;
      color: var(--ac-text-secondary);
    }
    .preview-md a { color: var(--ac-primary); }
    .preview-md hr { border: none; border-top: 1px solid var(--ac-border-subtle); margin: 1em 0; }
    .preview-md table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    .preview-md th, .preview-md td {
      border: 1px solid var(--ac-border-subtle);
      padding: 6px 10px; font-size: 13px;
    }
    .preview-md th { background: var(--ac-bg); font-weight: 600; }
    .preview-truncated {
      font-size: 12px; color: var(--ac-text-muted);
      text-align: center; padding: 8px;
      border-top: 1px solid var(--ac-border-subtle);
    }
    .preview-edit-area {
      width: 100%; min-height: 400px; resize: vertical;
      font-family: "Fira Code", "JetBrains Mono", ui-monospace, monospace;
      font-size: 13px; line-height: 1.6; padding: 16px;
      background: var(--ac-bg); color: var(--ac-text);
      border: 1px solid var(--ac-border-subtle); border-radius: var(--ac-radius);
      box-sizing: border-box; tab-size: 4;
    }
    .preview-edit-area:focus { outline: none; border-color: var(--ac-primary); }
    .preview-footer {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-top: 1px solid var(--ac-border-subtle);
      flex-shrink: 0;
    }
    .preview-footer .save-status { font-size: 12px; color: var(--ac-text-muted); flex: 1; }
    .preview-footer .save-error { font-size: 12px; color: var(--ac-error, #ef4444); flex: 1; }
    .btn-edit, .btn-save { padding: 6px 16px; border-radius: var(--ac-radius-full); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .btn-edit { background: var(--ac-bg-hover); border: 1px solid var(--ac-border); color: var(--ac-text-secondary); }
    .btn-edit:hover { border-color: var(--ac-primary); color: var(--ac-primary); }
    .btn-save { background: var(--ac-primary); border: none; color: #fff; }
    .btn-save:hover { opacity: 0.9; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Core files section (Skills, Soul, etc.) */
    .core-section { margin-bottom: 24px; }
    .core-section h2 { font-size: 16px; font-weight: 700; color: var(--ac-text); margin-bottom: 12px; }
    .core-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
    .core-tab {
      padding: 6px 14px; border-radius: var(--ac-radius-full); font-size: 12px; font-weight: 500;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border); color: var(--ac-text-secondary);
      cursor: pointer; transition: all 0.15s;
    }
    .core-tab:hover { border-color: var(--ac-primary); color: var(--ac-primary); }
    .core-tab.active { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }
    .core-tab.missing { opacity: 0.6; border-style: dashed; }
    .core-tab .tab-badge { font-size: 9px; padding: 1px 5px; background: var(--ac-bg-hover); border-radius: 10px; margin-left: 4px; color: var(--ac-text-muted); }
    .core-editor {
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle); border-radius: var(--ac-radius-lg);
      overflow: hidden;
    }
    .core-editor-header {
      display: flex; align-items: center; gap: 8px; padding: 10px 16px;
      border-bottom: 1px solid var(--ac-border-subtle); font-size: 13px; font-weight: 600; color: var(--ac-text);
    }
    .core-editor-header .dirty-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ac-primary); }
    .core-textarea {
      width: 100%; min-height: 300px; resize: vertical; padding: 16px; box-sizing: border-box;
      font-family: "Fira Code", "JetBrains Mono", ui-monospace, monospace;
      font-size: 13px; line-height: 1.6; border: none; background: var(--ac-bg); color: var(--ac-text); tab-size: 4;
    }
    .core-textarea:focus { outline: none; }
    .core-editor-footer {
      display: flex; align-items: center; gap: 8px; padding: 10px 16px;
      border-top: 1px solid var(--ac-border-subtle);
    }
    .preview-unsupported {
      text-align: center; padding: 40px 20px;
      color: var(--ac-text-muted); font-size: 13px;
    }
    .preview-unsupported .big-icon { display: flex; justify-content: center; margin-bottom: 12px; color: var(--ac-text-tertiary); }
    .preview-unsupported .big-icon svg { width: 40px; height: 40px; }
    .preview-loading {
      text-align: center; padding: 60px 20px;
      color: var(--ac-text-muted); font-size: 13px;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadFiles();
    window.addEventListener("keydown", this._handlePreviewKeydown);
    gateway.addEventListener("state-change", this._handleGatewayState);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._handlePreviewKeydown);
    gateway.removeEventListener("state-change", this._handleGatewayState);
  }

  private _handleGatewayState = (e: Event) => {
    if ((e as CustomEvent).detail?.state === "connected") this._loadFiles();
  };

  // --- Data loading ---

  private async _loadFiles() {
    this._loading = true;
    try {
      const subPath = this._currentPath.length > 0 ? this._currentPath.join("/") : undefined;
      const res = await gateway.call<{ files: FileEntry[] }>(
        "acaclaw.workspace.list", { path: subPath }
      );
      if (res?.files) {
        this._entries = res.files;
        this._loading = false;
        return;
      }
    } catch { /* fallback */ }
    this._entries = [];
    this._loading = false;
  }

  // --- Navigation ---

  private _navigateDir(name: string) {
    this._currentPath = [...this._currentPath, name];
    this._loadFiles();
  }

  private _navigateTo(index: number) {
    this._currentPath = this._currentPath.slice(0, index);
    this._loadFiles();
  }

  // --- Create actions ---

  private _openDialog(type: "project" | "folder" | "file") {
    this._createName = "";
    this._createDesc = "";
    this._createDiscipline = "general";
    this._createError = "";
    this._showCreateProject = type === "project";
    this._showCreateFolder = type === "folder";
    this._showCreateFile = type === "file";
  }

  private _closeDialogs() {
    this._showCreateProject = false;
    this._showCreateFolder = false;
    this._showCreateFile = false;
  }

  private async _submitCreateProject() {
    const name = this._createName.trim();
    if (!name) { this._createError = "Project name is required"; return; }
    try {
      const res = await gateway.call<{ error?: string }>(
        "acaclaw.project.create",
        { name, description: this._createDesc, discipline: this._createDiscipline }
      );
      if (res?.error) { this._createError = res.error; return; }
      this._closeDialogs();
      this._loadFiles();
    } catch (err: unknown) {
      this._createError = (err as Error).message ?? "Failed to create project";
    }
  }

  private async _submitCreateFolder() {
    const name = this._createName.trim();
    if (!name) { this._createError = "Folder name is required"; return; }
    const fullPath = this._currentPath.length > 0
      ? this._currentPath.join("/") + "/" + name
      : name;
    try {
      const res = await gateway.call<{ error?: string }>(
        "acaclaw.workspace.createFolder", { path: fullPath }
      );
      if (res?.error) { this._createError = res.error; return; }
      this._closeDialogs();
      this._loadFiles();
    } catch (err: unknown) {
      this._createError = (err as Error).message ?? "Failed to create folder";
    }
  }

  private async _submitCreateFile() {
    const name = this._createName.trim();
    if (!name) { this._createError = "File name is required"; return; }
    const fullPath = this._currentPath.length > 0
      ? this._currentPath.join("/") + "/" + name
      : name;
    try {
      const res = await gateway.call<{ error?: string }>(
        "acaclaw.workspace.createFile", { path: fullPath }
      );
      if (res?.error) { this._createError = res.error; return; }
      this._closeDialogs();
      this._loadFiles();
    } catch (err: unknown) {
      this._createError = (err as Error).message ?? "Failed to create file";
    }
  }

  // --- Helpers ---

  private _isPreviewable(name: string): boolean {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return MD_EXTS.has(ext) || CODE_EXTS.has(ext)
      || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
  }

  private async _openPreview(entry: FileEntry) {
    if (entry.type === "dir") return;
    const filePath = this._currentPath.length > 0
      ? this._currentPath.join("/") + "/" + entry.name
      : entry.name;
    this._previewLoading = true;
    this._preview = null;
    try {
      const res = await gateway.call<FilePreview>(
        "acaclaw.workspace.readFile", { path: filePath }
      );
      this._preview = res ?? null;
    } catch {
      this._preview = { type: "unsupported", name: entry.name, ext: "", size: 0 };
    }
    this._previewLoading = false;
  }

  private _closePreview() {
    this._preview = null;
    this._previewLoading = false;
    this._editMode = false;
    this._editDraft = "";
    this._saving = false;
    this._saveError = "";
    this._zoom = 100;
  }

  private _toggleEdit() {
    if (!this._editMode && this._preview?.content !== undefined) {
      this._editDraft = this._preview.content;
      this._editMode = true;
      this._saveError = "";
    } else {
      this._editMode = false;
    }
  }

  private async _saveFile() {
    if (!this._preview || this._saving) return;
    this._saving = true;
    this._saveError = "";
    const filePath = this._currentPath.length > 0
      ? this._currentPath.join("/") + "/" + this._preview.name
      : this._preview.name;
    try {
      const res = await gateway.call<{ error?: string }>(
        "agents.files.set", { agentId: "general", name: filePath, content: this._editDraft }
      );
      if (res?.error) {
        // Fallback: try workspace write
        const res2 = await gateway.call<{ error?: string }>(
          "acaclaw.workspace.writeFile", { path: filePath, content: this._editDraft }
        );
        if (res2?.error) { this._saveError = res2.error; this._saving = false; return; }
      }
      if (this._preview) {
        this._preview = { ...this._preview, content: this._editDraft };
      }
      this._editMode = false;
    } catch (err: unknown) {
      this._saveError = (err as Error).message ?? "Failed to save";
    }
    this._saving = false;
  }

  // --- Core bootstrap files (Skills, Soul, etc.) ---

  private get _coreFiles(): FileEntry[] {
    if (this._currentPath.length > 0) return [];
    return this._entries.filter((e) => e.type === "file" && CORE_FILE_NAMES.has(e.name));
  }

  private async _selectCoreTab(name: string) {
    this._coreTab = name;
    this._coreLoading = true;
    this._coreSaveError = "";
    try {
      // Try agents.files.get first (proper OpenClaw RPC)
      const res = await gateway.call<{ content?: string }>(
        "agents.files.get", { agentId: "general", name }
      );
      if (res?.content !== undefined) {
        this._coreContent = res.content;
        this._coreDraft = this._coreContent;
        this._coreLoading = false;
        return;
      }
    } catch { /* fallback to workspace read */ }
    try {
      const res = await gateway.call<{ type: string; content?: string }>(
        "acaclaw.workspace.readFile", { path: name }
      );
      this._coreContent = res?.content ?? "";
      this._coreDraft = this._coreContent;
    } catch {
      this._coreContent = "";
      this._coreDraft = "";
    }
    this._coreLoading = false;
  }

  private async _saveCoreFile() {
    if (!this._coreTab || this._coreSaving) return;
    this._coreSaving = true;
    this._coreSaveError = "";
    try {
      // Try agents.files.set first
      await gateway.call("agents.files.set", {
        agentId: "general", name: this._coreTab, content: this._coreDraft,
      });
      this._coreContent = this._coreDraft;
    } catch {
      // Fallback to workspace write
      try {
        await gateway.call("acaclaw.workspace.writeFile", {
          path: this._coreTab, content: this._coreDraft,
        });
        this._coreContent = this._coreDraft;
      } catch (err: unknown) {
        this._coreSaveError = (err as Error).message ?? "Failed to save";
      }
    }
    this._coreSaving = false;
  }

  private _zoomIn() { this._zoom = Math.min(300, this._zoom + 25); }
  private _zoomOut() { this._zoom = Math.max(25, this._zoom - 25); }
  private _zoomReset() { this._zoom = 100; }

  private _handlePreviewKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this._closePreview();
    if (e.key === "+" || e.key === "=") this._zoomIn();
    if (e.key === "-") this._zoomOut();
    if (e.key === "0") this._zoomReset();
  };

  /** Minimal markdown→HTML for preview (no external deps) */
  private _renderMarkdown(src: string): string {
    let h = src
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Code blocks (``` ... ```)
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre><code>${code}</code></pre>`);
    // Inline code
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Headings
    h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // Bold & italic
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Links
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Images
    h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">');
    // Blockquote
    h = h.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
    // Horizontal rule
    h = h.replace(/^---$/gm, "<hr>");
    // Unordered lists
    h = h.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
    h = h.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
    // Paragraphs — wrap lines not already wrapped
    h = h.replace(/^(?!<[huplbao]|<li|<hr|<pre|<code)(.+)$/gm, "<p>$1</p>");
    return h;
  }

  private _formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  private _fileIcon(name: string): TemplateResult {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    switch (ext) {
      case "md": case "txt": return wsIconFileText;
      case "py": case "r": return wsIconCode;
      case "csv": case "tsv": return wsIconChart;
      case "json": case "yml": case "yaml": return wsIconSettings;
      case "sh": return wsIconTerminal;
      case "pdf": return wsIconBook;
      case "png": case "jpg": case "jpeg": case "gif": case "webp": case "svg": return wsIconImage;
      case "ipynb": return wsIconBook;
      case "html": return wsIconGlobe;
      case "ts": case "js": case "tsx": case "jsx": return wsIconCode;
      default: return wsIconFile;
    }
  }

  /** Whether the user is currently inside the Projects/ directory */
  private get _inProjectsDir(): boolean {
    return this._currentPath.length > 0 && this._currentPath[0] === "Projects";
  }

  /** Whether we are at exactly ~/AcaClaw/Projects (depth 1) */
  private get _atProjectsRoot(): boolean {
    return this._currentPath.length === 1 && this._currentPath[0] === "Projects";
  }

  // --- Rendering ---

  private _renderBreadcrumb() {
    return html`
      <div class="breadcrumb">
        <span class="breadcrumb-item" @click=${() => this._navigateTo(0)}>~/AcaClaw</span>
        ${this._currentPath.map((seg, i) => html`
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-item" @click=${() => this._navigateTo(i + 1)}>${seg}</span>
        `)}
      </div>
    `;
  }

  private _renderToolbar() {
    return html`
      <div class="toolbar">
        ${this._atProjectsRoot ? html`
          <button class="toolbar-btn primary" @click=${() => this._openDialog("project")}>
            ${t("workspace.newProject")}
          </button>
        ` : nothing}
        <button class="toolbar-btn" @click=${() => this._openDialog("folder")}>
          ${t("workspace.newFolder")}
        </button>
        <button class="toolbar-btn" @click=${() => this._openDialog("file")}>
          ${t("workspace.newFile")}
        </button>
      </div>
    `;
  }

  private _renderFiles() {
    const dirs = this._entries.filter(e => e.type === "dir").sort((a, b) => a.name.localeCompare(b.name));
    const files = this._entries.filter(e => e.type === "file").sort((a, b) => a.name.localeCompare(b.name));
    const sorted = [...dirs, ...files];

    if (sorted.length === 0 && !this._loading) {
      return html`<div class="empty-state"><div class="empty-icon">${wsIconFolderOpen}</div>${t("workspace.emptyFolder")}</div>`;
    }

    return html`
      <div class="file-list">
        ${this._currentPath.length > 0 ? html`
          <div class="file-row" @click=${() => this._navigateTo(this._currentPath.length - 1)}>
            <span class="file-icon">${wsIconArrowUp}</span>
            <span class="file-name">..</span>
          </div>
        ` : nothing}
        ${sorted.map(entry => html`
          <div class="file-row"
               @click=${() => entry.type === "dir" ? this._navigateDir(entry.name) : this._openPreview(entry)}>
            <span class="file-icon">${entry.type === "dir" ? wsIconFolder : this._fileIcon(entry.name)}</span>
            <span class="file-name ${entry.type === "dir" ? "dir" : ""}">${entry.name}</span>
            <span class="file-meta file-size">${entry.size ? this._formatSize(entry.size) : ""}</span>
            <span class="file-meta file-modified">${entry.modified ?? ""}</span>
          </div>
        `)}
      </div>
    `;
  }

  private _renderDialogs() {
    if (this._showCreateProject) {
      return html`
        <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeDialogs(); }}>
          <div class="dialog">
            <h3>${t("workspace.dialog.newProject")}</h3>
            <div class="field">
              <label>${t("workspace.field.projectName")}</label>
              <input type="text" placeholder="my-research-project"
                .value=${this._createName}
                @input=${(e: InputEvent) => { this._createName = (e.target as HTMLInputElement).value; }}>
            </div>
            <div class="field">
              <label>${t("workspace.field.description")}</label>
              <textarea placeholder="Brief project description..."
                .value=${this._createDesc}
                @input=${(e: InputEvent) => { this._createDesc = (e.target as HTMLTextAreaElement).value; }}></textarea>
            </div>
            <div class="field">
              <label>${t("agents.discipline")}</label>
              <select .value=${this._createDiscipline}
                @change=${(e: Event) => { this._createDiscipline = (e.target as HTMLSelectElement).value; }}>
                <option value="general">General</option>
                <option value="biology">Biology</option>
                <option value="chemistry">Chemistry</option>
                <option value="medicine">Medicine</option>
                <option value="physics">Physics</option>
                <option value="cs">Computer Science</option>
              </select>
            </div>
            ${this._createError ? html`<div class="form-error">${this._createError}</div>` : nothing}
            <div class="dialog-actions">
              <button class="btn-cancel" @click=${() => this._closeDialogs()}>${t("settings.uninstall.cancel")}</button>
              <button class="btn-create" ?disabled=${!this._createName.trim()}
                @click=${() => this._submitCreateProject()}>${t("workspace.createProject")}</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this._showCreateFolder) {
      return html`
        <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeDialogs(); }}>
          <div class="dialog">
            <h3>${t("workspace.dialog.newFolder")}</h3>
            <div class="field">
              <label>${t("workspace.field.folderName")}</label>
              <input type="text" placeholder="my-folder"
                .value=${this._createName}
                @input=${(e: InputEvent) => { this._createName = (e.target as HTMLInputElement).value; }}>
            </div>
            ${this._createError ? html`<div class="form-error">${this._createError}</div>` : nothing}
            <div class="dialog-actions">
              <button class="btn-cancel" @click=${() => this._closeDialogs()}>${t("settings.uninstall.cancel")}</button>
              <button class="btn-create" ?disabled=${!this._createName.trim()}
                @click=${() => this._submitCreateFolder()}>${t("env.create")}</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this._showCreateFile) {
      return html`
        <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeDialogs(); }}>
          <div class="dialog">
            <h3>${t("workspace.dialog.newFile")}</h3>
            <div class="field">
              <label>${t("workspace.field.fileName")}</label>
              <input type="text" placeholder="notes.md"
                .value=${this._createName}
                @input=${(e: InputEvent) => { this._createName = (e.target as HTMLInputElement).value; }}>
            </div>
            ${this._createError ? html`<div class="form-error">${this._createError}</div>` : nothing}
            <div class="dialog-actions">
              <button class="btn-cancel" @click=${() => this._closeDialogs()}>${t("settings.uninstall.cancel")}</button>
              <button class="btn-create" ?disabled=${!this._createName.trim()}
                @click=${() => this._submitCreateFile()}>${t("env.create")}</button>
            </div>
          </div>
        </div>
      `;
    }

    return nothing;
  }

  private _renderPreview() {
    if (this._previewLoading) {
      return html`
        <div class="preview-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closePreview(); }}>
          <div class="preview-panel">
            <div class="preview-loading">${t("workspace.preview.loading")}</div>
          </div>
        </div>
      `;
    }
    if (!this._preview) return nothing;
    const p = this._preview;

    return html`
      <div class="preview-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closePreview(); }}>
        <div class="preview-panel">
          <div class="preview-header">
            <span class="file-name">${p.name}</span>
            <span class="file-badge">${p.ext || "file"}</span>
            <span class="file-badge">${this._formatSize(p.size)}</span>
            ${p.type === "image" && p.data ? html`
              <div class="zoom-controls">
                <button class="zoom-btn" @click=${() => this._zoomOut()}>−</button>
                <span class="zoom-label">${this._zoom}%</span>
                <button class="zoom-btn" @click=${() => this._zoomIn()}>+</button>
                <button class="zoom-btn" @click=${() => this._zoomReset()} style="font-size:11px;">${t("workspace.preview.fit")}</button>
              </div>
            ` : nothing}
            <button class="preview-close" @click=${() => this._closePreview()}>✕</button>
          </div>
          <div class="preview-body">
            ${this._editMode && p.type === "text"
              ? html`<textarea class="preview-edit-area"
                  .value=${this._editDraft}
                  @input=${(e: Event) => { this._editDraft = (e.target as HTMLTextAreaElement).value; }}
                ></textarea>`
              : p.type === "image" && p.data
                ? html`<img src="data:${p.mime};base64,${p.data}" alt="${p.name}"
                       style="transform: scale(${this._zoom / 100}); max-width: ${this._zoom <= 100 ? '100%' : 'none'};">`
                : p.type === "image" && p.truncated
                  ? html`<div class="preview-unsupported">
                      <div class="big-icon">${wsIconImage}</div>
                      Image too large to preview (${this._formatSize(p.size)})
                    </div>`
                : p.type === "text" && p.content !== undefined && MD_EXTS.has(p.ext)
                  ? html`<div class="preview-md">${unsafeHTML(this._renderMarkdown(p.content))}</div>`
                : p.type === "text" && p.content !== undefined
                  ? html`<pre class="preview-code">${p.content}</pre>`
                : html`<div class="preview-unsupported">
                    <div class="big-icon">${wsIconFile}</div>
                    Preview not available for .${p.ext} files
                  </div>`
            }
          </div>
          ${p.type === "text" && p.content !== undefined ? html`
            <div class="preview-footer">
              ${this._saveError ? html`<span class="save-error">${this._saveError}</span>` : html`<span class="save-status">${this._editMode ? "Editing" : ""}</span>`}
              ${this._editMode
                ? html`
                  <button class="btn-edit" @click=${() => { this._editMode = false; }}>Cancel</button>
                  <button class="btn-save" @click=${this._saveFile} ?disabled=${this._saving || this._editDraft === p.content}>
                    ${this._saving ? "Saving..." : "Save"}
                  </button>`
                : html`<button class="btn-edit" @click=${this._toggleEdit}>Edit</button>`
              }
            </div>
          ` : nothing}
          ${p.truncated && p.type === "text" ? html`
            <div class="preview-truncated">${t("workspace.preview.truncated")}</div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private _renderCoreFiles() {
    const coreFiles = this._coreFiles;
    if (coreFiles.length === 0) return nothing;

    const isDirty = this._coreDraft !== this._coreContent;

    return html`
      <div class="core-section">
        <h2>Agent Files</h2>
        <div class="core-tabs">
          ${coreFiles.map((f) => html`
            <button class="core-tab ${this._coreTab === f.name ? "active" : ""}"
              @click=${() => this._selectCoreTab(f.name)}>
              ${f.name.replace(/\.md$/i, "")}
            </button>
          `)}
        </div>
        ${this._coreTab ? html`
          <div class="core-editor">
            <div class="core-editor-header">
              ${this._coreTab}
              ${isDirty ? html`<span class="dirty-dot" title="Unsaved changes"></span>` : ""}
            </div>
            ${this._coreLoading
              ? html`<div style="padding:40px;text-align:center;color:var(--ac-text-muted)">Loading...</div>`
              : html`<textarea class="core-textarea"
                  .value=${this._coreDraft}
                  @input=${(e: Event) => { this._coreDraft = (e.target as HTMLTextAreaElement).value; }}
                ></textarea>`
            }
            <div class="core-editor-footer">
              ${this._coreSaveError ? html`<span class="save-error" style="flex:1;font-size:12px;color:var(--ac-error)">${this._coreSaveError}</span>` : html`<span style="flex:1"></span>`}
              <button class="btn-save" @click=${this._saveCoreFile} ?disabled=${this._coreSaving || !isDirty}>
                ${this._coreSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  override render() {
    return html`
      <h1>${t("backup.snapshots.header.workspace")}</h1>
      <div class="subtitle">${t("workspace.subtitle")}</div>

      ${this._renderCoreFiles()}

      ${this._renderBreadcrumb()}
      ${this._renderToolbar()}
      ${this._renderFiles()}
      ${this._renderDialogs()}
      ${this._renderPreview()}
    `;
  }
}
