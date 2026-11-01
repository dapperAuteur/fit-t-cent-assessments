import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Unit tests sit next to the code they cover. Playwright specs (tests/e2e) and the spike's
    // own harness (spike/dev) are deliberately outside this glob.
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
  },
});
