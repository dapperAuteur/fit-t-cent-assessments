import { existsSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

/**
 * The Playwright run signs in with the development magic link: the server runs with
 * E2E_DEV_SIGN_IN=1 (never possible on Vercel; src/lib/runtime-env.ts) and appends each link to
 * MAGIC_LINK_LOG, which the tests read back. playwright.config.ts passes these paths to the server
 * and wipes E2E_DATA_DIR before it starts, so every run begins with an empty PGlite database.
 */
export const E2E_DATA_DIR = ".data/e2e";
export const E2E_PGLITE_DIR = `${E2E_DATA_DIR}/pglite`;
export const MAGIC_LINK_LOG = `${E2E_DATA_DIR}/magic-links.jsonl`;

/** A fresh address per call, so parallel tests never share an account. */
export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
}

async function readLink(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(MAGIC_LINK_LOG)) {
      const entries = readFileSync(MAGIC_LINK_LOG, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { email: string; url: string });
      const mine = entries.filter((e) => e.email === email).at(-1);
      if (mine) return mine.url;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`no development sign-in link for ${email} in ${MAGIC_LINK_LOG}`);
}

/** Signs in through the real form on /{lang}/sign-in and follows the link; lands on /welcome. */
export async function signInWithDevLink(page: Page, email: string, lang: "en" | "es" = "en"): Promise<void> {
  await page.goto(`/${lang}/sign-in`);
  await page.getByLabel(lang === "en" ? "Email address" : "Correo electrónico").fill(email);
  await page
    .getByRole("button", { name: lang === "en" ? "Email me a sign-in link" : "Enviarme un enlace para iniciar sesión" })
    .click();
  await expect(page.getByRole("status").filter({ hasText: lang === "en" ? "Link created" : "Enlace creado" })).toBeVisible();
  await page.goto(await readLink(email));
  await page.waitForURL(new RegExp(`/${lang}/welcome$`));
}
