/**
 * DOM component tests for BackupView.
 * Verifies tabs, file list, snapshot section, and settings form.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
}));

const { BackupView } = await import("../ui/src/views/backup.js");

type BV = InstanceType<typeof BackupView>;

const MOCK_BACKUPS = [
  { time: "2026-03-25T10:00:00Z", file: "workspace/main.py", size: "4.2 KB", date: "2026-03-25" },
  { time: "2026-03-24T08:30:00Z", file: "workspace/utils.py", size: "1.1 KB", date: "2026-03-24" },
];

const MOCK_SNAPSHOTS = [
  { time: "2026-03-25T10:00:00Z", size: "15.3 MB", sizeBytes: 16054272, workspace: "~/AcaClaw" },
];

async function createElement(): Promise<BV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "acaclaw.backup.list") return {
      backups: MOCK_BACKUPS,
      totalSize: "5.3 KB",
      fileCount: 2,
      snapshotCount: 1,
      snapshotSize: "15.3 MB",
      backupDir: "~/.acaclaw/backups",
    };
    if (method === "acaclaw.backup.snapshotList") return { snapshots: MOCK_SNAPSHOTS };
    return undefined;
  });
  const el = document.createElement("acaclaw-backup") as BV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: BV) { document.body.removeChild(el); }
function q(el: BV, s: string) { return el.shadowRoot?.querySelector(s) ?? null; }
function qa(el: BV, s: string) { return el.shadowRoot?.querySelectorAll(s) ?? []; }

beforeEach(() => { vi.clearAllMocks(); });

describe("BackupView DOM", () => {
  it("renders the heading", async () => {
    const el = await createElement();
    const h1 = q(el, "h1");
    expect(h1).toBeTruthy();
    cleanup(el);
  });

  it("renders 4 tabs (files, trash, snapshots, settings)", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    expect(tabs.length).toBe(4);
    cleanup(el);
  });

  it("shows stat cards with backup info", async () => {
    const el = await createElement();
    const cards = qa(el, ".stat-card");
    expect(cards.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("lists backup files", async () => {
    const el = await createElement();
    const rows = qa(el, ".backup-row, tr");
    expect(rows.length).toBeGreaterThan(0);
    cleanup(el);
  });

  it("has restore buttons for backup files", async () => {
    const el = await createElement();
    const restoreBtns = qa(el, ".restore-btn");
    expect(restoreBtns.length).toBeGreaterThanOrEqual(MOCK_BACKUPS.length);
    cleanup(el);
  });

  it("clicking restore calls gateway", async () => {
    const el = await createElement();
    const restoreBtn = q(el, ".restore-btn") as HTMLButtonElement | null;
    if (restoreBtn) {
      restoreBtn.click();
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 50));
      const restoreCall = mockCall.mock.calls.find((c: unknown[]) => c[0] === "acaclaw.backup.restore");
      expect(restoreCall).toBeTruthy();
    }
    cleanup(el);
  });

  it("switching to snapshots tab shows snapshot section", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const snapshotTab = Array.from(tabs).find((t) => t.textContent?.includes("快照") || t.textContent?.includes("Snapshot"));
    if (snapshotTab) {
      (snapshotTab as HTMLElement).click();
      await el.updateComplete;
      const snapshotBtn = q(el, ".snapshot-btn");
      expect(snapshotBtn).toBeTruthy();
    }
    cleanup(el);
  });

  it("switching to settings tab shows form controls", async () => {
    const el = await createElement();
    const tabs = qa(el, ".tab");
    const settingsTab = Array.from(tabs).find((t) => t.textContent?.includes("设置") || t.textContent?.includes("Settings"));
    if (settingsTab) {
      (settingsTab as HTMLElement).click();
      await el.updateComplete;
      const selects = qa(el, ".form-select, select");
      expect(selects.length).toBeGreaterThan(0);
    }
    cleanup(el);
  });

  it("calls acaclaw.backup.list on creation", async () => {
    const el = await createElement();
    expect(mockCall).toHaveBeenCalledWith("acaclaw.backup.list");
    cleanup(el);
  });
});
