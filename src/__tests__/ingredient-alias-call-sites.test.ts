// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The deterministic gate for the "exactly two alias-mutation call sites"
// invariant.
//
// Associating a recipe line with a catalog ingredient must accrete that line's
// name_text onto the ingredient's aliases — and un-associating it (a USER
// action only) must strip it. If that bookkeeping is scattered across the
// codebase it silently drifts: a new path forgets to accrete, or an automated
// path starts pruning, and nothing fails. So there are exactly two places
// allowed to mutate aliases:
//
//   1. the normalization graph's persist node — covers every association the
//      matcher can produce (auto-accept, adjudicated, novel-from-USDA, manual
//      carried forward), batched per ingredient;
//   2. the manual re-point route — the only place a user's "these are not
//      synonymous" verdict can prune.
//
// Notably importUsdaIngredient is NOT on this list, and must not be added: both
// of its callers re-point a line immediately afterwards, so the sites above
// already cover it. That is what keeps the invariant structural rather than a
// matter of convention.
//
// If this test fails, do not add the offending file to the allowlist to make it
// green. Route the association through one of the two sites instead.
const ALLOWED_MUTATION_CALL_SITES = [
  "lib/normalization/graph.ts",
  "app/api/recipes/[id]/ingredients/[riId]/route.ts",
].sort();

// The pure helpers are deliberately exempt: they carry no side effects and are
// meant to be used anywhere an embedding is generated for an ingredient.
const MUTATION_EXPORTS = [
  "addAliasesAndReembed",
  "removeAliasAndReembed",
  "accreteAliasesFromLines",
];

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Read file TEXT rather than import.meta.glob-ing the modules: loading a real
// module graph inside a test risks both the Windows drive-letter glob flake and
// the 5s per-test timeout on a cold transform (see the project CLAUDE.md).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function importsMutationExport(source: string): boolean {
  // Matches the import statement (single- or multi-line) that pulls from the
  // alias module, then looks for a mutation export among its named bindings.
  const importMatch = source.match(
    /import\s*\{([^}]*)\}\s*from\s*["'](?:@\/lib\/ingredientAliases|\.\/ingredientAliases)["']/s,
  );
  if (!importMatch) return false;
  const bindings = importMatch[1];
  return MUTATION_EXPORTS.some((name) => new RegExp(`\\b${name}\\b`).test(bindings));
}

describe("ingredient alias mutation call sites", () => {
  it("is confined to the two sanctioned sites", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => importsMutationExport(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .sort();

    // A third call site means an association is being recorded somewhere that
    // bypasses persist/PATCH. See the comment at the top of this file.
    expect(offenders).toEqual(ALLOWED_MUTATION_CALL_SITES);
  });
});
