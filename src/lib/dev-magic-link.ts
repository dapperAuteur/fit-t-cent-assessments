import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Where the development sign-in link goes, since this app sends no email. Only ever called when
 * `devSignInEnabled` is true (never on Vercel; src/lib/runtime-env.ts).
 *
 * - The link prints to the server console, the vogoat pattern, for `pnpm dev`.
 * - It is also appended to a local file (`DEV_MAGIC_LINK_LOG`, default .data/dev-magic-links.jsonl,
 *   gitignored) with the address it was requested for, so the Playwright run can read it back.
 *   Test and development addresses only: this code path does not exist on a deployment.
 */
export function deliverDevMagicLink({ email, url }: { email: string; url: string }): void {
  console.log(`\n[dev sign-in] Open this link to sign in (development only):\n  ${url}\n`);
  const file = process.env.DEV_MAGIC_LINK_LOG ?? "./.data/dev-magic-links.jsonl";
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ email, url, at: new Date().toISOString() })}\n`);
  } catch (error: unknown) {
    console.error("[dev sign-in] could not write the link file:", error instanceof Error ? error.constructor.name : "unknown");
  }
}
