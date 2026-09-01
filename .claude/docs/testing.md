# Test Performance

Vitest's per-test timeout is 5s. **Don't cold-load a real (unmocked) module graph inside a timed `it`/`it.each` body** — e.g. invoking `import.meta.glob` loaders, or `await import()` of a module that isn't `vi.mock`'d or statically imported at the top of the file. That triggers a cold transform + load of the whole dependency graph inside the timed case, which under full-suite parallel load can exceed 5s and surface as a flaky `Test timed out in 5000ms` (the failure is reported at the `it.each` call site, which makes it look like a different test).

- **Hoist** such loads into `beforeAll` (with a generous hook timeout, e.g. `beforeAll(fn, 30000)`) and keep each test body to invoke + assert.
- The common `await import("@/lib/x")` to read a `vi.mock`'d module is **warm and fine** — the mock factory runs at file eval, so the import returns the cached mock instantly.
- Statically importing the module-under-test at the top of the file is also fine: its graph loads during vitest's *collect* phase, which isn't bound by the per-test timeout.
- Reference: `src/__tests__/route-auth-policy.test.ts` preloads every route handler in `beforeAll`, then each case just invokes the preloaded handler.

## Known flake

A test file that fails to *collect* with `Failed to resolve import "../../../c:/…"` is the Windows drive-letter glob flake — full diagnosis and fix in [../troubleshooting/vite-glob-drive-letter.md](../troubleshooting/vite-glob-drive-letter.md). The failing run's vitest banner shows a lowercase `c:/…` root; passing runs show uppercase `C:/…`. Known-flaky and usually clears on a re-push — a single red pre-push with this exact signature is not your change breaking.
