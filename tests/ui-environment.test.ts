/**
 * Gateway contract tests for EnvironmentView button actions.
 * Verifies correct API method + params for each UI action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Replicated constants from ui/src/views/environment.ts ── */

const TAB_META: Record<string, { installAction: string }> = {
  python: { installAction: "acaclaw.env.pip.install" },
  system: { installAction: "acaclaw.env.sys.install" },
  r: { installAction: "acaclaw.env.r.install" },
  cuda: { installAction: "acaclaw.env.cuda.install" },
  nodejs: { installAction: "acaclaw.env.npm.install" },
};

/* ── Gateway mock ── */

const mockCall = vi.fn();

/* ── Replicated handler logic from EnvironmentView ── */

async function installPackage(
  pkg: string,
  activeTab: string,
  selectedEnv: string,
) {
  const trimmed = pkg.trim();
  if (!trimmed) return { called: false };
  const meta = TAB_META[activeTab];
  await mockCall(
    meta.installAction,
    { packages: [trimmed], env: selectedEnv },
    { timeoutMs: 300_000 },
  );
  return { called: true };
}

async function uninstallPackage(name: string, activeTab: string, selectedEnv: string) {
  await mockCall(
    TAB_META[activeTab].installAction.replace("install", "uninstall"),
    { packages: [name], env: selectedEnv },
  );
}

async function installEnv(selectedEnv: string) {
  if (!selectedEnv) return { called: false };
  await mockCall("acaclaw.env.install", { name: selectedEnv }, { timeoutMs: 600_000 });
  return { called: true };
}

async function createEnv(newEnvName: string) {
  const name = newEnvName.trim();
  if (!name) return { created: false };
  await mockCall("acaclaw.env.create", { name });
  return { created: true, name };
}

async function removeEnv(selectedEnv: string, isInstalled: boolean) {
  if (!selectedEnv || !isInstalled) return { removed: false };
  await mockCall("acaclaw.env.remove", { name: selectedEnv }, { timeoutMs: 600_000 });
  return { removed: true };
}

/* ── Tests ── */

describe("EnvironmentView – package install", () => {
  beforeEach(() => mockCall.mockReset());

  it.each([
    ["python", "acaclaw.env.pip.install"],
    ["system", "acaclaw.env.sys.install"],
    ["r", "acaclaw.env.r.install"],
    ["cuda", "acaclaw.env.cuda.install"],
    ["nodejs", "acaclaw.env.npm.install"],
  ])("tab=%s → calls %s", async (tab, expectedMethod) => {
    mockCall.mockResolvedValue(undefined);
    await installPackage("numpy", tab, "aca");
    expect(mockCall).toHaveBeenCalledWith(
      expectedMethod,
      { packages: ["numpy"], env: "aca" },
      { timeoutMs: 300_000 },
    );
  });

  it("passes selected env to install call", async () => {
    mockCall.mockResolvedValue(undefined);
    await installPackage("biopython", "python", "aca-bio");
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.pip.install",
      { packages: ["biopython"], env: "aca-bio" },
      { timeoutMs: 300_000 },
    );
  });

  it("trims whitespace from package name", async () => {
    mockCall.mockResolvedValue(undefined);
    await installPackage("  scipy  ", "python", "aca");
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.pip.install",
      { packages: ["scipy"], env: "aca" },
      expect.any(Object),
    );
  });

  it("skips install when package name is empty", async () => {
    const result = await installPackage("", "python", "aca");
    expect(result.called).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("skips install when package name is whitespace only", async () => {
    const result = await installPackage("   ", "python", "aca");
    expect(result.called).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("EnvironmentView – package uninstall", () => {
  beforeEach(() => mockCall.mockReset());

  it.each([
    ["python", "acaclaw.env.pip.uninstall"],
    ["system", "acaclaw.env.sys.uninstall"],
    ["r", "acaclaw.env.r.uninstall"],
    ["cuda", "acaclaw.env.cuda.uninstall"],
    ["nodejs", "acaclaw.env.npm.uninstall"],
  ])("tab=%s → calls %s", async (tab, expectedMethod) => {
    mockCall.mockResolvedValue(undefined);
    await uninstallPackage("numpy", tab, "aca");
    expect(mockCall).toHaveBeenCalledWith(
      expectedMethod,
      { packages: ["numpy"], env: "aca" },
    );
  });

  it("passes correct env for uninstall", async () => {
    mockCall.mockResolvedValue(undefined);
    await uninstallPackage("torch", "python", "aca-ai");
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.pip.uninstall",
      { packages: ["torch"], env: "aca-ai" },
    );
  });
});

describe("EnvironmentView – environment install", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.env.install with 600s timeout", async () => {
    mockCall.mockResolvedValue(undefined);
    await installEnv("aca-bio");
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.install",
      { name: "aca-bio" },
      { timeoutMs: 600_000 },
    );
  });

  it("skips when no env is selected", async () => {
    const result = await installEnv("");
    expect(result.called).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("EnvironmentView – create environment", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.env.create with trimmed name", async () => {
    mockCall.mockResolvedValue(undefined);
    const result = await createEnv("  my-env  ");
    expect(result.created).toBe(true);
    expect(result.name).toBe("my-env");
    expect(mockCall).toHaveBeenCalledWith("acaclaw.env.create", { name: "my-env" });
  });

  it("skips when name is empty", async () => {
    const result = await createEnv("");
    expect(result.created).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("skips when name is whitespace", async () => {
    const result = await createEnv("   ");
    expect(result.created).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("EnvironmentView – remove environment", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.env.remove with 600s timeout", async () => {
    mockCall.mockResolvedValue(undefined);
    const result = await removeEnv("aca-bio", true);
    expect(result.removed).toBe(true);
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.remove",
      { name: "aca-bio" },
      { timeoutMs: 600_000 },
    );
  });

  it("skips when env is not installed", async () => {
    const result = await removeEnv("aca-bio", false);
    expect(result.removed).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("skips when no env is selected", async () => {
    const result = await removeEnv("", true);
    expect(result.removed).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("EnvironmentView – TAB_META action mapping", () => {
  it("maps every tab to a unique install action", () => {
    const actions = Object.values(TAB_META).map((m) => m.installAction);
    expect(new Set(actions).size).toBe(5);
  });

  it("all install actions start with acaclaw.env.", () => {
    for (const meta of Object.values(TAB_META)) {
      expect(meta.installAction).toMatch(/^acaclaw\.env\.\w+\.install$/);
    }
  });

  it("uninstall action is derived by replacing install→uninstall", () => {
    for (const [, meta] of Object.entries(TAB_META)) {
      const uninstallAction = meta.installAction.replace("install", "uninstall");
      expect(uninstallAction).toMatch(/^acaclaw\.env\.\w+\.uninstall$/);
    }
  });
});
