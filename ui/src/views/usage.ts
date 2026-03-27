import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { gateway } from "../controllers/gateway.js";
import { t, LocaleController } from "../i18n.js";

const TOKEN_RESET_KEY = "acaclaw-token-reset";
const QUOTA_RESET_KEY = "acaclaw-quota-reset";

interface DayUsage {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

interface CostUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

interface CostUsageSummary {
  updatedAt: number;
  days: number;
  daily: DayUsage[];
  totals: CostUsageTotals;
}

interface ToolUsageEntry {
  name: string;
  count: number;
}

interface SessionUsageEntry {
  key: string;
  label?: string;
  model?: string;
  modelProvider?: string;
  updatedAt?: number;
  usage?: {
    totalTokens?: number;
    totalCost?: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    messageCounts?: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    toolUsage?: {
      totalCalls: number;
      uniqueTools: number;
    };
  } | null;
}

interface SessionsUsageResult {
  sessions?: SessionUsageEntry[];
  totals?: CostUsageTotals;
  aggregates?: {
    tools?: {
      totalCalls: number;
      uniqueTools: number;
      tools: ToolUsageEntry[];
    };
    messages?: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    daily?: Array<{
      date: string;
      tokens: number;
      cost: number;
      messages: number;
      toolCalls: number;
      errors: number;
    }>;
    models?: Array<{ model: string; provider?: string; tokens: number; cost: number; count: number }>;
    providers?: Array<{ provider: string; tokens: number; cost: number; count: number }>;
  };
}

interface TokenResetOffset {
  date: string;
  tokens: number;
  cost: number;
  input: number;
  output: number;
  messages: number;
  toolCalls: number;
}

interface QuotaResetOffset {
  date: string;
  total: number;
  tools: Record<string, number>;
}

const SEARCH_TOOLS = new Set(["web_search", "web_fetch", "browser"]);

interface ToolQuota { limit: number; }
const DEFAULT_QUOTAS: Record<string, ToolQuota> = {
  web_search: { limit: 1000 },
  browser: { limit: 0 },
  web_fetch: { limit: 0 },
};

function loadQuotas(): Record<string, ToolQuota> {
  try {
    const raw = localStorage.getItem("acaclaw-tool-quotas");
    if (raw) return { ...DEFAULT_QUOTAS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_QUOTAS };
}

function saveQuotas(q: Record<string, ToolQuota>) {
  localStorage.setItem("acaclaw-tool-quotas", JSON.stringify(q));
}

function billingCycleStart(billingDay: number): string {
  const now = new Date();
  const day = Math.min(billingDay, 28);
  let start: Date;
  if (now.getDate() >= day) {
    start = new Date(now.getFullYear(), now.getMonth(), day);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, day);
  }
  return fmtDate(start);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

@customElement("acaclaw-usage")
export class UsageView extends LitElement {
  private _lc = new LocaleController(this);

  // Cost/token data
  @state() private _daily: DayUsage[] = [];
  @state() private _totalCost = 0;
  @state() private _totalTokens = 0;
  @state() private _totalInput = 0;
  @state() private _totalOutput = 0;
  @state() private _totalCacheRead = 0;
  @state() private _totalCacheWrite = 0;

  // Session/aggregate data
  @state() private _sessions: SessionUsageEntry[] = [];
  @state() private _toolUsage: ToolUsageEntry[] = [];
  @state() private _totalToolCalls = 0;
  @state() private _totalMessages = 0;
  @state() private _userMessages = 0;
  @state() private _assistantMessages = 0;
  @state() private _totalErrors = 0;
  @state() private _topModels: Array<{ model: string; provider?: string; tokens: number; cost: number; count: number }> = [];
  @state() private _topProviders: Array<{ provider: string; tokens: number; cost: number; count: number }> = [];
  @state() private _sessionDaily: Array<{ date: string; messages: number; toolCalls: number; errors: number }> = [];

  // Quota tracking
  @state() private _monthlySearchCalls = 0;
  @state() private _monthlyToolBreakdown: ToolUsageEntry[] = [];

  // UI controls
  @state() private _period: "today" | "week" | "month" | "custom" = "week";
  @state() private _startDate = "";
  @state() private _endDate = "";
  @state() private _chartMode: "tokens" | "cost" = "tokens";
  @state() private _dailyChartMode: "total" | "by-type" = "total";
  @state() private _sessionSort: "cost" | "tokens" | "recent" | "messages" = "tokens";
  @state() private _billingDay = Number(localStorage.getItem("acaclaw-billing-day")) || 1;
  @state() private _quotas: Record<string, ToolQuota> = loadQuotas();
  @state() private _editingQuotaTool: string | null = null;
  @state() private _tokenResetOffset: TokenResetOffset | null = null;
  @state() private _quotaResetOffset: QuotaResetOffset | null = null;

  static override styles = css`
    :host { display: block; }
    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 24px; color: var(--ac-text); }

    /* Controls row */
    .controls { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .period-btn {
      padding: 6px 14px; border-radius: var(--ac-radius-full); font-size: 13px; font-weight: 500;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border); color: var(--ac-text-secondary);
      transition: all 0.15s; cursor: pointer;
    }
    .period-btn:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .period-btn.active { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }
    .date-input {
      padding: 5px 10px; border: 1px solid var(--ac-border); border-radius: var(--ac-radius);
      font-size: 13px; background: var(--ac-bg-surface); color: var(--ac-text); cursor: pointer;
    }
    .date-input:focus { outline: none; border-color: var(--ac-primary); }
    .date-sep { color: var(--ac-text-muted); font-size: 12px; }
    .mode-toggle {
      display: flex; border: 1px solid var(--ac-border); border-radius: var(--ac-radius-full); overflow: hidden; margin-left: 8px;
    }
    .mode-toggle button {
      padding: 4px 12px; font-size: 12px; font-weight: 500; border: none; cursor: pointer;
      background: var(--ac-bg-surface); color: var(--ac-text-secondary); transition: all 0.15s;
    }
    .mode-toggle button.active { background: var(--ac-primary); color: #fff; }
    .export-btn {
      margin-left: auto; padding: 6px 14px; border-radius: var(--ac-radius-full); font-size: 13px; font-weight: 500;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border); cursor: pointer; transition: all 0.15s;
    }
    .export-btn:hover { background: var(--ac-bg-hover); border-color: var(--ac-primary); color: var(--ac-primary); }
    .reset-btn {
      padding: 6px 14px; border-radius: var(--ac-radius-full); font-size: 13px; font-weight: 500;
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border); color: var(--ac-text-secondary);
      cursor: pointer; transition: all 0.15s;
    }
    .reset-btn:hover { background: var(--ac-bg-hover); color: var(--ac-text); }
    .reset-info { font-size: 12px; color: var(--ac-text-secondary); display: flex; align-items: center; gap: 6px; }
    .clear-reset-btn { background: none; border: none; color: var(--ac-text-tertiary); font-size: 12px; cursor: pointer; padding: 0; text-decoration: underline; }
    .clear-reset-btn:hover { color: var(--ac-text-secondary); }

    /* Summary cards */
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .summary-card {
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border); border-radius: var(--ac-radius); padding: 16px;
      box-shadow: var(--ac-shadow-sm); transition: box-shadow 0.15s;
    }
    .summary-card:hover { box-shadow: var(--ac-shadow-md); }
    .summary-label { font-size: 11px; color: var(--ac-text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-value { font-size: 24px; font-weight: 700; margin-top: 4px; letter-spacing: -0.02em; }
    .summary-sub { font-size: 11px; color: var(--ac-text-muted); margin-top: 2px; }

    /* Card container */
    .card {
      background: var(--ac-bg-surface); border: 1px solid var(--ac-border-subtle); border-radius: var(--ac-radius-lg);
      padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .card h2 { font-size: 16px; font-weight: 700; color: var(--ac-text); margin-bottom: 16px; letter-spacing: -0.02em; }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .card-header h2 { margin-bottom: 0; }

    /* Bar chart */
    .chart { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding-top: 8px; }
    .bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; height: 100%; justify-content: flex-end; }
    .bar-stack { display: flex; flex-direction: column; width: 100%; max-width: 36px; justify-content: flex-end; }
    .bar { border-radius: 3px 3px 0 0; min-height: 1px; transition: height 0.2s; }
    .bar.input { background: var(--ac-primary); }
    .bar.output { background: var(--ac-primary-light, #a78bfa); }
    .bar.cache-read { background: #22d3ee; }
    .bar.cache-write { background: #f59e0b; }
    .bar.cost-bar { background: var(--ac-primary); }
    .bar-label { font-size: 9px; color: var(--ac-text-muted); margin-top: 3px; }
    .legend { display: flex; gap: 14px; margin-top: 10px; font-size: 11px; color: var(--ac-text-secondary); flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; }

    /* Token type breakdown */
    .breakdown-bar { display: flex; height: 20px; border-radius: 10px; overflow: hidden; margin: 8px 0 4px; }
    .breakdown-seg { min-width: 2px; transition: width 0.3s; }
    .breakdown-labels { display: flex; gap: 16px; font-size: 11px; color: var(--ac-text-secondary); flex-wrap: wrap; }
    .breakdown-label { display: flex; align-items: center; gap: 4px; }
    .breakdown-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

    /* Session list */
    .session-list { max-height: 400px; overflow-y: auto; }
    .session-row {
      display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--ac-border-subtle);
      font-size: 12px; transition: background 0.1s;
    }
    .session-row:hover { background: var(--ac-bg-hover); }
    .session-row:last-child { border-bottom: none; }
    .session-label { flex: 1; font-weight: 500; color: var(--ac-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-model { color: var(--ac-text-muted); font-size: 11px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-stat { min-width: 60px; text-align: right; color: var(--ac-text-secondary); font-variant-numeric: tabular-nums; }
    .session-bar-bg { flex: 1; height: 6px; border-radius: 3px; background: var(--ac-bg-hover); min-width: 60px; max-width: 120px; }
    .session-bar-fill { height: 100%; border-radius: 3px; background: var(--ac-primary); transition: width 0.3s; }
    .sort-btn {
      font-size: 11px; padding: 3px 8px; border-radius: var(--ac-radius-full);
      border: 1px solid var(--ac-border); background: var(--ac-bg-surface); cursor: pointer;
      color: var(--ac-text-secondary); transition: all 0.15s;
    }
    .sort-btn.active { background: var(--ac-primary); color: #fff; border-color: var(--ac-primary); }

    /* Top models/providers */
    .insights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 700px) { .insights-grid { grid-template-columns: 1fr; } }
    .insight-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12px; }
    .insight-rank { width: 18px; height: 18px; border-radius: 50%; background: var(--ac-bg-hover); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--ac-text-muted); flex-shrink: 0; }
    .insight-name { flex: 1; font-weight: 500; color: var(--ac-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .insight-val { color: var(--ac-text-secondary); font-variant-numeric: tabular-nums; }

    /* Table (by-day) */
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; font-weight: 600; color: var(--ac-text-secondary); padding: 8px 10px; border-bottom: 1px solid var(--ac-border); text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid var(--ac-border-subtle); font-size: 12px; font-variant-numeric: tabular-nums; }
    tr:last-child td { border-bottom: none; }

    @media (max-width: 700px) { .summary-cards { grid-template-columns: 1fr; } }

    /* Billing cycle & quota */
    .billing-cycle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ac-text-secondary); margin-left: 12px; }
    .billing-cycle select { padding: 2px 6px; border: 1px solid var(--ac-border); border-radius: 6px; background: var(--ac-card-bg); color: var(--ac-text); font-size: 13px; cursor: pointer; }
    .quota-bar-wrap { margin: 16px 0 8px; }
    .quota-bar-bg { height: 14px; border-radius: 7px; background: var(--ac-bg-hover, #f0f0f0); overflow: hidden; }
    .quota-bar-fill { height: 100%; border-radius: 7px; background: var(--ac-primary); transition: width 0.4s ease; }
    .quota-bar-fill.warning { background: #f59e0b; }
    .quota-bar-fill.danger { background: #ef4444; }
    .quota-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--ac-text-secondary); margin-top: 4px; }
    .provider-quota-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .provider-quota-row .pq-label { min-width: 140px; font-size: 13px; }
    .provider-quota-row .pq-bar { flex: 1; }
    .provider-quota-row .pq-count { min-width: 80px; text-align: right; font-size: 13px; font-weight: 600; }
    .quota-edit-input { width: 70px; padding: 2px 6px; border: 1px solid var(--ac-primary); border-radius: 4px; font-size: 13px; font-weight: 600; text-align: right; background: var(--ac-card-bg); color: var(--ac-text); }
    .quota-limit-btn { cursor: pointer; border-bottom: 1px dashed var(--ac-text-secondary); }
  `;

  private _unsubGateway?: () => void;

  override connectedCallback() {
    super.connectedCallback();
    // Initialize dates
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    this._endDate = fmtDate(now);
    this._startDate = fmtDate(weekAgo);

    try {
      const raw = localStorage.getItem(TOKEN_RESET_KEY);
      if (raw) this._tokenResetOffset = JSON.parse(raw);
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(QUOTA_RESET_KEY);
      if (raw) this._quotaResetOffset = JSON.parse(raw);
    } catch { /* ignore */ }
    this._loadUsage();

    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.state === "connected") {
        this._loadUsage();
      }
    };
    gateway.addEventListener("state-change", handler);
    this._unsubGateway = () => gateway.removeEventListener("state-change", handler);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubGateway?.();
  }

  private _getDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const today = fmtDate(now);
    switch (this._period) {
      case "today": return { startDate: today, endDate: today };
      case "week": {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        return { startDate: fmtDate(d), endDate: today };
      }
      case "month": {
        const d = new Date(now); d.setDate(d.getDate() - 30);
        return { startDate: fmtDate(d), endDate: today };
      }
      case "custom": return { startDate: this._startDate, endDate: this._endDate };
    }
  }

  private async _loadUsage() {
    const { startDate, endDate } = this._getDateRange();
    const monthStart = billingCycleStart(this._billingDay);
    const today = fmtDate(new Date());

    const [costRes, sessionsRes, monthlyRes] = await Promise.all([
      gateway.call<CostUsageSummary>("usage.cost", { startDate, endDate }).catch(() => null),
      gateway.call<SessionsUsageResult>("sessions.usage", {
        startDate, endDate, limit: 1000, includeContextWeight: true,
      }).catch(() => null),
      gateway.call<SessionsUsageResult>("sessions.usage", {
        startDate: monthStart, endDate: today, limit: 200,
      }).catch(() => null),
    ]);

    if (costRes) {
      const daily = costRes.daily ?? [];
      this._daily = daily;
      const totals = costRes.totals;
      if (totals) {
        this._totalCost = totals.totalCost;
        this._totalTokens = totals.totalTokens;
        this._totalInput = totals.input;
        this._totalOutput = totals.output;
        this._totalCacheRead = totals.cacheRead;
        this._totalCacheWrite = totals.cacheWrite;
      } else {
        this._totalCost = daily.reduce((s, d) => s + d.totalCost, 0);
        this._totalTokens = daily.reduce((s, d) => s + d.input + d.output, 0);
        this._totalInput = daily.reduce((s, d) => s + d.input, 0);
        this._totalOutput = daily.reduce((s, d) => s + d.output, 0);
        this._totalCacheRead = daily.reduce((s, d) => s + (d.cacheRead ?? 0), 0);
        this._totalCacheWrite = daily.reduce((s, d) => s + (d.cacheWrite ?? 0), 0);
      }
    }

    if (sessionsRes) {
      this._sessions = sessionsRes.sessions ?? [];
      const agg = sessionsRes.aggregates;
      if (agg) {
        const tools = agg.tools;
        this._toolUsage = tools?.tools ?? [];
        this._totalToolCalls = tools?.totalCalls ?? 0;
        const msgs = agg.messages;
        this._totalMessages = msgs?.total ?? 0;
        this._userMessages = msgs?.user ?? 0;
        this._assistantMessages = msgs?.assistant ?? 0;
        this._totalErrors = msgs?.errors ?? 0;
        this._topModels = (agg.models ?? []).slice(0, 8);
        this._topProviders = (agg.providers ?? []).slice(0, 8);
        this._sessionDaily = (agg.daily ?? []).map((d) => ({
          date: d.date, messages: d.messages, toolCalls: d.toolCalls, errors: d.errors,
        }));
      }
    }

    if (monthlyRes?.aggregates?.tools) {
      const tools = monthlyRes.aggregates.tools.tools ?? [];
      this._monthlyToolBreakdown = tools.filter((t) => SEARCH_TOOLS.has(t.name));
      this._monthlySearchCalls = this._monthlyToolBreakdown.reduce((sum, t) => sum + t.count, 0);
    }
  }

  private _switchPeriod(p: "today" | "week" | "month" | "custom") {
    this._period = p;
    if (p !== "custom") this._loadUsage();
  }

  private _onDateChange() {
    if (this._startDate && this._endDate) {
      this._period = "custom";
      this._loadUsage();
    }
  }

  private _exportCSV() {
    const lines = ["Date,Input,Output,Cache Read,Cache Write,Cost"];
    for (const d of this._daily) {
      lines.push(`${d.date},${d.input},${d.output},${d.cacheRead ?? 0},${d.cacheWrite ?? 0},${d.totalCost}`);
    }
    lines.push("");
    lines.push("Session,Model,Provider,Tokens,Cost,Messages,Tool Calls,Errors");
    for (const s of this._sessions) {
      const u = s.usage;
      lines.push(`"${(s.label ?? s.key).replace(/"/g, '""')}",${s.model ?? ""},${s.modelProvider ?? ""},${u?.totalTokens ?? 0},${u?.totalCost ?? 0},${u?.messageCounts?.total ?? 0},${u?.toolUsage?.totalCalls ?? 0},${u?.messageCounts?.errors ?? 0}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acaclaw-usage-${this._startDate}-to-${this._endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _exportJSON() {
    const data = {
      range: this._getDateRange(),
      totals: { tokens: this._totalTokens, cost: this._totalCost, input: this._totalInput, output: this._totalOutput, cacheRead: this._totalCacheRead, cacheWrite: this._totalCacheWrite },
      daily: this._daily,
      sessions: this._sessions,
      aggregates: { messages: this._totalMessages, user: this._userMessages, assistant: this._assistantMessages, errors: this._totalErrors, toolCalls: this._totalToolCalls, tools: this._toolUsage },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acaclaw-usage-${this._startDate}-to-${this._endDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  override render() {
    const tOff = this._tokenResetOffset;
    const adjTokens = Math.max(0, this._totalTokens - (tOff?.tokens ?? 0));
    const adjCost = Math.max(0, this._totalCost - (tOff?.cost ?? 0));
    const adjInput = Math.max(0, this._totalInput - (tOff?.input ?? 0));
    const adjOutput = Math.max(0, this._totalOutput - (tOff?.output ?? 0));
    const adjMessages = Math.max(0, this._totalMessages - (tOff?.messages ?? 0));
    const adjToolCalls = Math.max(0, this._totalToolCalls - (tOff?.toolCalls ?? 0));
    const qOff = this._quotaResetOffset;
    const adjSearchCalls = Math.max(0, this._monthlySearchCalls - (qOff?.total ?? 0));

    return html`
      <h1>${t("usage.title")}</h1>

      <!-- Controls -->
      <div class="controls">
        ${(["today", "week", "month"] as const).map((p) => html`
          <button class="period-btn ${this._period === p ? "active" : ""}" @click=${() => this._switchPeriod(p)}>
            ${p === "today" ? "Today" : p === "week" ? t("usage.week") : t("usage.month")}
          </button>
        `)}
        <input type="date" class="date-input" .value=${this._startDate}
          @change=${(e: Event) => { this._startDate = (e.target as HTMLInputElement).value; this._onDateChange(); }} />
        <span class="date-sep">to</span>
        <input type="date" class="date-input" .value=${this._endDate}
          @change=${(e: Event) => { this._endDate = (e.target as HTMLInputElement).value; this._onDateChange(); }} />

        <div class="mode-toggle">
          <button class="${this._chartMode === "tokens" ? "active" : ""}" @click=${() => { this._chartMode = "tokens"; }}>Tokens</button>
          <button class="${this._chartMode === "cost" ? "active" : ""}" @click=${() => { this._chartMode = "cost"; }}>Cost</button>
        </div>

        ${tOff ? html`
          <span class="reset-info">
            ${t("usage.since", new Date(tOff.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}
            <button class="clear-reset-btn" @click=${this._clearTokenReset}>${t("usage.clear")}</button>
          </span>
        ` : ""}
        <button class="reset-btn" @click=${this._resetTokens}>${t("usage.resetTokens")}</button>
        <button class="export-btn" @click=${this._exportCSV}>CSV</button>
        <button class="export-btn" @click=${this._exportJSON}>JSON</button>
      </div>

      <!-- Summary cards -->
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-label">${t("usage.totalTokens")}</div>
          <div class="summary-value">${this._fmt(adjTokens)}</div>
          <div class="summary-sub">In: ${this._fmt(adjInput)} / Out: ${this._fmt(adjOutput)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">${t("usage.totalCost")}</div>
          <div class="summary-value">$${adjCost.toFixed(2)}</div>
          <div class="summary-sub">${adjMessages > 0 ? `$${(adjCost / adjMessages).toFixed(4)}/msg` : ""}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Messages</div>
          <div class="summary-value">${adjMessages}</div>
          <div class="summary-sub">${this._userMessages} user / ${this._assistantMessages} assistant</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Tool Calls</div>
          <div class="summary-value">${adjToolCalls}</div>
          <div class="summary-sub">${this._toolUsage.length} unique tools</div>
        </div>
        ${this._totalCacheRead > 0 || this._totalCacheWrite > 0 ? html`
          <div class="summary-card">
            <div class="summary-label">Cache</div>
            <div class="summary-value">${this._fmt(this._totalCacheRead)}</div>
            <div class="summary-sub">Read: ${this._fmt(this._totalCacheRead)} / Write: ${this._fmt(this._totalCacheWrite)}</div>
          </div>
        ` : ""}
        ${this._totalErrors > 0 ? html`
          <div class="summary-card">
            <div class="summary-label">Errors</div>
            <div class="summary-value" style="color: var(--ac-error, #ef4444)">${this._totalErrors}</div>
            <div class="summary-sub">${adjMessages > 0 ? `${((this._totalErrors / adjMessages) * 100).toFixed(1)}% error rate` : ""}</div>
          </div>
        ` : ""}
        ${adjMessages > 0 && adjTokens > 0 ? html`
          <div class="summary-card">
            <div class="summary-label">Avg Tokens/Msg</div>
            <div class="summary-value">${this._fmt(Math.round(adjTokens / adjMessages))}</div>
          </div>
        ` : ""}
      </div>

      <!-- Token type breakdown -->
      ${this._renderBreakdown(adjInput, adjOutput, this._totalCacheRead, this._totalCacheWrite)}

      <!-- Daily chart -->
      ${this._renderDailyChart()}

      <!-- Top Models & Providers -->
      ${this._topModels.length > 0 || this._topProviders.length > 0 ? html`
        <div class="insights-grid">
          ${this._topModels.length > 0 ? html`
            <div class="card">
              <h2>Top Models</h2>
              ${this._topModels.map((m, i) => html`
                <div class="insight-item">
                  <span class="insight-rank">${i + 1}</span>
                  <span class="insight-name">${m.model}${m.provider ? ` · ${m.provider}` : ""}</span>
                  <span class="insight-val">${this._chartMode === "cost" ? `$${m.cost.toFixed(3)}` : this._fmt(m.tokens)}</span>
                </div>
              `)}
            </div>
          ` : ""}
          ${this._topProviders.length > 0 ? html`
            <div class="card">
              <h2>Top Providers</h2>
              ${this._topProviders.map((p, i) => html`
                <div class="insight-item">
                  <span class="insight-rank">${i + 1}</span>
                  <span class="insight-name">${p.provider}</span>
                  <span class="insight-val">${this._chartMode === "cost" ? `$${p.cost.toFixed(3)}` : this._fmt(p.tokens)}</span>
                </div>
              `)}
            </div>
          ` : ""}
        </div>
      ` : ""}

      <!-- Sessions -->
      ${this._sessions.length > 0 ? this._renderSessions() : ""}

      <!-- By-day table -->
      ${this._renderDayTable()}

      <!-- Search quota -->
      ${this._renderQuotaSection(adjSearchCalls, qOff)}

      <!-- Tool usage -->
      ${this._renderToolUsage()}
    `;
  }

  private _renderBreakdown(input: number, output: number, cacheRead: number, cacheWrite: number) {
    const total = input + output + cacheRead + cacheWrite;
    if (total === 0) return nothing;
    const pctI = (input / total) * 100;
    const pctO = (output / total) * 100;
    const pctCR = (cacheRead / total) * 100;
    const pctCW = (cacheWrite / total) * 100;

    return html`
      <div class="card">
        <h2>Token Breakdown</h2>
        <div class="breakdown-bar">
          <div class="breakdown-seg" style="width:${pctI}%;background:var(--ac-primary)"></div>
          <div class="breakdown-seg" style="width:${pctO}%;background:var(--ac-primary-light,#a78bfa)"></div>
          <div class="breakdown-seg" style="width:${pctCR}%;background:#22d3ee"></div>
          <div class="breakdown-seg" style="width:${pctCW}%;background:#f59e0b"></div>
        </div>
        <div class="breakdown-labels">
          <span class="breakdown-label"><span class="breakdown-dot" style="background:var(--ac-primary)"></span>Input ${pctI.toFixed(1)}% (${this._fmt(input)})</span>
          <span class="breakdown-label"><span class="breakdown-dot" style="background:var(--ac-primary-light,#a78bfa)"></span>Output ${pctO.toFixed(1)}% (${this._fmt(output)})</span>
          ${cacheRead > 0 ? html`<span class="breakdown-label"><span class="breakdown-dot" style="background:#22d3ee"></span>Cache Read ${pctCR.toFixed(1)}% (${this._fmt(cacheRead)})</span>` : ""}
          ${cacheWrite > 0 ? html`<span class="breakdown-label"><span class="breakdown-dot" style="background:#f59e0b"></span>Cache Write ${pctCW.toFixed(1)}% (${this._fmt(cacheWrite)})</span>` : ""}
        </div>
      </div>
    `;
  }

  private _renderDailyChart() {
    if (this._daily.length === 0 && this._sessionDaily.length === 0) {
      return html`<div class="card"><h2>${t("usage.dailyUsage")}</h2><p style="color:var(--ac-text-muted);font-size:13px">${t("usage.noUsage")}</p></div>`;
    }

    if (this._daily.length > 0) {
      const isCost = this._chartMode === "cost";
      const byType = this._dailyChartMode === "by-type";
      const maxVal = Math.max(1, ...this._daily.map((d) =>
        isCost ? d.totalCost : (byType ? d.input + d.output + (d.cacheRead ?? 0) + (d.cacheWrite ?? 0) : d.input + d.output)
      ));

      return html`
        <div class="card">
          <div class="card-header">
            <h2>${t("usage.dailyUsage")}</h2>
            <div class="mode-toggle">
              <button class="${this._dailyChartMode === "total" ? "active" : ""}" @click=${() => { this._dailyChartMode = "total"; }}>Total</button>
              <button class="${this._dailyChartMode === "by-type" ? "active" : ""}" @click=${() => { this._dailyChartMode = "by-type"; }}>By Type</button>
            </div>
          </div>
          <div class="chart">
            ${this._daily.map((d) => {
              if (isCost) {
                const h = Math.max((d.totalCost / maxVal) * 120, 1);
                return html`<div class="bar-group"><div class="bar-stack"><div class="bar cost-bar" style="height:${h}px" title="$${d.totalCost.toFixed(4)}"></div></div><span class="bar-label">${d.date.slice(5)}</span></div>`;
              }
              if (byType) {
                const cr = d.cacheRead ?? 0;
                const cw = d.cacheWrite ?? 0;
                return html`<div class="bar-group"><div class="bar-stack">
                  <div class="bar cache-write" style="height:${Math.max((cw / maxVal) * 120, 0)}px" title="Cache Write: ${cw}"></div>
                  <div class="bar cache-read" style="height:${Math.max((cr / maxVal) * 120, 0)}px" title="Cache Read: ${cr}"></div>
                  <div class="bar output" style="height:${Math.max((d.output / maxVal) * 120, 1)}px" title="Output: ${d.output}"></div>
                  <div class="bar input" style="height:${Math.max((d.input / maxVal) * 120, 1)}px" title="Input: ${d.input}"></div>
                </div><span class="bar-label">${d.date.slice(5)}</span></div>`;
              }
              const inH = Math.max((d.input / maxVal) * 120, 1);
              const outH = Math.max((d.output / maxVal) * 120, 1);
              return html`<div class="bar-group"><div class="bar-stack"><div class="bar output" style="height:${outH}px" title="Output: ${d.output}"></div><div class="bar input" style="height:${inH}px" title="Input: ${d.input}"></div></div><span class="bar-label">${d.date.slice(5)}</span></div>`;
            })}
          </div>
          <div class="legend">
            ${isCost ? html`<div class="legend-item"><div class="legend-dot" style="background:var(--ac-primary)"></div>Cost</div>` : html`
              <div class="legend-item"><div class="legend-dot" style="background:var(--ac-primary)"></div>${t("usage.input")}</div>
              <div class="legend-item"><div class="legend-dot" style="background:var(--ac-primary-light,#a78bfa)"></div>${t("usage.output")}</div>
              ${byType ? html`
                <div class="legend-item"><div class="legend-dot" style="background:#22d3ee"></div>Cache Read</div>
                <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>Cache Write</div>
              ` : ""}
            `}
          </div>
        </div>
      `;
    }

    // Fallback: session daily (messages chart)
    const maxMsg = Math.max(1, ...this._sessionDaily.map((d) => d.messages));
    return html`
      <div class="card">
        <h2>${t("usage.dailyUsage")}</h2>
        <div class="chart">
          ${this._sessionDaily.map((d) => {
            const h = Math.max((d.messages / maxMsg) * 120, 1);
            return html`<div class="bar-group"><div class="bar-stack"><div class="bar input" style="height:${h}px" title="Messages: ${d.messages}"></div></div><span class="bar-label">${d.date.slice(5)}</span></div>`;
          })}
        </div>
        <div class="legend"><div class="legend-item"><div class="legend-dot" style="background:var(--ac-primary)"></div>${t("usage.messages")}</div></div>
      </div>
    `;
  }

  private _sessionVal(s: SessionUsageEntry, field: "cost" | "tokens" | "messages"): number {
    const u = s.usage;
    if (!u) return 0;
    switch (field) {
      case "cost": return u.totalCost ?? 0;
      case "tokens": return u.totalTokens ?? 0;
      case "messages": return u.messageCounts?.total ?? 0;
    }
  }

  private _renderSessions() {
    const sorted = [...this._sessions].sort((a, b) => {
      switch (this._sessionSort) {
        case "cost": return this._sessionVal(b, "cost") - this._sessionVal(a, "cost");
        case "tokens": return this._sessionVal(b, "tokens") - this._sessionVal(a, "tokens");
        case "messages": return this._sessionVal(b, "messages") - this._sessionVal(a, "messages");
        case "recent": return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      }
    }).slice(0, 50);

    const sortField = this._sessionSort === "cost" ? "cost" as const : "tokens" as const;
    const maxVal = Math.max(1, ...sorted.map((s) => this._sessionVal(s, sortField)));

    return html`
      <div class="card">
        <div class="card-header">
          <h2>Sessions (${this._sessions.length})</h2>
          ${(["tokens", "cost", "messages", "recent"] as const).map((s) => html`
            <button class="sort-btn ${this._sessionSort === s ? "active" : ""}" @click=${() => { this._sessionSort = s; }}>${s}</button>
          `)}
        </div>
        <div class="session-list">
          ${sorted.map((s) => {
            const u = s.usage;
            const val = this._sessionVal(s, sortField);
            const pct = (val / maxVal) * 100;
            const msgs = u?.messageCounts?.total ?? 0;
            return html`
              <div class="session-row">
                <span class="session-label">${s.label ?? s.key}</span>
                <span class="session-model">${s.model ?? ""}${s.modelProvider ? ` · ${s.modelProvider}` : ""}</span>
                <span class="session-stat">${msgs} msgs</span>
                <div class="session-bar-bg"><div class="session-bar-fill" style="width:${pct}%"></div></div>
                <span class="session-stat">${this._sessionSort === "cost" ? `$${(u?.totalCost ?? 0).toFixed(3)}` : this._fmt(u?.totalTokens ?? 0)}</span>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private _renderDayTable() {
    if (this._daily.length === 0 && this._sessionDaily.length === 0) return nothing;

    if (this._daily.length > 0) {
      return html`
        <div class="card">
          <h2>${t("usage.byDay")}</h2>
          <table>
            <thead><tr><th>Date</th><th>Input</th><th>Output</th><th>Cache R</th><th>Cache W</th><th>Cost</th></tr></thead>
            <tbody>
              ${this._daily.map((d) => html`<tr><td>${d.date}</td><td>${this._fmt(d.input)}</td><td>${this._fmt(d.output)}</td><td>${this._fmt(d.cacheRead ?? 0)}</td><td>${this._fmt(d.cacheWrite ?? 0)}</td><td>$${d.totalCost.toFixed(4)}</td></tr>`)}
            </tbody>
          </table>
        </div>
      `;
    }

    return html`
      <div class="card">
        <h2>${t("usage.byDay")}</h2>
        <table>
          <thead><tr><th>Date</th><th>Messages</th><th>Tools</th><th>Errors</th></tr></thead>
          <tbody>
            ${this._sessionDaily.map((d) => html`<tr><td>${d.date}</td><td>${d.messages}</td><td>${d.toolCalls}</td><td>${d.errors}</td></tr>`)}
          </tbody>
        </table>
      </div>
    `;
  }

  private _renderQuotaSection(adjSearchCalls: number, qOff: QuotaResetOffset | null) {
    return html`
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h2 style="margin:0">${t("usage.searchQuota")}</h2>
          ${qOff ? html`
            <span class="reset-info" style="margin-left:auto">
              ${t("usage.since", new Date(qOff.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}
              <button class="clear-reset-btn" @click=${this._clearQuotaReset}>${t("usage.clear")}</button>
            </span>
          ` : ""}
          <button class="reset-btn" style="${qOff ? "" : "margin-left:auto"}" @click=${this._resetQuota}>${t("usage.resetQuota")}</button>
        </div>
        <p style="font-size:13px;color:var(--ac-text-secondary);margin-bottom:8px">
          ${t("usage.monthlyWeb")}
          <span class="billing-cycle">
            ${t("usage.resetsOnDay")}
            <select .value=${String(this._billingDay)} @change=${(e: Event) => this._setBillingDay(Number((e.target as HTMLSelectElement).value))}>
              ${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => html`<option value=${d} ?selected=${d === this._billingDay}>${d}</option>`)}
            </select>
            ${t("usage.ofEachMonth")}
          </span>
        </p>
        <div class="summary-cards" style="margin-bottom:12px">
          <div class="summary-card"><div class="summary-label">${t("usage.totalSearchCalls")}</div><div class="summary-value">${adjSearchCalls}</div></div>
          <div class="summary-card"><div class="summary-label">${t("usage.combinedQuota")}</div><div class="summary-value">${this._totalQuota() || "\u221e"}</div></div>
          <div class="summary-card"><div class="summary-label">${t("usage.remaining")}</div><div class="summary-value">${this._totalQuota() ? Math.max(0, this._totalQuota() - adjSearchCalls) : "\u221e"}</div></div>
        </div>
        ${this._renderProviderQuotas()}
      </div>
    `;
  }

  private _renderToolUsage() {
    return html`
      <div class="card">
        <h2>${t("usage.toolUsage")}</h2>
        ${this._toolUsage.length === 0
          ? html`<p style="color:var(--ac-text-muted);font-size:13px">${t("usage.noToolUsage")}</p>`
          : html`
            <table>
              <thead><tr><th>Tool</th><th>Calls</th></tr></thead>
              <tbody>${this._toolUsage.map((tu) => html`<tr><td>${this._toolLabel(tu.name)}</td><td>${tu.count}</td></tr>`)}</tbody>
            </table>
          `}
      </div>
    `;
  }

  // --- Actions ---

  private _setBillingDay(day: number) {
    this._billingDay = day;
    localStorage.setItem("acaclaw-billing-day", String(day));
    this._loadUsage();
  }

  private _resetTokens() {
    const offset: TokenResetOffset = {
      date: new Date().toISOString(), tokens: this._totalTokens, cost: this._totalCost,
      input: this._totalInput, output: this._totalOutput, messages: this._totalMessages, toolCalls: this._totalToolCalls,
    };
    localStorage.setItem(TOKEN_RESET_KEY, JSON.stringify(offset));
    this._tokenResetOffset = offset;
  }

  private _clearTokenReset() { localStorage.removeItem(TOKEN_RESET_KEY); this._tokenResetOffset = null; }

  private _resetQuota() {
    const toolOffsets: Record<string, number> = {};
    for (const t of this._monthlyToolBreakdown) toolOffsets[t.name] = t.count;
    const offset: QuotaResetOffset = { date: new Date().toISOString(), total: this._monthlySearchCalls, tools: toolOffsets };
    localStorage.setItem(QUOTA_RESET_KEY, JSON.stringify(offset));
    this._quotaResetOffset = offset;
  }

  private _clearQuotaReset() { localStorage.removeItem(QUOTA_RESET_KEY); this._quotaResetOffset = null; }

  private _totalQuota(): number {
    let total = 0;
    for (const tool of SEARCH_TOOLS) total += this._quotas[tool]?.limit ?? 0;
    return total;
  }

  private _setQuota(tool: string, limit: number) {
    this._quotas = { ...this._quotas, [tool]: { limit: Math.max(0, limit) } };
    saveQuotas(this._quotas);
    this._editingQuotaTool = null;
  }

  private _renderProviderQuotas() {
    const tools = [...SEARCH_TOOLS];
    const qOff = this._quotaResetOffset;
    return html`${tools.map((tool) => {
      const usage = this._monthlyToolBreakdown.find((t) => t.name === tool);
      const rawCount = usage?.count ?? 0;
      const count = Math.max(0, rawCount - (qOff?.tools[tool] ?? 0));
      const quota = this._quotas[tool]?.limit ?? 0;
      const pct = quota > 0 ? Math.min(100, (count / quota) * 100) : 0;
      const barClass = quota > 0 && count / quota > 0.9 ? "danger" : quota > 0 && count / quota > 0.7 ? "warning" : "";
      return html`
        <div class="provider-quota-row">
          <div class="pq-label">${this._toolLabel(tool)}</div>
          <div class="pq-bar">${quota > 0
            ? html`<div class="quota-bar-bg"><div class="quota-bar-fill ${barClass}" style="width:${pct}%"></div></div>`
            : html`<span style="font-size:12px;color:var(--ac-text-muted)">${t("usage.noLimit")}</span>`}</div>
          <div class="pq-count">${count} / ${this._editingQuotaTool === tool
            ? html`<input class="quota-edit-input" type="number" min="0" .value=${String(quota)}
                @blur=${(e: Event) => this._setQuota(tool, Number((e.target as HTMLInputElement).value))}
                @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._setQuota(tool, Number((e.target as HTMLInputElement).value)); if (e.key === "Escape") this._editingQuotaTool = null; }} />`
            : html`<span class="quota-limit-btn" title="Click to edit" @click=${() => { this._editingQuotaTool = tool; }}>${quota || "\u221e"}</span>`}</div>
        </div>
      `;
    })}`;
  }

  // --- Helpers ---

  private _toolLabel(name: string): string {
    const map: Record<string, string> = {
      web_search: "Web Search (Brave)", web_fetch: "Web Fetch", browser: "Browser",
      bash: "Terminal", file_read: "Read File", file_write: "Write File", file_edit: "Edit File",
    };
    return map[name] ?? name.replace(/_/g, " ");
  }

  private _fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }
}
