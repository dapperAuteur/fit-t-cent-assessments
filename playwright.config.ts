import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, accessibility and layout checks against the PRODUCTION build (`next start`), so the
 * security headers and CSP under test are the ones Vercel serves. Locally the web server builds
 * first; CI builds in its own step and only starts the server.
 *
 * @playwright/test is pinned to an exact version on purpose (same as vogoat): 1.62 dropped browser
 * builds for macOS 13, the development machine. Bump it deliberately, not by caret drift.
 */
const PORT = 3070;
const BASE_URL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: isCI ? "pnpm start" : "pnpm build && pnpm start",
    url: `${BASE_URL}/en`,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
