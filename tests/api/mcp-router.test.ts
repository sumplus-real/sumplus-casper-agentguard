const BASE = "http://localhost:3000";

const KNOWN_SKILL_ID = "ac6ac13c-e04a-441d-ac0f-ae80231aad2d"; // SUI Blockchain Toolkit

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── POST /mcp ─────────────────────────────────────────────────────────────────

describe("POST /mcp — skills/list", () => {
  it("returns skills list", async () => {
    const { status, body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/list", params: {} }),
    });
    expect(status).toBe(200);
    expect(body.result.skills).toBeDefined();
    expect(body.result.count).toBeGreaterThan(0);
  });

  it("filters by category", async () => {
    const { body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/list", params: { category: "Blockchain" } }),
    });
    body.result.skills.forEach((s: { category: string }) => expect(s.category).toBe("Blockchain"));
  });

  it("vector search via MCP", async () => {
    const { status, body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/list", params: { search: "blockchain wallet" } }),
    });
    expect(status).toBe(200);
    expect(body.result.skills.length).toBeGreaterThan(0);
  });

  it("respects limit param", async () => {
    const { body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/list", params: { limit: 1 } }),
    });
    expect(body.result.skills.length).toBeLessThanOrEqual(1);
  });
});

describe("POST /mcp — skills/get", () => {
  it("returns skill by id", async () => {
    const { status, body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/get", params: { id: KNOWN_SKILL_ID } }),
    });
    expect(status).toBe(200);
    expect(body.result.skill.id).toBe(KNOWN_SKILL_ID);
  });

  it("returns 404 error for unknown skill", async () => {
    const { body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/get", params: { id: "00000000-0000-0000-0000-000000000000" } }),
    });
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32001);
  });

  it("returns error when id missing", async () => {
    const { body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/get", params: {} }),
    });
    expect(body.error).toBeDefined();
  });
});

describe("POST /mcp — skills/execute", () => {
  it("executes a skill and returns result", async () => {
    const { status, body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({
        method: "skills/execute",
        params: { skill_id: KNOWN_SKILL_ID, input: { action: "test" } },
      }),
    });
    expect(status).toBe(200);
    expect(body.result.result).toBeDefined();
  });

  it("returns method-not-found error for unknown method", async () => {
    const { body } = await api("/mcp", {
      method: "POST",
      body: JSON.stringify({ method: "skills/unknown_method", params: {} }),
    });
    expect(body.error.code).toBe(-32601);
  });

  it("returns -32600 for invalid request body", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });
});

// ── POST /api/router ──────────────────────────────────────────────────────────

describe("POST /api/router — action: search", () => {
  it("returns all skills when no query", async () => {
    const { status, body } = await api("/api/router", {
      method: "POST",
      body: JSON.stringify({ action: "search" }),
    });
    expect(status).toBe(200);
    expect(body.action).toBe("search");
    expect(Array.isArray(body.skills)).toBe(true);
  });

  it("vector search via router", async () => {
    const { body } = await api("/api/router", {
      method: "POST",
      body: JSON.stringify({ action: "search", query: "sui blockchain" }),
    });
    expect(body.skills.length).toBeGreaterThan(0);
  });
});

describe("POST /api/router — action: get", () => {
  it("returns skill details", async () => {
    const { status, body } = await api("/api/router", {
      method: "POST",
      body: JSON.stringify({ action: "get", skill_id: KNOWN_SKILL_ID }),
    });
    expect(status).toBe(200);
    expect(body.skill.id).toBe(KNOWN_SKILL_ID);
  });

  it("returns 400 when skill_id missing", async () => {
    const { status } = await api("/api/router", {
      method: "POST",
      body: JSON.stringify({ action: "get" }),
    });
    expect(status).toBe(400);
  });
});

describe("POST /api/router — action: execute", () => {
  it("executes skill via router", async () => {
    const { status, body } = await api("/api/router", {
      method: "POST",
      body: JSON.stringify({ action: "execute", skill_id: KNOWN_SKILL_ID, input: {} }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 400 for invalid action", async () => {
    const { status } = await api("/api/router", {
      method: "POST",
      body: JSON.stringify({ action: "invalid_action" }),
    });
    expect(status).toBe(400);
  });
});
