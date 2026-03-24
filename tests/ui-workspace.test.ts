/**
 * Gateway contract tests for WorkspaceView button actions.
 * Verifies correct API method + params for project/folder/file CRUD.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Gateway mock ── */

const mockCall = vi.fn();

/* ── Replicated handler logic from WorkspaceView ── */

async function submitCreateProject(
  name: string,
  description: string,
  discipline: string,
) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Project name is required" };
  const res = await mockCall("acaclaw.project.create", {
    name: trimmed,
    description,
    discipline,
  });
  if (res?.error) return { error: res.error };
  return { created: true };
}

async function submitCreateFolder(name: string, currentPath: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Folder name is required" };
  const fullPath =
    currentPath.length > 0 ? currentPath.join("/") + "/" + trimmed : trimmed;
  const res = await mockCall("acaclaw.workspace.createFolder", {
    path: fullPath,
  });
  if (res?.error) return { error: res.error };
  return { created: true, path: fullPath };
}

async function submitCreateFile(name: string, currentPath: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "File name is required" };
  const fullPath =
    currentPath.length > 0 ? currentPath.join("/") + "/" + trimmed : trimmed;
  const res = await mockCall("acaclaw.workspace.createFile", {
    path: fullPath,
  });
  if (res?.error) return { error: res.error };
  return { created: true, path: fullPath };
}

async function loadFiles() {
  const res = await mockCall("acaclaw.workspace.list");
  return res?.entries ?? [];
}

async function setWorkdir(agentId: string, path: string) {
  await mockCall("acaclaw.workspace.setWorkdir", { agentId, path });
}

/* ── Tests ── */

describe("WorkspaceView – create project", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.project.create with name, description, discipline", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateProject(
      "RNA-Seq Pipeline",
      "Bulk RNA-seq analysis",
      "biology",
    );
    expect(result.created).toBe(true);
    expect(mockCall).toHaveBeenCalledWith("acaclaw.project.create", {
      name: "RNA-Seq Pipeline",
      description: "Bulk RNA-seq analysis",
      discipline: "biology",
    });
  });

  it("trims project name", async () => {
    mockCall.mockResolvedValue({});
    await submitCreateProject("  My Project  ", "", "general");
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.project.create",
      expect.objectContaining({ name: "My Project" }),
    );
  });

  it("returns error when name is empty", async () => {
    const result = await submitCreateProject("", "", "general");
    expect(result.error).toBe("Project name is required");
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("returns error when name is whitespace", async () => {
    const result = await submitCreateProject("   ", "", "general");
    expect(result.error).toBe("Project name is required");
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("forwards server error", async () => {
    mockCall.mockResolvedValue({ error: "Project already exists" });
    const result = await submitCreateProject("Existing", "", "general");
    expect(result.error).toBe("Project already exists");
  });
});

describe("WorkspaceView – create folder", () => {
  beforeEach(() => mockCall.mockReset());

  it("creates folder at root when currentPath is empty", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateFolder("data", []);
    expect(result.created).toBe(true);
    expect(result.path).toBe("data");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.createFolder", {
      path: "data",
    });
  });

  it("creates folder under nested path", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateFolder("results", [
      "Projects",
      "RNA-Seq",
    ]);
    expect(result.path).toBe("Projects/RNA-Seq/results");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.createFolder", {
      path: "Projects/RNA-Seq/results",
    });
  });

  it("trims folder name", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateFolder("  output  ", ["Projects"]);
    expect(result.path).toBe("Projects/output");
  });

  it("returns error for empty name", async () => {
    const result = await submitCreateFolder("", []);
    expect(result.error).toBe("Folder name is required");
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("forwards server error", async () => {
    mockCall.mockResolvedValue({ error: "Permission denied" });
    const result = await submitCreateFolder("secret", []);
    expect(result.error).toBe("Permission denied");
  });
});

describe("WorkspaceView – create file", () => {
  beforeEach(() => mockCall.mockReset());

  it("creates file at root when currentPath is empty", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateFile("analysis.py", []);
    expect(result.created).toBe(true);
    expect(result.path).toBe("analysis.py");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.createFile", {
      path: "analysis.py",
    });
  });

  it("creates file under nested path", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateFile("pipeline.sh", [
      "Projects",
      "RNA-Seq",
      "scripts",
    ]);
    expect(result.path).toBe("Projects/RNA-Seq/scripts/pipeline.sh");
  });

  it("returns error for empty name", async () => {
    const result = await submitCreateFile("", []);
    expect(result.error).toBe("File name is required");
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("trims file name", async () => {
    mockCall.mockResolvedValue({});
    const result = await submitCreateFile("  README.md  ", []);
    expect(result.path).toBe("README.md");
  });

  it("forwards server error", async () => {
    mockCall.mockResolvedValue({ error: "File already exists" });
    const result = await submitCreateFile("existing.txt", []);
    expect(result.error).toBe("File already exists");
  });
});

describe("WorkspaceView – load files", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.workspace.list", async () => {
    mockCall.mockResolvedValue({
      entries: [
        { name: "Projects", type: "dir" },
        { name: "README.md", type: "file" },
      ],
    });
    const result = await loadFiles();
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.list");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no entries", async () => {
    mockCall.mockResolvedValue({});
    const result = await loadFiles();
    expect(result).toEqual([]);
  });
});

describe("WorkspaceView – set working directory", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.workspace.setWorkdir with agentId and path", async () => {
    mockCall.mockResolvedValue(undefined);
    await setWorkdir("biologist", "~/AcaClaw/Projects/RNA-Seq");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.workspace.setWorkdir", {
      agentId: "biologist",
      path: "~/AcaClaw/Projects/RNA-Seq",
    });
  });
});

describe("WorkspaceView – path construction", () => {
  it("joins currentPath segments with /", () => {
    const currentPath = ["Projects", "RNA-Seq", "data"];
    const name = "counts.csv";
    const fullPath = currentPath.join("/") + "/" + name;
    expect(fullPath).toBe("Projects/RNA-Seq/data/counts.csv");
  });

  it("handles single-level path", () => {
    const currentPath = ["Projects"];
    const name = "notes.md";
    const fullPath = currentPath.join("/") + "/" + name;
    expect(fullPath).toBe("Projects/notes.md");
  });

  it("handles root-level (empty path)", () => {
    const currentPath: string[] = [];
    const name = "config.json";
    const fullPath = currentPath.length > 0
      ? currentPath.join("/") + "/" + name
      : name;
    expect(fullPath).toBe("config.json");
  });
});
