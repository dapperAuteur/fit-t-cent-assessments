import { expect, test } from "@playwright/test";
import { PAGES } from "./pages";

/** Shared UI/UX/DX: no horizontal scroll at 320 px wide or more. */
for (const width of [320, 375]) {
  for (const path of PAGES) {
    test(`${path} has no sideways scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("header controls are at least 44 px tall", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/en");
  for (const link of await page.getByRole("banner").getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
