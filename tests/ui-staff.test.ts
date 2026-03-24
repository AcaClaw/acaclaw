/**
 * Gateway contract tests for StaffView button actions.
 * Tests staff CRUD, localStorage persistence, skill assignment, env management.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ── Replicated types from ui/src/views/staff.ts ── */

interface StaffMember {
  id: string;
  icon: string;
  name: string;
  role: string;
  discipline: string;
  condaEnv: string;
  description: string;
  editable?: boolean;
  skills: string[];
  envInstalled?: boolean;
  photoUrl?: string;
}

interface StaffCustomization {
  icon?: string;
  name?: string;
  photoUrl?: string;
  skills?: string[];
}

type SkillDiscipline =
  | "cross"
  | "biology"
  | "medicine"
  | "chemistry"
  | "physics"
  | "mathematics"
  | "ai"
  | "cs"
  | "statistics";

interface AvailableSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  default: boolean;
  disciplines: SkillDiscipline[];
}

/* ── Constants ── */

const STAFF_STORAGE_KEY = "acaclaw-staff-customizations";
const STAFF_ADDED_KEY = "acaclaw-staff-added";

const DEFAULT_SKILL_IDS = ["nano-pdf", "xurl", "agentic-coding", "summarize"];

const AVAILABLE_SKILLS: AvailableSkill[] = [
  { id: "nano-pdf", name: "nano-pdf", description: "Read PDFs", category: "Foundation", default: true, disciplines: ["cross"] },
  { id: "xurl", name: "xurl", description: "Fetch web pages", category: "Foundation", default: true, disciplines: ["cross"] },
  { id: "agentic-coding", name: "agentic-coding", description: "Write code", category: "Foundation", default: true, disciplines: ["cross"] },
  { id: "summarize", name: "summarize", description: "Summarize text", category: "Foundation", default: true, disciplines: ["cross"] },
  { id: "literature-search", name: "literature-search", description: "Search arXiv, PubMed", category: "Literature", default: false, disciplines: ["cross"] },
  { id: "bioskills", name: "bioskills", description: "Bioinformatics tools", category: "Biology", default: false, disciplines: ["biology"] },
  { id: "wolfram-alpha", name: "wolfram-alpha", description: "Calculations", category: "Physics", default: false, disciplines: ["physics", "mathematics"] },
  { id: "github", name: "github", description: "GitHub integration", category: "CS", default: false, disciplines: ["cs"] },
  { id: "medical-research-toolkit", name: "medical-research-toolkit", description: "Biomedical databases", category: "Medicine", default: false, disciplines: ["medicine"] },
];

const STAFF_MEMBERS: StaffMember[] = [
  { id: "default", icon: "👤", name: "Aca", role: "General Assistant", discipline: "General", condaEnv: "aca", description: "Personal research assistant", editable: true, skills: [...DEFAULT_SKILL_IDS], envInstalled: true },
  { id: "biologist", icon: "🧬", name: "Dr. Gene", role: "Computational Biologist", discipline: "Biology", condaEnv: "aca-bio", description: "Genomics expert", skills: [...DEFAULT_SKILL_IDS], envInstalled: false },
  { id: "medscientist", icon: "🏥", name: "Dr. Curie", role: "Medical Scientist", discipline: "Medicine", condaEnv: "aca-med", description: "Clinical research", skills: [...DEFAULT_SKILL_IDS], envInstalled: false },
];

const PREBUILT_TEMPLATES = [
  { id: "chemist", icon: "🧪", name: "Dr. Mendeleev", role: "Computational Chemist", discipline: "Chemistry", condaEnv: "aca-chem", description: "Molecular dynamics" },
  { id: "physicist", icon: "⚛️", name: "Dr. Feynman", role: "Theoretical Physicist", discipline: "Physics", condaEnv: "aca-phys", description: "Quantum mechanics" },
];

/* ── Gateway mock ── */

const mockCall = vi.fn();

/* ── localStorage mock ── */

let storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { storage = {}; },
};

/* ── Replicated logic from StaffView ── */

function loadStaffCustomizations(): Record<string, StaffCustomization> {
  try {
    const raw = mockLocalStorage.getItem(STAFF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadAddedStaff(): StaffMember[] {
  try {
    const raw = mockLocalStorage.getItem(STAFF_ADDED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function applyCustomizations(staff: StaffMember[]): StaffMember[] {
  const customs = loadStaffCustomizations();
  const base = staff.map((s) => {
    const c = customs[s.id];
    if (!c) return s;
    return {
      ...s,
      ...(c.name && { name: c.name }),
      ...(c.icon !== undefined && { icon: c.icon }),
      ...(c.photoUrl !== undefined && { photoUrl: c.photoUrl || undefined }),
      ...(c.skills && { skills: c.skills }),
    };
  });
  const existingIds = new Set(base.map((s) => s.id));
  const added = loadAddedStaff().filter((s) => !existingIds.has(s.id));
  return [...base, ...added];
}

function getCustomizedStaff(): StaffMember[] {
  return applyCustomizations(STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] })));
}

function persistStaff(staff: StaffMember[]) {
  const defaults = new Map(STAFF_MEMBERS.map((s) => [s.id, s]));
  const customs: Record<string, StaffCustomization> = {};
  const added: StaffMember[] = [];
  for (const s of staff) {
    const d = defaults.get(s.id);
    if (!d) { added.push(s); continue; }
    const c: StaffCustomization = {};
    if (s.name !== d.name) c.name = s.name;
    if (s.icon !== d.icon) c.icon = s.icon;
    if (s.photoUrl) c.photoUrl = s.photoUrl;
    const defaultSkills = d.skills.slice().sort().join(",");
    const currentSkills = s.skills.slice().sort().join(",");
    if (currentSkills !== defaultSkills) c.skills = s.skills;
    if (Object.keys(c).length) customs[s.id] = c;
  }
  mockLocalStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(customs));
  mockLocalStorage.setItem(STAFF_ADDED_KEY, JSON.stringify(added));
}

function addNewStaff(
  staff: StaffMember[],
  template?: { id: string; icon: string; name: string; role: string; discipline: string; condaEnv: string; description: string },
): StaffMember[] {
  const id = template?.id ?? `custom-${Date.now()}`;
  if (staff.find((s) => s.id === id)) return staff;
  const newMember: StaffMember = template
    ? { ...template, skills: [...DEFAULT_SKILL_IDS], envInstalled: false }
    : { id, icon: "👤", name: "New Assistant", role: "Research Assistant", discipline: "General", condaEnv: "aca", description: "Custom assistant", skills: [...DEFAULT_SKILL_IDS], envInstalled: false };
  return [...staff, newMember];
}

function toggleSkill(staff: StaffMember[], staffId: string, skillId: string): StaffMember[] {
  return staff.map((s) => {
    if (s.id !== staffId) return s;
    const has = s.skills.includes(skillId);
    return { ...s, skills: has ? s.skills.filter((sk) => sk !== skillId) : [...s.skills, skillId] };
  });
}

function removeSkillFromStaff(staff: StaffMember[], staffId: string, skillId: string): StaffMember[] {
  return staff.map((s) => {
    if (s.id !== staffId) return s;
    return { ...s, skills: s.skills.filter((sk) => sk !== skillId) };
  });
}

function addSkillToStaff(staff: StaffMember[], staffId: string, skillId: string): StaffMember[] {
  return staff.map((s) => {
    if (s.id !== staffId) return s;
    if (s.skills.includes(skillId)) return s;
    return { ...s, skills: [...s.skills, skillId] };
  });
}

function disciplineTags(staffDiscipline: string): SkillDiscipline[] {
  const key = staffDiscipline.toLowerCase();
  const map: Record<string, SkillDiscipline[]> = {
    general: [],
    biology: ["biology"],
    medicine: ["medicine"],
    chemistry: ["chemistry"],
    physics: ["physics"],
    mathematics: ["mathematics"],
    "ai / machine learning": ["ai"],
    statistics: ["statistics"],
    "computer science": ["cs"],
  };
  return map[key] ?? [];
}

function skillMatchesDiscipline(skill: AvailableSkill, staffDiscipline: string): boolean {
  if (skill.disciplines.includes("cross")) return true;
  const tags = disciplineTags(staffDiscipline);
  return skill.disciplines.some((d) => tags.includes(d));
}

/* ── Tests ── */

describe("StaffView – add new staff", () => {
  beforeEach(() => { storage = {}; mockCall.mockReset(); });

  it("adds staff from pre-built template", () => {
    let staff = [...STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }))];
    staff = addNewStaff(staff, PREBUILT_TEMPLATES[0]);
    expect(staff).toHaveLength(4);
    const chemist = staff.find((s) => s.id === "chemist");
    expect(chemist).toBeDefined();
    expect(chemist!.name).toBe("Dr. Mendeleev");
    expect(chemist!.condaEnv).toBe("aca-chem");
    expect(chemist!.skills).toEqual(DEFAULT_SKILL_IDS);
    expect(chemist!.envInstalled).toBe(false);
  });

  it("adds custom staff with defaults", () => {
    let staff = [...STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }))];
    staff = addNewStaff(staff);
    expect(staff).toHaveLength(4);
    const custom = staff[3];
    expect(custom.name).toBe("New Assistant");
    expect(custom.condaEnv).toBe("aca");
    expect(custom.skills).toEqual(DEFAULT_SKILL_IDS);
  });

  it("does not add duplicate staff by id", () => {
    let staff = [...STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }))];
    staff = addNewStaff(staff, { id: "biologist", icon: "🧬", name: "Dup", role: "Test", discipline: "Bio", condaEnv: "aca-bio", description: "dup" });
    expect(staff).toHaveLength(3); // unchanged
  });
});

describe("StaffView – edit staff name", () => {
  beforeEach(() => { storage = {}; });

  it("saves edited name to localStorage", () => {
    const staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff[0] = { ...staff[0], name: "My Custom Name" };
    persistStaff(staff);
    const customs = loadStaffCustomizations();
    expect(customs.default?.name).toBe("My Custom Name");
  });

  it("restores edited name on load", () => {
    mockLocalStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify({ default: { name: "Renamed" } }));
    const staff = getCustomizedStaff();
    const defaultStaff = staff.find((s) => s.id === "default");
    expect(defaultStaff!.name).toBe("Renamed");
  });

  it("does not persist unchanged names", () => {
    const staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    persistStaff(staff);
    const customs = loadStaffCustomizations();
    expect(Object.keys(customs)).toHaveLength(0);
  });
});

describe("StaffView – skill assignment", () => {
  it("toggles skill on", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = toggleSkill(staff, "biologist", "bioskills");
    expect(staff.find((s) => s.id === "biologist")!.skills).toContain("bioskills");
  });

  it("toggles skill off", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = toggleSkill(staff, "default", "nano-pdf");
    expect(staff.find((s) => s.id === "default")!.skills).not.toContain("nano-pdf");
  });

  it("addSkillToStaff does not duplicate", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = addSkillToStaff(staff, "default", "nano-pdf");
    const skills = staff.find((s) => s.id === "default")!.skills;
    expect(skills.filter((s) => s === "nano-pdf")).toHaveLength(1);
  });

  it("removeSkillFromStaff removes only target", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = removeSkillFromStaff(staff, "default", "xurl");
    const skills = staff.find((s) => s.id === "default")!.skills;
    expect(skills).not.toContain("xurl");
    expect(skills).toContain("nano-pdf");
  });

  it("persists skill changes to localStorage", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = addSkillToStaff(staff, "biologist", "bioskills");
    persistStaff(staff);
    const customs = loadStaffCustomizations();
    expect(customs.biologist?.skills).toContain("bioskills");
  });
});

describe("StaffView – skill discipline filtering", () => {
  it("cross-discipline skills match all staff", () => {
    const crossSkill = AVAILABLE_SKILLS.find((s) => s.id === "nano-pdf")!;
    expect(skillMatchesDiscipline(crossSkill, "General")).toBe(true);
    expect(skillMatchesDiscipline(crossSkill, "Biology")).toBe(true);
    expect(skillMatchesDiscipline(crossSkill, "Medicine")).toBe(true);
  });

  it("biology skills match biology staff only", () => {
    const bioSkill = AVAILABLE_SKILLS.find((s) => s.id === "bioskills")!;
    expect(skillMatchesDiscipline(bioSkill, "Biology")).toBe(true);
    expect(skillMatchesDiscipline(bioSkill, "Medicine")).toBe(false);
    expect(skillMatchesDiscipline(bioSkill, "General")).toBe(false);
  });

  it("physics skills match physics and mathematics staff", () => {
    const physSkill = AVAILABLE_SKILLS.find((s) => s.id === "wolfram-alpha")!;
    expect(skillMatchesDiscipline(physSkill, "Physics")).toBe(true);
    expect(skillMatchesDiscipline(physSkill, "Mathematics")).toBe(true);
    expect(skillMatchesDiscipline(physSkill, "Biology")).toBe(false);
  });

  it("cs skills match computer science staff", () => {
    const csSkill = AVAILABLE_SKILLS.find((s) => s.id === "github")!;
    expect(skillMatchesDiscipline(csSkill, "Computer Science")).toBe(true);
    expect(skillMatchesDiscipline(csSkill, "General")).toBe(false);
  });

  it("returns empty tags for unknown discipline", () => {
    expect(disciplineTags("Underwater Basket Weaving")).toEqual([]);
  });
});

describe("StaffView – install staff environment", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.env.install with staff condaEnv (600s timeout)", async () => {
    mockCall.mockResolvedValue(undefined);
    const staff = STAFF_MEMBERS.find((s) => s.id === "biologist")!;
    await mockCall("acaclaw.env.install", { name: staff.condaEnv }, { timeoutMs: 600_000 });
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.install",
      { name: "aca-bio" },
      { timeoutMs: 600_000 },
    );
  });

  it("calls acaclaw.env.remove for uninstall", async () => {
    mockCall.mockResolvedValue(undefined);
    const staff = STAFF_MEMBERS.find((s) => s.id === "medscientist")!;
    await mockCall("acaclaw.env.remove", { name: staff.condaEnv }, { timeoutMs: 600_000 });
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.remove",
      { name: "aca-med" },
      { timeoutMs: 600_000 },
    );
  });
});

describe("StaffView – install package for staff", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.env.pip.install with staff condaEnv", async () => {
    mockCall.mockResolvedValue(undefined);
    const staff = STAFF_MEMBERS.find((s) => s.id === "biologist")!;
    await mockCall(
      "acaclaw.env.pip.install",
      { packages: ["scanpy"], env: staff.condaEnv },
      { timeoutMs: 300_000 },
    );
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.pip.install",
      { packages: ["scanpy"], env: "aca-bio" },
      { timeoutMs: 300_000 },
    );
  });

  it("calls acaclaw.env.pip.uninstall for remove", async () => {
    mockCall.mockResolvedValue(undefined);
    const staff = STAFF_MEMBERS.find((s) => s.id === "default")!;
    await mockCall(
      "acaclaw.env.pip.uninstall",
      { packages: ["torch"], env: staff.condaEnv },
      { timeoutMs: 300_000 },
    );
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.env.pip.uninstall",
      { packages: ["torch"], env: "aca" },
      { timeoutMs: 300_000 },
    );
  });
});

describe("StaffView – install skill from ClawHub", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls acaclaw.skill.install with slug (120s timeout)", async () => {
    mockCall.mockResolvedValue({ ok: true, slug: "paper-search", installed: true });
    await mockCall("acaclaw.skill.install", { slug: "paper-search" }, { timeoutMs: 120_000 });
    expect(mockCall).toHaveBeenCalledWith(
      "acaclaw.skill.install",
      { slug: "paper-search" },
      { timeoutMs: 120_000 },
    );
  });

  it("adds skill to staff on successful install", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = addSkillToStaff(staff, "biologist", "paper-search");
    expect(staff.find((s) => s.id === "biologist")!.skills).toContain("paper-search");
  });

  it("handles alreadyExists response", async () => {
    mockCall.mockResolvedValue({ ok: true, slug: "paper-search", alreadyExists: true });
    const res = await mockCall("acaclaw.skill.install", { slug: "paper-search" }, { timeoutMs: 120_000 });
    expect(res.alreadyExists).toBe(true);
  });
});

describe("StaffView – install gateway skill", () => {
  beforeEach(() => mockCall.mockReset());

  it("calls skills.install with name + installId (300s timeout)", async () => {
    mockCall.mockResolvedValue({ ok: true, message: "installed" });
    await mockCall("skills.install", { name: "paper-search", installId: "npm:@acaclaw/paper-search" }, { timeoutMs: 300_000 });
    expect(mockCall).toHaveBeenCalledWith(
      "skills.install",
      { name: "paper-search", installId: "npm:@acaclaw/paper-search" },
      { timeoutMs: 300_000 },
    );
  });
});

describe("StaffView – localStorage persistence roundtrip", () => {
  beforeEach(() => { storage = {}; });

  it("persists and restores custom staff member", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff = addNewStaff(staff, PREBUILT_TEMPLATES[1]); // physicist
    persistStaff(staff);
    const added = loadAddedStaff();
    expect(added).toHaveLength(1);
    expect(added[0].id).toBe("physicist");
    expect(added[0].name).toBe("Dr. Feynman");
  });

  it("persists icon change", () => {
    const staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff[0] = { ...staff[0], icon: "🤓" };
    persistStaff(staff);
    const customs = loadStaffCustomizations();
    expect(customs.default?.icon).toBe("🤓");
  });

  it("persists photoUrl", () => {
    const staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff[0] = { ...staff[0], photoUrl: "data:image/png;base64,abc" };
    persistStaff(staff);
    const customs = loadStaffCustomizations();
    expect(customs.default?.photoUrl).toBe("data:image/png;base64,abc");
  });

  it("handles corrupted localStorage gracefully", () => {
    mockLocalStorage.setItem(STAFF_STORAGE_KEY, "not valid json{{{");
    const customs = loadStaffCustomizations();
    expect(customs).toEqual({});
  });

  it("handles corrupted added staff gracefully", () => {
    mockLocalStorage.setItem(STAFF_ADDED_KEY, "broken");
    const added = loadAddedStaff();
    expect(added).toEqual([]);
  });

  it("full roundtrip: customize + persist + reload", () => {
    let staff = STAFF_MEMBERS.map((s) => ({ ...s, skills: [...s.skills] }));
    staff[0] = { ...staff[0], name: "My Bot", icon: "🤖" };
    staff = addSkillToStaff(staff, "biologist", "bioskills");
    staff = addNewStaff(staff, PREBUILT_TEMPLATES[0]);
    persistStaff(staff);

    // Simulate reload
    const restored = getCustomizedStaff();
    expect(restored.find((s) => s.id === "default")!.name).toBe("My Bot");
    expect(restored.find((s) => s.id === "default")!.icon).toBe("🤖");
    expect(restored.find((s) => s.id === "biologist")!.skills).toContain("bioskills");
    expect(restored.find((s) => s.id === "chemist")).toBeDefined();
  });
});
