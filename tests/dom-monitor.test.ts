/**
 * DOM component tests for MonitorView.
 * Verifies health card, system resources, and workspace panels.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockOnNotification = vi.fn((_event: string, _handler: (data: unknown) => void) => vi.fn());

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: mockCall,
    state: "connected" as const,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    onNotification: mockOnNotification,
  },
}));

const { MonitorView } = await import("../ui/src/views/monitor.js");

type MV = InstanceType<typeof MonitorView>;

const MOCK_USAGE = {
  daily: [{ date: new Date().toISOString().slice(0, 10), input: 5000, output: 3000, totalCost: 0.012 }],
  totals: { totalCost: 0.012, totalTokens: 8000 },
};

const MOCK_SYSTEM_STATS = {
  cpu: { cores: 8, model: "Intel i7-10700", usagePercent: 35, loadAvg: [2.1, 1.8, 1.5] },
  memory: { total: 32e9, used: 24e9, free: 8e9, usagePercent: 75 },
  disk: { total: 500e9, used: 350e9, free: 150e9, usagePercent: 70 },
  gpu: { type: "intel", name: "UHD Graphics 630", usagePercent: 42, freqMhz: 900, maxFreqMhz: 1200 },
  system: { hostname: "testhost", uptime: 86400, platform: "Linux" },
};

const MOCK_SYSTEM_STATS_NO_GPU = {
  ...MOCK_SYSTEM_STATS,
  gpu: null,
};

const MOCK_SYSTEM_STATS_NVIDIA = {
  ...MOCK_SYSTEM_STATS,
  gpu: { type: "nvidia", name: "RTX 4090", usagePercent: 60, memTotal: 24e9, memUsed: 12e9, memFree: 12e9, memPercent: 50, temperature: 65, driver: "550.120" },
};

const MOCK_ENVS = {
  environments: [
    { name: "aca", active: true, installed: true },
    { name: "bio", active: false, installed: true },
    { name: "data", active: false, installed: false },
  ],
};

const MOCK_SESSIONS_USAGE = {
  aggregates: {
    messages: { total: 120, user: 50, assistant: 60, toolCalls: 45, toolResults: 40, errors: 2 },
    tools: { totalCalls: 45, uniqueTools: 4, tools: [
      { name: "browser", calls: 20, errors: 0 },
      { name: "web_search", calls: 12, errors: 1 },
      { name: "read", calls: 8, errors: 0 },
      { name: "exec", calls: 5, errors: 1 },
    ] },
    daily: [
      { date: "2026-03-18", messages: 10, toolCalls: 5, errors: 0 },
      { date: "2026-03-19", messages: 25, toolCalls: 12, errors: 1 },
      { date: "2026-03-20", messages: 15, toolCalls: 8, errors: 0 },
    ],
  },
};

const MOCK_PROJECTS = {
  projects: [{ name: "DRG" }, { name: "OpenClaw" }],
  activeProject: "DRG",
};

const MOCK_SESSIONS_LIST = {
  ts: 1774346227391,
  count: 2,
  sessions: [
    {
      key: "agent:main:main",
      updatedAt: Date.now() - 3_600_000,
      model: "kimi-k2.5",
      totalTokens: 10636,
      lastChannel: "webchat",
    },
    {
      key: "agent:biologist:web:abc",
      updatedAt: Date.now() - 86_400_000,
      model: "gpt-4o",
      totalTokens: 25000,
      lastChannel: "webchat",
    },
  ],
};

async function createElement(opts?: { healthy?: boolean; noStats?: boolean; noGpu?: boolean; nvidia?: boolean; noActivity?: boolean; noProjects?: boolean; noSessions?: boolean }): Promise<MV> {
  const healthy = opts?.healthy ?? true;
  const noStats = opts?.noStats ?? false;
  const noGpu = opts?.noGpu ?? false;
  const nvidia = opts?.nvidia ?? false;
  const noActivity = opts?.noActivity ?? false;
  const noProjects = opts?.noProjects ?? false;
  const noSessions = opts?.noSessions ?? false;

  mockCall.mockImplementation(async (method: string) => {
    if (method === "health") {
      if (!healthy) throw new Error("offline");
      return { status: "ok" };
    }
    if (method === "usage.cost") return MOCK_USAGE;
    if (method === "acaclaw.system.stats") {
      if (noStats) throw new Error("unknown method");
      if (noGpu) return MOCK_SYSTEM_STATS_NO_GPU;
      if (nvidia) return MOCK_SYSTEM_STATS_NVIDIA;
      return MOCK_SYSTEM_STATS;
    }
    if (method === "acaclaw.env.list") return MOCK_ENVS;
    if (method === "skills.status") return { skills: [{ name: "a" }, { name: "b" }, { name: "c" }] };
    if (method === "acaclaw.backup.snapshotList") return { snapshots: [{ sizeBytes: 1024 }] };
    if (method === "sessions.usage") {
      if (noActivity) throw new Error("no sessions");
      return MOCK_SESSIONS_USAGE;
    }
    if (method === "acaclaw.project.list") {
      if (noProjects) throw new Error("no projects");
      return MOCK_PROJECTS;
    }
    if (method === "sessions.list") {
      if (noSessions) throw new Error("no sessions");
      return MOCK_SESSIONS_LIST;
    }
    return undefined;
  });

  const el = document.createElement("acaclaw-monitor") as MV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: MV) {
  document.body.removeChild(el);
}

function q(el: MV, selector: string) {
  return el.shadowRoot!.querySelector(selector);
}
function qa(el: MV, selector: string) {
  return el.shadowRoot!.querySelectorAll(selector);
}

describe("MonitorView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockAddEventListener.mockReset();
    mockRemoveEventListener.mockReset();
    mockOnNotification.mockReset();
    mockOnNotification.mockReturnValue(vi.fn());
  });

  // ── Health Card ──

  it("renders heading", async () => {
    const el = await createElement();
    expect(q(el, "h1")?.textContent).toBe("Monitor");
    cleanup(el);
  });

  it("shows Stable badge when healthy", async () => {
    const el = await createElement({ healthy: true });
    const badge = q(el, ".badge-stable");
    expect(badge?.textContent).toBe("Stable");
    cleanup(el);
  });

  it("shows Degraded badge when offline", async () => {
    const el = await createElement({ healthy: false });
    const badge = q(el, ".badge-degraded");
    expect(badge?.textContent).toBe("Degraded");
    cleanup(el);
  });

  it("shows health score 100 when healthy", async () => {
    const el = await createElement({ healthy: true });
    const num = q(el, ".health-circle .num");
    expect(num?.textContent).toBe("100");
    cleanup(el);
  });

  it("shows health score 0 when offline", async () => {
    const el = await createElement({ healthy: false });
    const num = q(el, ".health-circle .num");
    expect(num?.textContent).toBe("0");
    cleanup(el);
  });

  it("displays token and cost in health info", async () => {
    const el = await createElement({ healthy: true });
    const p = q(el, ".health-info p");
    expect(p?.textContent).toContain("8.0K");
    expect(p?.textContent).toContain("$0.0120");
    cleanup(el);
  });

  it("shows Refresh button", async () => {
    const el = await createElement();
    const btn = q(el, ".btn-outline");
    expect(btn).toBeTruthy();
    expect(btn?.textContent?.trim()).toBe("Refresh");
    cleanup(el);
  });

  it("calls gateway on Refresh click", async () => {
    const el = await createElement();
    mockCall.mockClear();
    const btn = q(el, ".btn-outline") as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCall).toHaveBeenCalledWith("health");
    cleanup(el);
  });

  // ── System Resources ──

  it("renders System Resources card title", async () => {
    const el = await createElement();
    const titles = qa(el, ".card-title");
    const resTitle = Array.from(titles).find((t) => t.textContent === "System Resources");
    expect(resTitle).toBeTruthy();
    cleanup(el);
  });

  it("shows CPU percentage", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const cpuItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("CPU"));
    expect(cpuItem).toBeTruthy();
    expect(cpuItem!.querySelector(".resource-value")?.textContent).toBe("35.0%");
    cleanup(el);
  });

  it("shows CPU core count and load average", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const cpuItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("CPU"));
    const sub = cpuItem!.querySelector(".resource-sub")?.textContent;
    expect(sub).toContain("8 cores");
    expect(sub).toContain("2.10");
    cleanup(el);
  });

  it("shows Memory percentage", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const memItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("Memory"));
    expect(memItem).toBeTruthy();
    expect(memItem!.querySelector(".resource-value")?.textContent).toBe("75.0%");
    cleanup(el);
  });

  it("shows Memory used / total", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const memItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("Memory"));
    const sub = memItem!.querySelector(".resource-sub")?.textContent;
    expect(sub).toContain("22.4 GB");
    expect(sub).toContain("29.8 GB");
    cleanup(el);
  });

  it("shows Disk percentage", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const diskItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("Disk"));
    expect(diskItem).toBeTruthy();
    expect(diskItem!.querySelector(".resource-value")?.textContent).toBe("70.0%");
    cleanup(el);
  });

  it("renders progress bars for each resource including GPU", async () => {
    const el = await createElement();
    const bars = qa(el, ".resource-bar-fill");
    expect(bars.length).toBe(4);
    cleanup(el);
  });

  it("applies green class to low-usage progress bar", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const cpuItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("CPU"));
    const bar = cpuItem!.querySelector(".resource-bar-fill");
    expect(bar?.classList.contains("green")).toBe(true);
    cleanup(el);
  });

  it("applies yellow class to medium-usage progress bar", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const memItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("Memory"));
    const bar = memItem!.querySelector(".resource-bar-fill");
    expect(bar?.classList.contains("yellow")).toBe(true);
    cleanup(el);
  });

  it("shows system info row with hostname", async () => {
    const el = await createElement();
    const row = q(el, ".sys-info-row");
    expect(row).toBeTruthy();
    expect(row?.textContent).toContain("testhost");
    cleanup(el);
  });

  it("shows system info row with uptime", async () => {
    const el = await createElement();
    const row = q(el, ".sys-info-row");
    expect(row?.textContent).toContain("1d 0h");
    cleanup(el);
  });

  it("shows system info row with platform", async () => {
    const el = await createElement();
    const row = q(el, ".sys-info-row");
    expect(row?.textContent).toContain("Linux");
    cleanup(el);
  });

  it("shows system info row with CPU model", async () => {
    const el = await createElement();
    const row = q(el, ".sys-info-row");
    expect(row?.textContent).toContain("Intel i7-10700");
    cleanup(el);
  });

  it("shows fallback when system stats unavailable", async () => {
    const el = await createElement({ noStats: true });
    const msg = q(el, ".resource-unavailable");
    expect(msg).toBeTruthy();
    expect(msg?.textContent).toContain("not available");
    cleanup(el);
  });

  it("hides resource grid when stats unavailable", async () => {
    const el = await createElement({ noStats: true });
    const grid = q(el, ".resource-grid");
    expect(grid).toBeNull();
    cleanup(el);
  });

  // ── GPU ──

  it("shows Intel GPU percentage and name", async () => {
    const el = await createElement();
    const items = qa(el, ".resource-item");
    const gpuItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("GPU"));
    expect(gpuItem).toBeTruthy();
    expect(gpuItem!.querySelector(".resource-value")?.textContent).toBe("42.0%");
    const sub = gpuItem!.querySelector(".resource-sub")?.textContent;
    expect(sub).toContain("UHD Graphics 630");
    expect(sub).toContain("900 / 1200 MHz");
    cleanup(el);
  });

  it("shows NVIDIA GPU with memory and temperature", async () => {
    const el = await createElement({ nvidia: true });
    const items = qa(el, ".resource-item");
    const gpuItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("GPU"));
    expect(gpuItem).toBeTruthy();
    expect(gpuItem!.querySelector(".resource-value")?.textContent).toBe("60.0%");
    const sub = gpuItem!.querySelector(".resource-sub")?.textContent;
    expect(sub).toContain("RTX 4090");
    expect(sub).toContain("65°C");
    cleanup(el);
  });

  it("hides GPU gauge when gpu is null", async () => {
    const el = await createElement({ noGpu: true });
    const items = qa(el, ".resource-item");
    const gpuItem = Array.from(items).find((i) => i.querySelector(".resource-label")?.textContent?.includes("GPU"));
    expect(gpuItem).toBeUndefined();
    cleanup(el);
  });

  it("renders 3 progress bars when no GPU", async () => {
    const el = await createElement({ noGpu: true });
    const bars = qa(el, ".resource-bar-fill");
    expect(bars.length).toBe(3);
    cleanup(el);
  });

  // ── Activity ──

  it("renders Activity card title", async () => {
    const el = await createElement();
    const titles = qa(el, ".card-title");
    const actTitle = Array.from(titles).find((t) => t.textContent === "Activity");
    expect(actTitle).toBeTruthy();
    cleanup(el);
  });

  it("shows total messages count", async () => {
    const el = await createElement();
    const stats = qa(el, ".activity-stat");
    const msgStat = Array.from(stats).find((s) => s.querySelector(".activity-stat-label")?.textContent === "Messages");
    expect(msgStat).toBeTruthy();
    expect(msgStat!.querySelector(".activity-stat-value")?.textContent).toBe("120");
    cleanup(el);
  });

  it("shows tool calls count", async () => {
    const el = await createElement();
    const stats = qa(el, ".activity-stat");
    const toolStat = Array.from(stats).find((s) => s.querySelector(".activity-stat-label")?.textContent === "Tool Calls");
    expect(toolStat).toBeTruthy();
    expect(toolStat!.querySelector(".activity-stat-value")?.textContent).toBe("45");
    cleanup(el);
  });

  it("shows error count", async () => {
    const el = await createElement();
    const stats = qa(el, ".activity-stat");
    const errStat = Array.from(stats).find((s) => s.querySelector(".activity-stat-label")?.textContent === "Errors");
    expect(errStat).toBeTruthy();
    expect(errStat!.querySelector(".activity-stat-value")?.textContent).toBe("2");
    cleanup(el);
  });

  it("shows tools used count", async () => {
    const el = await createElement();
    const stats = qa(el, ".activity-stat");
    const toolsUsed = Array.from(stats).find((s) => s.querySelector(".activity-stat-label")?.textContent === "Tools Used");
    expect(toolsUsed).toBeTruthy();
    expect(toolsUsed!.querySelector(".activity-stat-value")?.textContent).toBe("4");
    cleanup(el);
  });

  it("renders tool chips for top tools", async () => {
    const el = await createElement();
    const chips = qa(el, ".tool-chip");
    expect(chips.length).toBe(4);
    expect(chips[0]?.textContent).toContain("browser");
    cleanup(el);
  });

  it("renders daily bar chart", async () => {
    const el = await createElement();
    const barGroups = qa(el, ".daily-bar-group");
    expect(barGroups.length).toBe(3);
    cleanup(el);
  });

  it("shows empty state when no activity", async () => {
    const el = await createElement({ noActivity: true });
    const empty = q(el, ".empty-state");
    expect(empty?.textContent).toContain("No activity");
    cleanup(el);
  });

  // ── Projects ──

  it("renders Projects card title", async () => {
    const el = await createElement();
    const titles = qa(el, ".card-title");
    const projTitle = Array.from(titles).find((t) => t.textContent === "Projects");
    expect(projTitle).toBeTruthy();
    cleanup(el);
  });

  it("shows project names", async () => {
    const el = await createElement();
    const items = qa(el, ".project-item");
    expect(items.length).toBe(2);
    const names = Array.from(items).map((i) => i.querySelector(".project-name")?.textContent);
    expect(names).toContain("DRG");
    expect(names).toContain("OpenClaw");
    cleanup(el);
  });

  it("marks active project with badge", async () => {
    const el = await createElement();
    const activeItem = q(el, ".project-item.active");
    expect(activeItem).toBeTruthy();
    expect(activeItem!.querySelector(".project-name")?.textContent).toBe("DRG");
    expect(activeItem!.querySelector(".project-badge")?.textContent).toBe("Active");
    cleanup(el);
  });

  it("hides Projects card when no projects", async () => {
    const el = await createElement({ noProjects: true });
    const titles = qa(el, ".card-title");
    const projTitle = Array.from(titles).find((t) => t.textContent === "Projects");
    expect(projTitle).toBeUndefined();
    cleanup(el);
  });

  // ── Agents / Sessions ──

  it("hides Agents card when no active or recent runs and no sessions", async () => {
    const el = await createElement({ noSessions: true });
    const titles = qa(el, ".card-title");
    const agentTitle = Array.from(titles).find((t) => t.textContent === "Agents");
    expect(agentTitle).toBeUndefined();
    cleanup(el);
  });

  it("shows historical sessions from sessions.list", async () => {
    const el = await createElement();
    const titles = qa(el, ".card-title");
    const agentTitle = Array.from(titles).find((t) => t.textContent === "Agents");
    expect(agentTitle).toBeTruthy();

    const sessionItems = qa(el, ".agent-run.session-info");
    expect(sessionItems.length).toBe(2);

    // First session: main agent (1h ago)
    expect(sessionItems[0]?.querySelector(".agent-run-name")?.textContent).toBe("Aca");
    expect(sessionItems[0]?.querySelector(".session-model")?.textContent).toBe("kimi-k2.5");

    // Second session: biologist (1d ago)
    expect(sessionItems[1]?.querySelector(".agent-run-name")?.textContent).toBe("Dr. Gene");
    expect(sessionItems[1]?.querySelector(".session-model")?.textContent).toBe("gpt-4o");
    cleanup(el);
  });

  it("shows active run when chat notification received", async () => {
    const el = await createElement();
    // Get the chat notification handler that was registered
    const chatHandler = mockOnNotification.mock.calls.find(
      (c: unknown[]) => c[0] === "chat"
    )?.[1] as ((data: unknown) => void) | undefined;
    expect(chatHandler).toBeTruthy();

    // Simulate a delta notification
    chatHandler!({ runId: "run-123", sessionKey: "agent:biologist:web:abc", state: "delta" });
    await el.updateComplete;

    const titles = qa(el, ".card-title");
    const agentTitle = Array.from(titles).find((t) => t.textContent === "Agents");
    expect(agentTitle).toBeTruthy();

    const runItems = qa(el, ".agent-run.running");
    expect(runItems.length).toBe(1);
    expect(runItems[0]?.querySelector(".agent-run-name")?.textContent).toBe("Dr. Gene");
    expect(runItems[0]?.querySelector(".agent-run-status")?.textContent).toBe("Running");
    cleanup(el);
  });

  it("moves run to recent on final notification", async () => {
    const el = await createElement();
    const chatHandler = mockOnNotification.mock.calls.find(
      (c: unknown[]) => c[0] === "chat"
    )?.[1] as ((data: unknown) => void) | undefined;

    // Start a run then finish it
    chatHandler!({ runId: "run-456", sessionKey: "abc-uuid", state: "delta" });
    await el.updateComplete;
    chatHandler!({ runId: "run-456", sessionKey: "abc-uuid", state: "final" });
    await el.updateComplete;

    const running = qa(el, ".agent-run.running");
    expect(running.length).toBe(0);

    const completed = qa(el, ".agent-run.completed");
    expect(completed.length).toBe(1);
    expect(completed[0]?.querySelector(".agent-run-name")?.textContent).toBe("Aca");
    expect(completed[0]?.querySelector(".agent-run-status")?.textContent).toBe("Done");
    cleanup(el);
  });

  it("shows error status for failed runs", async () => {
    const el = await createElement();
    const chatHandler = mockOnNotification.mock.calls.find(
      (c: unknown[]) => c[0] === "chat"
    )?.[1] as ((data: unknown) => void) | undefined;

    chatHandler!({ runId: "run-err", sessionKey: "agent:ai-researcher:web:xyz", state: "delta" });
    await el.updateComplete;
    chatHandler!({ runId: "run-err", state: "error", errorMessage: "timeout" });
    await el.updateComplete;

    const errorRuns = qa(el, ".agent-run.error");
    expect(errorRuns.length).toBe(1);
    expect(errorRuns[0]?.querySelector(".agent-run-name")?.textContent).toBe("Dr. Turing");
    expect(errorRuns[0]?.querySelector(".agent-run-status")?.textContent).toBe("Error");
    cleanup(el);
  });

  it("subscribes to chat notifications on mount", async () => {
    const el = await createElement();
    expect(mockOnNotification).toHaveBeenCalledWith("chat", expect.any(Function));
    cleanup(el);
  });

  // ── Workspace ──

  it("renders Workspace card title", async () => {
    const el = await createElement();
    const titles = qa(el, ".card-title");
    const wsTitle = Array.from(titles).find((t) => t.textContent === "Workspace");
    expect(wsTitle).toBeTruthy();
    cleanup(el);
  });

  it("shows environment count", async () => {
    const el = await createElement();
    const wsItems = qa(el, ".ws-item");
    const envItem = Array.from(wsItems).find((w) => w.querySelector(".ws-info-label")?.textContent === "Environments");
    expect(envItem).toBeTruthy();
    expect(envItem!.querySelector(".ws-info-value")?.textContent).toBe("2");
    cleanup(el);
  });

  it("shows active environment name", async () => {
    const el = await createElement();
    const wsItems = qa(el, ".ws-item");
    const envItem = Array.from(wsItems).find((w) => w.querySelector(".ws-info-label")?.textContent === "Environments");
    expect(envItem!.querySelector(".ws-info-sub")?.textContent).toContain("aca");
    cleanup(el);
  });

  it("shows skills count", async () => {
    const el = await createElement();
    const wsItems = qa(el, ".ws-item");
    const skillItem = Array.from(wsItems).find((w) => w.querySelector(".ws-info-label")?.textContent === "Skills");
    expect(skillItem).toBeTruthy();
    expect(skillItem!.querySelector(".ws-info-value")?.textContent).toBe("3");
    cleanup(el);
  });

  it("shows backup count", async () => {
    const el = await createElement();
    const wsItems = qa(el, ".ws-item");
    const backupItem = Array.from(wsItems).find((w) => w.querySelector(".ws-info-label")?.textContent === "Backups");
    expect(backupItem).toBeTruthy();
    expect(backupItem!.querySelector(".ws-info-value")?.textContent).toBe("1");
    cleanup(el);
  });

  // ── API calls ──

  it("calls expected gateway methods on mount", async () => {
    const el = await createElement();
    const methods = mockCall.mock.calls.map((c: unknown[]) => c[0]);
    expect(methods).toContain("health");
    expect(methods).toContain("usage.cost");
    expect(methods).toContain("acaclaw.system.stats");
    expect(methods).toContain("acaclaw.env.list");
    expect(methods).toContain("skills.status");
    expect(methods).toContain("acaclaw.backup.snapshotList");
    expect(methods).toContain("sessions.usage");
    expect(methods).toContain("acaclaw.project.list");
    cleanup(el);
  });
});
