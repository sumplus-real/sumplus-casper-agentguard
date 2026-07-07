const BASE = "http://localhost:3000";

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// Use unique email per test run to avoid conflicts
const RUN_ID = Date.now();
const TEST_EMAIL = `testuser-${RUN_ID}@example-test.dev`;
const TEST_PASSWORD = "TestPass123!";
let authToken = "";
let userId = "";

// ── POST /api/auth/signup ────────────────────────────────────────────────────

describe("POST /api/auth/signup", () => {
  it("creates a new user successfully", async () => {
    const { status, body } = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, role: "user" }),
    });
    expect(status).toBe(201);
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.id).toBeDefined();
    userId = body.user.id;
  });

  it("rejects duplicate email", async () => {
    const { status } = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const { status, body } = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: TEST_PASSWORD }),
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("rejects password shorter than 8 chars", async () => {
    const { status } = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: `short-${RUN_ID}@example-test.dev`, password: "abc" }),
    });
    expect(status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const res = await fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const { status, body } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(status).toBe(200);
    expect(body.session?.access_token).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);
    authToken = body.session.access_token;
  });

  it("rejects wrong password", async () => {
    const { status } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: "wrongpassword" }),
    });
    expect(status).toBe(401);
  });

  it("rejects unknown email", async () => {
    const { status } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `nobody-${RUN_ID}@example-test.dev`, password: TEST_PASSWORD }),
    });
    expect(status).toBe(401);
  });
});

// ── Auth token for downstream tests ─────────────────────────────────────────

// Export token for use in other test files if needed
export { authToken, userId, TEST_EMAIL };
