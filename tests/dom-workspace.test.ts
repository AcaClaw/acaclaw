/**
 * DOM component tests for WorkspaceView.
 * Renders the Lit component in happy-dom and simulates button clicks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCall = vi.fn();

vi.mock("../ui/src/controllers/gateway.js", () => ({
  gateway: {
    call: (...args: unknown[]) => mockCall(...args),
    state: "connected" as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
}));

const { WorkspaceView } = await import("../ui/src/views/workspace.js");

type WV = InstanceType<typeof WorkspaceView>;

const MOCK_FILES = [
  { name: "Projects", type: "dir" as const, size: 0, modified: "2025-01-15" },
  { name: "research-notes.md", type: "file" as const, size: 2048, modified: "2025-01-10" },
  { name: "data.csv", type: "file" as const, size: 15360, modified: "2025-01-12" },
];

async function createElement(): Promise<WV> {
  mockCall.mockImplementation(async (method: string) => {
    if (method === "acaclaw.workspace.list") return { files: MOCK_FILES };
    return undefined;
  });
  const el = document.createElement("acaclaw-workspace") as WV;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 50));
  await el.updateComplete;
  return el;
}

function cleanup(el: WV) {
  document.body.removeChild(el);
}

function q(el: WV, selector: string) {
  return el.shadowRoot!.querySelector(selector);
}
function qa(el: WV, selector: string) {
  return el.shadowRoot!.querySelectorAll(selector);
}

describe("WorkspaceView DOM", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("renders file rows from gateway data", async () => {
    const el = await createElement();
    const rows = qa(el, ".file-row");
    expect(rows.length).toBe(MOCK_FILES.length);
    cleanup(el);
  });

  it("renders toolbar with New Folder and New File at root", async () => {
    const el = await createElement();
    const toolbarBtns = qa(el, ".toolbar-btn");
    const labels = Array.from(toolbarBtns).map((b) => b.textContent?.trim());
    expect(labels.some((l) => l?.includes("Folder"))).toBe(true);
    expect(labels.some((l) => l?.includes("File"))).toBe(true);
    // New Project only shows inside Projects dir
    expect(labels.some((l) => l?.includes("Project"))).toBe(false);
    cleanup(el);
  });

  it("shows New Project button when inside Projects dir", async () => {
    const el = await createElement();
    // Navigate into Projects directory
    mockCall.mockImplementation(async (method: string) => {
      if (method === "acaclaw.workspace.list") return { files: [] };
      return undefined;
    });
    const dirRow = Array.from(qa(el, ".file-row")).find((row) =>
      row.querySelector(".file-name")?.textContent?.trim() === "Projects",
    ) as HTMLElement;
    dirRow.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    const toolbarBtns = qa(el, ".toolbar-btn");
    const labels = Array.from(toolbarBtns).map((b) => b.textContent?.trim());
    expect(labels.some((l) => l?.includes("Project"))).toBe(true);
    cleanup(el);
  });

  it("clicking New Folder opens create folder dialog", async () => {
    const el = await createElement();
    const folderBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("Folder"),
    ) as HTMLButtonElement;
    folderBtn.click();
    await el.updateComplete;

    const dialog = q(el, ".dialog");
    expect(dialog).toBeTruthy();
    cleanup(el);
  });

  it("clicking New File opens create file dialog", async () => {
    const el = await createElement();
    const fileBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("File"),
    ) as HTMLButtonElement;
    fileBtn.click();
    await el.updateComplete;

    const dialog = q(el, ".dialog");
    expect(dialog).toBeTruthy();
    cleanup(el);
  });

  it("submitting create project calls gateway.call", async () => {
    const el = await createElement();
    // Navigate into Projects first
    mockCall.mockImplementation(async (method: string) => {
      if (method === "acaclaw.workspace.list") return { files: [] };
      return undefined;
    });
    const dirRow = Array.from(qa(el, ".file-row")).find((row) =>
      row.querySelector(".file-name")?.textContent?.trim() === "Projects",
    ) as HTMLElement;
    dirRow.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "acaclaw.workspace.list") return { files: [] };
      return undefined;
    });

    // Open project dialog
    const projectBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("Project"),
    ) as HTMLButtonElement;
    projectBtn.click();
    await el.updateComplete;

    // Fill in project name
    const nameInput = q(el, ".dialog input") as HTMLInputElement;
    nameInput.value = "My Research";
    nameInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    // Click create
    const createBtn = q(el, ".btn-create") as HTMLButtonElement;
    createBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const createCall = calls.find((c) => c[0] === "acaclaw.project.create");
    expect(createCall).toBeTruthy();
    expect(createCall![1]).toHaveProperty("name", "My Research");
    cleanup(el);
  });

  it("submitting create folder calls gateway.call", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "acaclaw.workspace.list") return { files: MOCK_FILES };
      return undefined;
    });

    // Open folder dialog
    const folderBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("Folder"),
    ) as HTMLButtonElement;
    folderBtn.click();
    await el.updateComplete;

    // Fill in folder name
    const nameInput = q(el, ".dialog input") as HTMLInputElement;
    nameInput.value = "data-files";
    nameInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    // Click create
    const createBtn = q(el, ".btn-create") as HTMLButtonElement;
    createBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const folderCall = calls.find((c) => c[0] === "acaclaw.workspace.createFolder");
    expect(folderCall).toBeTruthy();
    expect(folderCall![1]).toHaveProperty("path", "data-files");
    cleanup(el);
  });

  it("submitting create file calls gateway.call", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "acaclaw.workspace.list") return { files: MOCK_FILES };
      return undefined;
    });

    // Open file dialog
    const fileBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("File"),
    ) as HTMLButtonElement;
    fileBtn.click();
    await el.updateComplete;

    // Fill in file name
    const nameInput = q(el, ".dialog input") as HTMLInputElement;
    nameInput.value = "notes.md";
    nameInput.dispatchEvent(new Event("input"));
    await el.updateComplete;

    // Click create
    const createBtn = q(el, ".btn-create") as HTMLButtonElement;
    createBtn.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    const fileCall = calls.find((c) => c[0] === "acaclaw.workspace.createFile");
    expect(fileCall).toBeTruthy();
    expect(fileCall![1]).toHaveProperty("path", "notes.md");
    cleanup(el);
  });

  it("cancel button closes folder dialog without calling gateway", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "acaclaw.workspace.list") return { files: MOCK_FILES };
      return undefined;
    });

    // Open folder dialog (available at root)
    const folderBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("Folder"),
    ) as HTMLButtonElement;
    folderBtn.click();
    await el.updateComplete;

    // Click cancel
    const cancelBtn = q(el, ".btn-cancel") as HTMLButtonElement;
    cancelBtn.click();
    await el.updateComplete;

    expect(q(el, ".dialog")).toBeFalsy();
    const createCalls = calls.filter((c) => c[0] === "acaclaw.workspace.createFolder");
    expect(createCalls.length).toBe(0);
    cleanup(el);
  });

  it("create button is disabled when folder name is empty", async () => {
    const el = await createElement();

    // Open folder dialog
    const folderBtn = Array.from(qa(el, ".toolbar-btn")).find((b) =>
      b.textContent?.includes("Folder"),
    ) as HTMLButtonElement;
    folderBtn.click();
    await el.updateComplete;

    // Create button should be disabled when input is empty
    const createBtn = q(el, ".btn-create") as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    cleanup(el);
  });

  it("clicking a directory row navigates into it", async () => {
    const el = await createElement();
    const calls: unknown[][] = [];
    mockCall.mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "acaclaw.workspace.list") return { files: [] };
      return undefined;
    });

    // Click the "Projects" directory row
    const dirRow = Array.from(qa(el, ".file-row")).find((row) => {
      const name = row.querySelector(".file-name");
      return name?.textContent?.trim() === "Projects";
    }) as HTMLElement;
    dirRow.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    // Should have called workspace.list with the path
    const listCall = calls.find(
      (c) => c[0] === "acaclaw.workspace.list" && (c[1] as Record<string, unknown>)?.path === "Projects",
    );
    expect(listCall).toBeTruthy();
    cleanup(el);
  });

  it("breadcrumb renders and navigates back", async () => {
    const el = await createElement();
    // Navigate into Projects
    mockCall.mockImplementation(async (method: string) => {
      if (method === "acaclaw.workspace.list") return { files: [] };
      return undefined;
    });

    const dirRow = Array.from(qa(el, ".file-row")).find((row) =>
      row.querySelector(".file-name")?.textContent?.trim() === "Projects",
    ) as HTMLElement;
    dirRow.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    // Breadcrumb should show "Projects"
    const breadcrumbs = qa(el, ".breadcrumb-item");
    expect(breadcrumbs.length).toBeGreaterThan(0);

    // Click root breadcrumb to navigate back
    (breadcrumbs[0] as HTMLElement).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));

    cleanup(el);
  });

  it("clicking a file row opens preview", async () => {
    const el = await createElement();
    mockCall.mockImplementation(async (method: string) => {
      if (method === "acaclaw.workspace.list") return { files: MOCK_FILES };
      if (method === "acaclaw.workspace.readFile")
        return { type: "text", name: "research-notes.md", ext: ".md", size: 2048, content: "# Notes" };
      return undefined;
    });

    // Click the file row (not directory)
    const fileRow = Array.from(qa(el, ".file-row")).find((row) =>
      row.querySelector(".file-name")?.textContent?.trim() === "research-notes.md",
    ) as HTMLElement;
    fileRow.click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 50));
    await el.updateComplete;

    const preview = q(el, ".preview-panel");
    expect(preview).toBeTruthy();
    cleanup(el);
  });
});
