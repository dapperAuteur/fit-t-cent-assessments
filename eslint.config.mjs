import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Copied byte-for-byte from gemini/witus/lib/analytics (the ecosystem PostHog standard), so it
    // is exempted here rather than edited: a local edit would drift from the canonical copy. The
    // synchronous setReady(true) only runs when PostHog was already initialised (one extra render).
    files: ["src/lib/analytics/posthog-provider.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    // The static slow-motion test page is deployed by its own Vercel project (Root Directory
    // `spike/`) and is retired once /lab covers it. Plain browser JS, not part of this app.
    "spike/**",
    // Research harnesses with their own package.json; not app code.
    "docs/**",
  ]),
]);

export default eslintConfig;
