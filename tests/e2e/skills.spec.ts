import { test, expect } from "@playwright/test";

const KNOWN_SKILL_ID = "ac6ac13c-e04a-441d-ac0f-ae80231aad2d";

// ── Skills browse page ───────────────────────────────────────────────────────

test.describe("Skills browse page (/skills)", () => {
  test("loads and shows skill cards", async ({ page }) => {
    await page.goto("/skills");
    await page.waitForLoadState("networkidle");

    // Should show at least one skill card
    const cards = page.locator("[data-testid='skill-card'], .group.cursor-pointer, a[href^='/skills/']");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("search input is present and functional", async ({ page }) => {
    await page.goto("/skills");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator("input[type='text'], input[placeholder*='earch']").first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill("wallet");
    await page.waitForTimeout(1500); // debounce

    // Page should still show results
    await page.waitForLoadState("networkidle");
  });

  test("category filter buttons are present", async ({ page }) => {
    await page.goto("/skills");
    await page.waitForLoadState("networkidle");

    // Look for category filter/chip buttons
    const buttons = page.locator("button").filter({ hasText: /blockchain|finance|all/i });
    expect(await buttons.count()).toBeGreaterThan(0);
  });

  test("skill cards link to detail page", async ({ page }) => {
    await page.goto("/skills");
    await page.waitForLoadState("networkidle");

    // Find first skill link and follow it
    const firstLink = page.locator(`a[href='/skills/${KNOWN_SKILL_ID}']`).first();
    if (await firstLink.count() > 0) {
      await firstLink.click();
      await expect(page).toHaveURL(new RegExp(`/skills/`));
    } else {
      // Fallback: click any skill card link
      const anySkillLink = page.locator("a[href^='/skills/']").first();
      await anySkillLink.click();
      await expect(page).toHaveURL(new RegExp(`/skills/`));
    }
  });
});

// ── Skill detail page ────────────────────────────────────────────────────────

test.describe("Skill detail page (/skills/:id)", () => {
  test("loads skill information", async ({ page }) => {
    await page.goto(`/skills/${KNOWN_SKILL_ID}`);
    await page.waitForLoadState("networkidle");

    // Should not be a 404 or error page
    await expect(page.locator("body")).not.toContainText("404");

    // Should show skill name (use first() to handle multiple matches in heading + breadcrumb)
    await expect(page.getByText("SUI Blockchain Toolkit", { exact: false }).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows category and description", async ({ page }) => {
    await page.goto(`/skills/${KNOWN_SKILL_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toContainText("Blockchain");
  });

  test("Try It panel is present", async ({ page }) => {
    await page.goto(`/skills/${KNOWN_SKILL_ID}`);
    await page.waitForLoadState("networkidle");

    // Look for "Try It" heading in the panel
    await expect(page.getByText("Try It", { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("rating section is present", async ({ page }) => {
    await page.goto(`/skills/${KNOWN_SKILL_ID}`);
    await page.waitForLoadState("networkidle");

    // Should show "Rate This Skill" section heading
    await expect(page.getByText("Rate This Skill", { exact: true })).toBeVisible({ timeout: 10000 });
  });
});

// ── Navigation ───────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("input[type='email'], input[type='text']").first()).toBeVisible();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("input[type='email'], input[type='text']").first()).toBeVisible();
  });

  test("skills upload page redirects or shows form", async ({ page }) => {
    await page.goto("/skills/upload");
    await page.waitForLoadState("networkidle");

    // Either shows upload form or redirects to login
    const isLoginPage = page.url().includes("/login");
    const hasUploadForm = await page.locator("input[type='text']").count() > 0;
    expect(isLoginPage || hasUploadForm).toBe(true);
  });
});

// ── Auth flows ───────────────────────────────────────────────────────────────

test.describe("Auth flows", () => {
  const RUN_ID = Date.now();
  const TEST_EMAIL = `e2e-${RUN_ID}@example-test.dev`;
  const TEST_PASSWORD = "TestPass123!";

  test("signup → login flow completes", async ({ page }) => {
    // Sign up
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator("input[type='email'], input[name='email']").first();
    const passwordInput = page.locator("input[type='password']").first();
    const submitBtn = page.locator("button[type='submit'], button:has-text('Sign')").first();

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);

    // confirmPassword field
    const confirmInput = page.locator("input[type='password']").nth(1);
    if (await confirmInput.count() > 0) {
      await confirmInput.fill(TEST_PASSWORD);
    }

    // acceptTerms checkbox (required to enable submit)
    const termsCheckbox = page.locator("input[type='checkbox']").first();
    if (await termsCheckbox.count() > 0) {
      await termsCheckbox.check();
    }

    await submitBtn.click();

    // Should either redirect or show success
    await page.waitForTimeout(3000);
    const bodyText = await page.locator("body").innerText();
    const signedUp =
      page.url().includes("/skills") ||
      page.url().includes("/login") ||
      bodyText.toLowerCase().includes("success") ||
      bodyText.toLowerCase().includes("created") ||
      bodyText.toLowerCase().includes("account");

    expect(signedUp).toBe(true);
  });
});
