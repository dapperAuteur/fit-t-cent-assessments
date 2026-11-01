import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES } from "./pages";

/**
 * axe over every page, in light and dark, plus the 404 page. Any WCAG 2.x A/AA violation fails.
 * The canvas overlay (phase 5b) needs its own contrast unit test; axe cannot read canvas pixels.
 */
const SCHEMES = ["light", "dark"] as const;

for (const scheme of SCHEMES) {
  for (const path of [...PAGES, "/en/missing-page"]) {
    test(`axe: ${path} (${scheme}) has no WCAG A/AA violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.locator("#main")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), ${v.help}`);
      expect(summary).toEqual([]);
    });
  }
}

test("the first Tab reaches the skip link, and it moves focus to main", async ({ page }) => {
  await page.goto("/en");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
