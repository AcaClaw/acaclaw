/** Sessions view — session management with sorting, filtering, and bulk operations. */
import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

interface Session {
  key: string;
  kind: string;
  label: string;
  updatedAt: number;
  tokens: number;
  model?: string;
  thinkingLevel?: string;
}

type SortField = "key" | "kind" | "updatedAt" | "tokens" | "label";
type SortDir = "asc" | "desc";

@customElement("acaclaw-sessions")
export class SessionsView extends LitElement {
  private _lc = new LocaleController(this);
  @state() private _sessions: Session[] = [];
  @state() private _loading = true;
  @state() private _search = "";
  @state() private _sortField: SortField = "updatedAt";
  @state() private _sortDir: SortDir = "desc";
  @state() private _pageSize = 25;
  @state() private _page = 0;
  @state() private _selected = new Set<string>();
  @state() private _editingLabel: string | null = null;
  @state() private _editLabelValue = "";

  static override styles = css`
    :host { display: block; animation: fade-in 0.3s ease-out forwards; }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ac-text); margin-bottom: 4px; }
    .subtitle { font-size: 15px; color: var(--ac-text-muted); line-height: 1.5; margin-bottom: 24px; }

    .toolbar {
      display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .search-box {
      flex: 1; min-width: 200px; padding: 10px 14px; font-size: 13px;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle);
      border-radius: var(--ac-radius-lg); color: var(--ac-text); outline: none;
      font-family: inherit;
    }
    .search-box:focus { border-color: var(--ac-primary); }
    .search-box::placeholder { color: var(--ac-text-tertiary); }

    .btn {
      padding: 8px 16px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full);
      background: var(--ac-bg-surface); color: var(--ac-text-muted);
      cursor: pointer; transition: all 0.15s;
    }
    .btn:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .btn.primary { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }
    .btn.danger { background: #ef4444; color: #fff; border-color: #ef4444; }
    .btn.danger:hover { background: #dc2626; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .page-size {
      padding: 6px 10px; font-size: 12px; background: var(--ac-bg-surface);
      border: 1px solid var(--ac-border-subtle); border-radius: var(--ac-radius-lg);
      color: var(--ac-text); font-family: inherit;
    }

    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      text-align: left; padding: 10px 12px; font-weight: 700; font-size: 12px;
      color: var(--ac-text-muted); border-bottom: 1px solid var(--ac-border);
      text-transform: uppercase; letter-spacing: 0.04em;
      cursor: pointer; user-select: none; white-space: nowrap;
    }
    th:hover { color: var(--ac-text); }
    th .sort-arrow { margin-left: 4px; font-size: 10px; }
    td {
      padding: 10px 12px; border-bottom: 1px solid var(--ac-border-subtle);
      color: var(--ac-text); vertical-align: middle;
    }
    tr:hover td { background: var(--ac-bg-hover); }
    tr.selected td { background: rgba(99, 102, 241, 0.06); }

    .key-cell { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; word-break: break-all; }
    .token-cell { font-variant-numeric: tabular-nums; }
    .time-cell { white-space: nowrap; color: var(--ac-text-muted); font-size: 12px; }

    .badge {
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: var(--ac-radius-full);
      background: var(--ac-bg-hover); color: var(--ac-text-muted);
    }

    .label-edit {
      background: var(--ac-bg-surface); border: 1px solid var(--ac-primary);
      border-radius: 4px; padding: 4px 8px; font-size: 13px;
      color: var(--ac-text); outline: none; font-family: inherit; width: 160px;
    }

    input[type="checkbox"] {
      width: 16px; height: 16px; accent-color: var(--ac-primary); cursor: pointer;
    }

    .pagination {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 16px; font-size: 13px; color: var(--ac-text-muted);
    }
    .pagination .page-btns { display: flex; gap: 6px; }

    .empty-state {
      text-align: center; padding: 48px; color: var(--ac-text-muted); font-size: 14px;
    }

    .bulk-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px; background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.2); border-radius: var(--ac-radius-lg);
      margin-bottom: 12px; font-size: 13px; color: var(--ac-text);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._loadSessions();
  }

  private async _loadSessions() {
    this._loading = true;
    try {
      const result = await gateway.call<{ sessions: Session[] }>("sessions.list");
      this._sessions = result?.sessions ?? [];
    } catch {
      this._sessions = [];
    }
    this._loading = false;
  }

  private _sortedFiltered(): Session[] {
    let list = [...this._sessions];
    if (this._search) {
      const q = this._search.toLowerCase();
      list = list.filter(
        (s) =>
          s.key.toLowerCase().includes(q) ||
          (s.label || "").toLowerCase().includes(q) ||
          (s.kind || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const field = this._sortField;
      let av: string | number = (a as unknown as Record<string, unknown>)[field] as string | number ?? "";
      let bv: string | number = (b as unknown as Record<string, unknown>)[field] as string | number ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return this._sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }

  private _paged(): Session[] {
    const all = this._sortedFiltered();
    const start = this._page * this._pageSize;
    return all.slice(start, start + this._pageSize);
  }

  private _toggleSort(field: SortField) {
    if (this._sortField === field) {
      this._sortDir = this._sortDir === "asc" ? "desc" : "asc";
    } else {
      this._sortField = field;
      this._sortDir = "asc";
    }
  }

  private _sortArrow(field: SortField) {
    if (this._sortField !== field) return "";
    return this._sortDir === "asc" ? "▲" : "▼";
  }

  private _toggleSelect(key: string) {
    const s = new Set(this._selected);
    if (s.has(key)) s.delete(key);
    else s.add(key);
    this._selected = s;
  }

  private _toggleSelectAll() {
    const paged = this._paged();
    const allSelected = paged.every((s) => this._selected.has(s.key));
    const next = new Set(this._selected);
    for (const s of paged) {
      if (allSelected) next.delete(s.key);
      else next.add(s.key);
    }
    this._selected = next;
  }

  private async _deleteSelected() {
    for (const key of this._selected) {
      try {
        await gateway.call("sessions.delete", { key });
      } catch { /* ignore individual failures */ }
    }
    this._selected = new Set();
    await this._loadSessions();
  }

  private _startEditLabel(session: Session) {
    this._editingLabel = session.key;
    this._editLabelValue = session.label || "";
  }

  private async _saveLabel(key: string) {
    try {
      await gateway.call("sessions.setLabel", { key, label: this._editLabelValue });
    } catch { /* ignore */ }
    this._editingLabel = null;
    await this._loadSessions();
  }

  private _timeAgo(ts: number): string {
    if (!ts) return "—";
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  override render() {
    const total = this._sortedFiltered().length;
    const totalPages = Math.ceil(total / this._pageSize);
    const paged = this._paged();

    return html`
      <h1>${t("sessions.title")}</h1>
      <div class="subtitle">${t("sessions.subtitle")}</div>

      <div class="toolbar">
        <input class="search-box" placeholder="${t("sessions.search")}"
          .value=${this._search} @input=${(e: InputEvent) => { this._search = (e.target as HTMLInputElement).value; this._page = 0; }} />
        <select class="page-size" @change=${(e: Event) => { this._pageSize = Number((e.target as HTMLSelectElement).value); this._page = 0; }}>
          ${[10, 25, 50, 100].map((n) => html`<option value=${n} ?selected=${this._pageSize === n}>${n} / page</option>`)}
        </select>
        <button class="btn" @click=${this._loadSessions}>${t("sessions.refresh")}</button>
      </div>

      ${this._selected.size > 0
        ? html`
            <div class="bulk-bar">
              <span>${this._selected.size} selected</span>
              <button class="btn danger" @click=${this._deleteSelected}>${t("sessions.deleteSelected")}</button>
              <button class="btn" @click=${() => { this._selected = new Set(); }}>${t("sessions.deselectAll")}</button>
            </div>
          `
        : nothing}

      ${this._loading
        ? html`<div class="empty-state">${t("sessions.loading")}</div>`
        : paged.length === 0
          ? html`<div class="empty-state">${t("sessions.empty")}</div>`
          : html`
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style="width:40px"><input type="checkbox" @change=${this._toggleSelectAll} .checked=${paged.length > 0 && paged.every((s) => this._selected.has(s.key))} /></th>
                      <th @click=${() => this._toggleSort("key")}>Key <span class="sort-arrow">${this._sortArrow("key")}</span></th>
                      <th @click=${() => this._toggleSort("kind")}>Kind <span class="sort-arrow">${this._sortArrow("kind")}</span></th>
                      <th @click=${() => this._toggleSort("label")}>Label <span class="sort-arrow">${this._sortArrow("label")}</span></th>
                      <th @click=${() => this._toggleSort("tokens")}>Tokens <span class="sort-arrow">${this._sortArrow("tokens")}</span></th>
                      <th @click=${() => this._toggleSort("updatedAt")}>Updated <span class="sort-arrow">${this._sortArrow("updatedAt")}</span></th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${paged.map(
                      (s) => html`
                        <tr class="${this._selected.has(s.key) ? "selected" : ""}">
                          <td><input type="checkbox" .checked=${this._selected.has(s.key)} @change=${() => this._toggleSelect(s.key)} /></td>
                          <td class="key-cell">${s.key}</td>
                          <td><span class="badge">${s.kind || "—"}</span></td>
                          <td>
                            ${this._editingLabel === s.key
                              ? html`<input class="label-edit" .value=${this._editLabelValue}
                                  @input=${(e: InputEvent) => { this._editLabelValue = (e.target as HTMLInputElement).value; }}
                                  @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._saveLabel(s.key); if (e.key === "Escape") this._editingLabel = null; }}
                                  @blur=${() => this._saveLabel(s.key)} />`
                              : html`<span style="cursor:pointer" @dblclick=${() => this._startEditLabel(s)}>${s.label || "—"}</span>`
                            }
                          </td>
                          <td class="token-cell">${s.tokens?.toLocaleString() ?? "—"}</td>
                          <td class="time-cell">${this._timeAgo(s.updatedAt)}</td>
                          <td>
                            <button class="btn" style="padding:4px 10px;font-size:12px" @click=${() => this._openInChat(s.key)}>${t("sessions.openInChat")}</button>
                          </td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              </div>

              <div class="pagination">
                <span>${t("sessions.showing", this._page * this._pageSize + 1, Math.min((this._page + 1) * this._pageSize, total), total)}</span>
                <div class="page-btns">
                  <button class="btn" ?disabled=${this._page === 0} @click=${() => { this._page--; }}>← Prev</button>
                  <button class="btn" ?disabled=${this._page >= totalPages - 1} @click=${() => { this._page++; }}>Next →</button>
                </div>
              </div>
            `
      }
    `;
  }

  private _openInChat(sessionKey: string) {
    window.dispatchEvent(new CustomEvent("load-session", { detail: { sessionKey } }));
  }
}
