# Vitest flake: drive letter leaks into an `import.meta.glob` import path (Windows)

## Symptom (the trigger)

A test file fails to **collect** (a whole-file load error, *not* a test assertion
failure) with something like:

```
Failed to resolve import "../../../../../c:/projects/recipe-viewer/src/app/api/auth/login/route.ts"
  from "src/__tests__/route-auth-policy.test.ts". Does the file exist?
  Plugin: vite:import-analysis
```

Fingerprints that make it *this* bug and not a real missing import:

- The specifier is a **relative path (`../…`) with an embedded drive letter** (`c:/…`
  or `C:/…`). A valid relative import never contains a drive letter — that only
  happens when a relativization failed.
- It's **intermittent**, and it usually only bites from the **husky `pre-push`
  hook** (`yarn test:run`), while the same suite passes when you run `yarn test` /
  `yarn vitest` directly. The vitest RUN banner in the failing run shows a
  **lowercase** `c:/projects/...`; passing runs show uppercase `C:/projects/...`.
- Re-running the push often just works (see "It's known-flaky" below).

## Root cause

`import.meta.glob("/src/app/api/**/route.ts")` (an **absolute-root** glob) is
compiled by Vite into one lazy `import()` per match, and Vite computes each
specifier as `posix.relative(importerDir, matchedFile)` (vite 7.x,
`node_modules/vite/dist/node/chunks/config.js`, the `importPath = relative$2(dir, file)`
line in the glob transform).

For an **absolute** glob those two operands come from *different origins*:

- `importerDir` — from the module graph (the importing test file's id)
- `matchedFile` — from crawling the **project root**

On Windows those origins can disagree on **drive-letter case**. Husky runs the
pre-push hook through git-bash / MSYS, which normalizes cwd to lowercase `c:`,
while the module graph keeps the on-disk `C:`. `posix.relative` treats `C:/…` and
`c:/…` as different first segments (posix has no drive concept — `:` is just a
character), so it can't relativize across them: it climbs all the way out with
`../`s and then re-appends the full absolute target, drive letter and all.

Proof (the exact error string, reproduced with Vite's actual function):

```js
require("path").posix.relative(
  "C:/projects/recipe-viewer/src/__tests__",
  "c:/projects/recipe-viewer/src/app/api/auth/login/route.ts"
)
// => "../../../../../c:/projects/recipe-viewer/src/app/api/auth/login/route.ts"
```

Matched case (both upper **or** both lower) → clean `../app/api/.../route.ts`.

## The durable fix (already applied to `route-auth-policy.test.ts`)

Write the glob **relative to the test file** instead of absolute-root:

```diff
- const routeModules = import.meta.glob("/src/app/api/**/route.ts");
+ const routeModules = import.meta.glob("../app/api/**/route.ts");
```

A relative glob takes Vite's `isRelative` branch, where **both** `relative()`
operands are resolved from the importing file's own id — so their drive-letter
case always matches and no drive letter can leak into the specifier. This is
provable from the Vite source and does not depend on any cwd/root casing.

Because the glob keys change from `/src/app/...` to `../app/...`, keep key parsing
**base-form-agnostic**: anchor on `/api/` rather than stripping a `^/src/app`
prefix, and drive the loader lookup from a `route path → loader` map so nothing
depends on the raw key string. See `src/__tests__/route-auth-policy.test.ts` for
the pattern (commit `f379e5a`).

## If you hit it in a NEW test file

1. **Don't panic-investigate a red pre-push first — re-run the push.** It's a
   low-probability race (see below) and frequently clears on the second attempt.
   Only dig in if it repeats.
2. Check the failing file for an **absolute-root `import.meta.glob("/src/…")`**.
   Convert it to a **relative** glob (`../…` from the test file). Adjust any key
   parsing to anchor on a stable path segment (e.g. `/api/`) rather than a
   `^/src/...` prefix.
3. **Confirm the fix** by inspecting the generated specifiers — they must all be
   `../…` with **no** `:` drive letter. Quick check:

   ```bash
   node -e '
   const {createServer}=require("vite"), react=require("@vitejs/plugin-react").default, path=require("path");
   (async()=>{const s=await createServer({configFile:false,root:process.cwd(),plugins:[react()],
     resolve:{alias:{"@":path.resolve(process.cwd(),"src")}},server:{middlewareMode:true},logLevel:"silent"});
     const r=await s.transformRequest("/src/__tests__/<your-file>.test.ts"); await s.close();
     const specs=[...r.code.matchAll(/import\(("[^"]+")\)/g)].map(m=>JSON.parse(m[1])).filter(x=>x.includes("route.ts"));
     console.log("leaking:", specs.filter(x=>/:[\\/]/.test(x)).length, "/", specs.length);})()'
   ```

   (The throwaway server occasionally errors on esbuild teardown at `.close()` —
   harmless; read the printed count, not the exit code.)
4. **Reproduction is unreliable** — the case divergence is a race and may not fire
   in dozens of runs. Verify by *construction* (the specifiers above are clean) plus
   *no regression* (full suite + `yarn typecheck`), not by watching the failure
   disappear.

## Alternative fix (weaker — prefer the relative glob)

Pinning vitest's `root` to the canonical on-disk case in `vitest.config.ts`:

```ts
import fs from "fs";
// ...
test: { root: fs.realpathSync.native(__dirname), /* ... */ }
```

removes the lowercase-cwd source so both origins canonicalize to `C:`. It keeps the
test untouched, but its correctness leans on an **unverified assumption** about how
vitest cases importer ids relative to `root` — if vitest derives importer ids
independently of `root`, this can shift the mismatch rather than remove it. Only
reach for it if a relative glob genuinely isn't workable.

## It's known-flaky — don't over-invest

This is a rare race, not a hard regression. The one confirmed occurrence fired on a
pre-push right after `yarn add` invalidated Vite's cache (a cold glob transform).
A re-push almost always succeeds. If a red pre-push shows this exact signature and
the file already uses a relative glob, just re-run — it is not a code change of
yours breaking.
