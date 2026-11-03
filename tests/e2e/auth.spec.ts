import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInWithDevLink, uniqueEmail } from "./dev-sign-in";

/**
 * Sign in, the /welcome step, and sign out, against the production build with the development
 * magic link (build plan 5.2 row 1b: "Dev sign-in by magic link works end to end").
 */

async function expectNoAxeViolations(page: Page) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${scheme}: ${v.id} (${v.impact}) ${v.help}`)).toEqual([]);
  }
}

async function expectNoSidewaysScroll(page: Page) {
  await page.setViewportSize({ width: 320, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 720 });
}

test.describe("sign in, welcome and sign out", () => {
  test("an adult signs in, answers both questions, lands home signed in, and signs out @smoke", async ({ page }) => {
    await signInWithDevLink(page, uniqueEmail("adult"));
    const banner = page.getByRole("banner");

    // Step 1: age. Accessible, no sideways scroll at 320 px.
    await expect(page.getByRole("heading", { level: 1, name: "One question first" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Are you 18 or older?" })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoSidewaysScroll(page);
    await page.getByRole("button", { name: "Yes, I am 18 or older" }).click();

    // Step 2: role.
    await expect(page.getByRole("heading", { level: 1, name: "How will you use it?" })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoSidewaysScroll(page);
    await page.getByRole("radio", { name: "Coach: I analyze clips of adult athletes I coach" }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Home, signed in: the header control is Sign out.
    await page.waitForURL(/\/en$/);
    await expect(banner.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);

    // The welcome step is first sign-in only; the sign-in page sends a signed-in visitor on.
    await page.goto("/en/welcome");
    await page.waitForURL(/\/en$/);
    await page.goto("/en/sign-in");
    await page.waitForURL(/\/en$/);

    // Sign out ends this app's session and stays on this origin.
    await banner.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/en$/);
    await expect(banner.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await page.goto("/en/welcome");
    await page.waitForURL(/\/en\/sign-in$/);
  });

  test("answering under 18 signs out and keeps nothing; signing in again starts over", async ({ page }) => {
    const email = uniqueEmail("minor");
    await signInWithDevLink(page, email);
    await page.getByRole("button", { name: "No, I am under 18" }).click();

    await page.waitForURL(/\/en\/adults-only$/);
    await expect(page.getByRole("heading", { level: 1, name: "For adults for now" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expectNoAxeViolations(page);

    // The row was deleted, so the same address is a brand-new account: the age question again.
    await signInWithDevLink(page, email);
    await expect(page.getByRole("heading", { level: 1, name: "One question first" })).toBeVisible();
  });

  test("the Spanish flow works end to end", async ({ page }) => {
    await page.goto("/es/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();
    await page.getByLabel("Correo electrónico").fill(uniqueEmail("es"));
    await page.getByRole("button", { name: "Enviarme un enlace para iniciar sesión" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Enlace creado" })).toBeVisible();
  });
});

test.describe("sign-in page", () => {
  test("without the WitUS client configured, the WitUS button is hidden and the development form shows", async ({ page }) => {
    await page.goto("/en/sign-in");
    await expect(page.getByRole("button", { name: "Sign in with WitUS" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Development sign-in" })).toBeVisible();
  });

  test("a failed sign-in shows an alert", async ({ page }) => {
    await page.goto("/en/sign-in?error=invalid_code");
    // Scoped by text: the page can hold more than one role="alert" (the development form's own message
    // slot, Next's route announcer), and an unscoped getByRole("alert") fails strict mode on CI.
    await expect(page.getByRole("alert").filter({ hasText: "Sign in did not finish. Try again." })).toBeVisible();
  });

  test("/welcome sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/en/welcome");
    await page.waitForURL(/\/en\/sign-in$/);
  });
});

test.describe("WitUS callback shim", () => {
  test("the registered callback path 307s to Better Auth's core callback with the query intact", async ({ request }) => {
    const response = await request.get("/api/auth/oauth2/callback/witus?code=abc&state=xyz", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location ?? "", "http://x").pathname).toBe("/api/auth/callback/witus");
    expect(response.headers().location).toContain("code=abc&state=xyz");
  });
});
