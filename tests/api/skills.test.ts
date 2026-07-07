const BASE = "http://localhost:3000";
const NO_PROXY = { agent: undefined }; // ensure no proxy interference

// Known seeded skill IDs
const KNOWN_SKILL_ID = "ac6ac13c-e04a-441d-ac0f-ae80231aad2d"; // SUI Blockchain Toolkit
const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── GET /api/skills ──────────────────────────────────────────────────────────

describe("GET /api/skills", () => {
  it("returns paginated skills list", async () => {
    const { status, body } = await api("/api/skills");
    expect(status).toBe(200);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
    expect(typeof body.total_pages).toBe("number");
  });

  it("returns at least 3 seeded skills", async () => {
    const { body } = await api("/api/skills?limit=100");
    expect(body.skills.length).toBeGreaterThanOrEqual(3);
  });

  it("filters by category", async () => {
    const { status, body } = await api("/api/skills?category=Blockchain");
    expect(status).toBe(200);
    body.skills.forEach((s: { category: string }) => expect(s.category).toBe("Blockchain"));
  });

  it("sorts by rating_avg descending", async () => {
    const { body } = await api("/api/skills?sort=rating_avg&order=desc");
    const ratings = body.skills.map((s: { rating_avg: number }) => s.rating_avg);
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i - 1]).toBeGreaterThanOrEqual(ratings[i]);
    }
  });

  it("vector search: returns relevant results for 'wallet'", async () => {
    const { status, body } = await api("/api/skills?search=wallet");
    expect(status).toBe(200);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBeGreaterThan(0);
    // Top result should be wallet-related
    const topName: string = body.skills[0].name.toLowerCase();
    expect(topName).toMatch(/wallet|crypto|blockchain|sui/i);
  });

  it("vector search: semantic match 'passive income yield'", async () => {
    const { status, body } = await api("/api/skills?search=passive+income+yield");
    expect(status).toBe(200);
    expect(body.skills.length).toBeGreaterThan(0);
  });

  it("respects pagination limit", async () => {
    const { body } = await api("/api/skills?limit=2");
    expect(body.skills.length).toBeLessThanOrEqual(2);
  });
});

// ── GET /api/skills/:id ──────────────────────────────────────────────────────

describe("GET /api/skills/:id", () => {
  it("returns skill by ID", async () => {
    const { status, body } = await api(`/api/skills/${KNOWN_SKILL_ID}`);
    expect(status).toBe(200);
    expect(body.skill.id).toBe(KNOWN_SKILL_ID);
    expect(body.skill.name).toBeDefined();
    expect(body.skill.description).toBeDefined();
    expect(body.skill.category).toBeDefined();
  });

  it("includes ratings array", async () => {
    const { body } = await api(`/api/skills/${KNOWN_SKILL_ID}`);
    expect(Array.isArray(body.skill.ratings)).toBe(true);
  });

  it("returns 404 for nonexistent skill", async () => {
    const { status } = await api(`/api/skills/${NONEXISTENT_ID}`);
    expect(status).toBe(404);
  });
});

// ── GET /api/categories ──────────────────────────────────────────────────────

describe("GET /api/categories", () => {
  it("returns category list", async () => {
    const { status, body } = await api("/api/categories");
    expect(status).toBe(200);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThan(0);
  });

  it("includes Blockchain category", async () => {
    const { body } = await api("/api/categories");
    // categories is a string array: ["Blockchain", "Finance", ...]
    expect(body.categories).toContain("Blockchain");
  });
});

// ── GET /api/functions ───────────────────────────────────────────────────────

describe("GET /api/functions", () => {
  it("returns OpenAI-compatible function definitions", async () => {
    const { status, body } = await api("/api/functions");
    expect(status).toBe(200);
    expect(Array.isArray(body.functions)).toBe(true);
    body.functions.forEach((f: { type: string; function: { name: string; description: string } }) => {
      expect(f.type).toBe("function");
      expect(f.function.name).toMatch(/^[a-z0-9_-]{1,64}$/);
      expect(typeof f.function.description).toBe("string");
    });
  });
});
