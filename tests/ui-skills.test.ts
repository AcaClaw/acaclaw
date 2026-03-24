/**
 * Gateway contract tests for SkillsView button actions.
 * Verifies correct API method + params for skill install/toggle/filter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Replicated types ── */

interface Skill {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  disabled: boolean;
  eligible: boolean;
  install: Array<{ id: string; kind: string; label: string }>;
}

interface ClawHubSkill {
  name: string;
  description: string;
  author: string;
  category: string;
  recommended?: boolean;
}

/* ── Curated skills (from ui/src/views/skills.ts) ── */

const CURATED_SKILLS: ClawHubSkill[] = [
  { name: "ai-humanizer", description: "Humanize AI-generated text to sound natural and authentic", author: "acaclaw", category: "Writing", recommended: true },
  { name: "paper-search", description: "Search arXiv, PubMed, Semantic Scholar, and CrossRef simultaneously", author: "acaclaw", category: "Research", recommended: true },
  { name: "citation-manager", description: "Format references in APA, Vancouver, Nature, and 9000+ citation styles", author: "acaclaw", category: "Research", recommended: true },
  { name: "data-analyst", description: "Statistical analysis from natural language", author: "acaclaw", category: "Data Analysis", recommended: true },
  { name: "figure-generator", description: "Publication-quality plots and charts ready for journal submission", author: "acaclaw", category: "Data Analysis" },
  { name: "manuscript-assistant", description: "Draft, edit, and structure papers following journal guidelines", author: "acaclaw", category: "Writing" },
  { name: "grant-writer", description: "Structure and draft grant proposals following funder templates", author: "acaclaw", category: "Writing" },
  { name: "format-converter", description: "Convert between Word, PDF, LaTeX, and journal-specific templates", author: "acaclaw", category: "Documents" },
  { name: "presentation-maker", description: "Generate slides from research notes or paper content", author: "acaclaw", category: "Documents" },
];

/* ── Gateway mock ── */

const mockCall = vi.fn();

/* ── Replicated handler logic from SkillsView ── */

async function installSkill(name: string, installId?: string) {
  const params: Record<string, unknown> = { name };
  if (installId) params.installId = installId;
  await mockCall("skills.install", params, { timeoutMs: 300_000 });
}

async function toggleSkill(skillKey: string, enabled: boolean) {
  await mockCall("skills.update", { skillKey, enabled });
}

async function loadSkills(): Promise<Skill[]> {
  const res = await mockCall("skills.status");
  return res?.skills ?? [];
}

function filteredInstalled(installed: Skill[], searchQuery: string): Skill[] {
  if (!searchQuery) return installed;
  const q = searchQuery.toLowerCase();
  return installed.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

function filteredClawHub(installed: Skill[], searchQuery: string): ClawHubSkill[] {
  const installedNames = new Set(installed.map((s) => s.name));
  const available = CURATED_SKILLS.filter((s) => !installedNames.has(s.name));
  if (!searchQuery) return available;
  const q = searchQuery.toLowerCase();
  return available.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q),
  );
}

/* ── Tests ── */

describe("SkillsView – install skill", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls skills.install with name only", async () => {
    mockCall.mockResolvedValue(undefined);
    await installSkill("paper-search");
    expect(mockCall).toHaveBeenCalledWith(
      "skills.install",
      { name: "paper-search" },
      { timeoutMs: 300_000 },
    );
  });

  it("includes installId when provided", async () => {
    mockCall.mockResolvedValue(undefined);
    await installSkill("paper-search", "npm:@acaclaw/paper-search");
    expect(mockCall).toHaveBeenCalledWith(
      "skills.install",
      { name: "paper-search", installId: "npm:@acaclaw/paper-search" },
      { timeoutMs: 300_000 },
    );
  });

  it("omits installId when undefined", async () => {
    mockCall.mockResolvedValue(undefined);
    await installSkill("data-analyst");
    const params = mockCall.mock.calls[0][1] as Record<string, unknown>;
    expect(params).not.toHaveProperty("installId");
  });

  it("uses 5-minute timeout for skill install", async () => {
    mockCall.mockResolvedValue(undefined);
    await installSkill("grant-writer");
    expect(mockCall).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      { timeoutMs: 300_000 },
    );
  });
});

describe("SkillsView – toggle skill", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls skills.update to disable", async () => {
    mockCall.mockResolvedValue(undefined);
    await toggleSkill("paper-search", false);
    expect(mockCall).toHaveBeenCalledWith("skills.update", {
      skillKey: "paper-search",
      enabled: false,
    });
  });

  it("calls skills.update to enable", async () => {
    mockCall.mockResolvedValue(undefined);
    await toggleSkill("paper-search", true);
    expect(mockCall).toHaveBeenCalledWith("skills.update", {
      skillKey: "paper-search",
      enabled: true,
    });
  });
});

describe("SkillsView – load skills", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls skills.status and returns skills array", async () => {
    const mockSkills: Skill[] = [
      { name: "nano-pdf", description: "Read PDFs", source: "bundled", bundled: true, disabled: false, eligible: true, install: [] },
    ];
    mockCall.mockResolvedValue({ skills: mockSkills });
    const result = await loadSkills();
    expect(mockCall).toHaveBeenCalledWith("skills.status");
    expect(result).toEqual(mockSkills);
  });

  it("returns empty array when response has no skills", async () => {
    mockCall.mockResolvedValue({});
    const result = await loadSkills();
    expect(result).toEqual([]);
  });

  it("returns empty array when response is null", async () => {
    mockCall.mockResolvedValue(null);
    const result = await loadSkills();
    expect(result).toEqual([]);
  });
});

describe("SkillsView – filter installed skills", () => {
  const installed: Skill[] = [
    { name: "nano-pdf", description: "Read PDFs", source: "bundled", bundled: true, disabled: false, eligible: true, install: [] },
    { name: "xurl", description: "Fetch web pages", source: "bundled", bundled: true, disabled: false, eligible: true, install: [] },
    { name: "paper-search", description: "Search arXiv and PubMed", source: "npm", bundled: false, disabled: false, eligible: true, install: [] },
  ];

  it("returns all when no search query", () => {
    expect(filteredInstalled(installed, "")).toEqual(installed);
  });

  it("filters by name (case-insensitive)", () => {
    const result = filteredInstalled(installed, "PDF");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("nano-pdf");
  });

  it("filters by description", () => {
    const result = filteredInstalled(installed, "arxiv");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("paper-search");
  });

  it("returns empty for no match", () => {
    expect(filteredInstalled(installed, "zzz-no-match")).toEqual([]);
  });
});

describe("SkillsView – filter ClawHub catalog", () => {
  const installed: Skill[] = [
    { name: "ai-humanizer", description: "Humanize AI text", source: "npm", bundled: false, disabled: false, eligible: true, install: [] },
  ];

  it("excludes already installed skills", () => {
    const result = filteredClawHub(installed, "");
    const names = result.map((s) => s.name);
    expect(names).not.toContain("ai-humanizer");
    expect(names).toContain("paper-search");
  });

  it("returns all available when no search query", () => {
    const result = filteredClawHub([], "");
    expect(result).toHaveLength(CURATED_SKILLS.length);
  });

  it("filters by name", () => {
    const result = filteredClawHub([], "grant");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("grant-writer");
  });

  it("filters by description", () => {
    const result = filteredClawHub([], "slides");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("presentation-maker");
  });

  it("filters by category", () => {
    const result = filteredClawHub([], "Documents");
    expect(result).toHaveLength(2);
  });

  it("combines install exclusion and search", () => {
    const result = filteredClawHub(installed, "Writing");
    const names = result.map((s) => s.name);
    // ai-humanizer is Writing but already installed
    expect(names).not.toContain("ai-humanizer");
    expect(names).toContain("manuscript-assistant");
    expect(names).toContain("grant-writer");
  });
});

describe("SkillsView – curated skills integrity", () => {
  it("all curated skills have required fields", () => {
    for (const skill of CURATED_SKILLS) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.author).toBeTruthy();
      expect(skill.category).toBeTruthy();
    }
  });

  it("has recommended skills marked", () => {
    const recommended = CURATED_SKILLS.filter((s) => s.recommended);
    expect(recommended.length).toBeGreaterThan(0);
  });

  it("has unique skill names", () => {
    const names = CURATED_SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
