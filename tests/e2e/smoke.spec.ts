import { expect, test } from "@playwright/test";

test.describe("header Sign in control", () => {
  // Shared UI/UX/DX "Sign-in control" rule: a rename to anything else must fail this test.
  test("home page header shows a link named exactly 'Sign in' @smoke", async ({ page }) => {
    await page.goto("/en");
    const signIn = page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/en/sign-in");
  });

  test("the Sign in link leads to the sign-in page @smoke", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
});

test.describe("locale routing", () => {
  test("the bare domain redirects to English by default @smoke", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("a Spanish browser lands on /es", async ({ browser }) => {
    const context = await browser.newContext({ locale: "es-MX", extraHTTPHeaders: { "Accept-Language": "es-MX,es;q=0.9" } });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("banner").getByRole("link", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await context.close();
  });

  test("a locale-less path keeps its path", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });

  test("the language link switches to Spanish and back", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("link", { name: "Español" }).click();
    await expect(page).toHaveURL(/\/es$/);
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("an unknown page under a locale is a localized 404", async ({ page }) => {
    const response = await page.goto("/es/no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  });
});

test.describe("required copy", () => {
  test("every page carries the not-affiliated footer line", async ({ page }) => {
    await page.goto("/en");
    await expect(
      page.getByRole("contentinfo").getByText("Not affiliated with or endorsed by NASM or Functional Movement Systems."),
    ).toBeVisible();
    await page.goto("/es");
    await expect(page.getByRole("contentinfo").getByText(/No está afiliado a NASM/)).toBeVisible();
  });
});

test.describe("security headers", () => {
  test("pages send the site CSP with connect-src 'self' @smoke", async ({ request }) => {
    const response = await request.get("/en");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("connect-src 'self';");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("analysis routes send the media CSP (connect-src 'self' blob: data:)", async ({ request }) => {
    const response = await request.get("/en/assess/hurdle-clearance");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("connect-src 'self' blob: data:");
    expect(csp).toContain("worker-src 'self' blob:");
  });

  test("the landing page makes no request off this origin", async ({ page, baseURL }) => {
    const offOrigin: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (!["data:", "blob:"].includes(url.protocol) && url.origin !== baseURL) offOrigin.push(req.url());
    });
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    expect(offOrigin).toEqual([]);
  });
});
