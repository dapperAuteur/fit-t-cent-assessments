#!/usr/bin/env node
/**
 * Copy rules for user-facing text (run by `pnpm lint`, so CI fails on a regression):
 *
 * - No em or en dashes (shared UI/UX/DX rule 6).
 * - None of the shared stock words (delve, crucial, vital, seamless, myriad, revolutionary,
 *   game-changing, powerful).
 * - None of this app's banned names and claims (CLAUDE.md, "Naming and copy rules"): "NASM
 *   assessment", "FMS score", "AI coach", "injury risk", "accurate to".
 *
 * Scope: the locale dictionaries (where every user-facing string should live) and the TSX under
 * src/app and src/components. The Rise Wellness callout is exempt from the dash rule only: it is
 * partner-vetted copy pasted verbatim from the ecosystem footer recipe ("Mon–Sat").
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DASH_EXEMPT = new Set(["src/components/rise-wellness-callout.tsx"]);

const RULES = [
  { name: "em or en dash", pattern: /[–—]/, dash: true },
  {
    name: "stock word",
    pattern: /\b(delve|crucial|vital|seamless|myriad|revolutionary|game-changing|powerful)\b/i,
  },
  { name: "banned name or claim", pattern: /\b(NASM assessment|FMS score|AI coach|injury risk|accurate to)\b/i },
];

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

const files = [
  ...walk(join(ROOT, "src/dictionaries"), (n) => n.endsWith(".json")),
  ...walk(join(ROOT, "src/app"), (n) => n.endsWith(".tsx")),
  ...walk(join(ROOT, "src/components"), (n) => n.endsWith(".tsx")),
];

const problems = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.dash && DASH_EXEMPT.has(rel)) continue;
      const match = line.match(rule.pattern);
      if (match) problems.push(`${rel}:${i + 1}  ${rule.name}: "${match[0]}"`);
    }
  });
}

if (problems.length) {
  console.error(`check-copy: ${problems.length} problem(s)\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`check-copy: ${files.length} files clean`);
