import "@testing-library/jest-dom";
import { afterEach, beforeEach, vi } from "vitest";

// ─── Console discipline ─────────────────────────────────────────────────────
// Console error/warn output appearing in a test run must mean failure. These
// setup-level spies swallow the output and fail the test that produced it.
//
// A test that exercises an error path ON PURPOSE must suppress and verify the
// log in its own body — ad hoc, so the expectation is visible right where the
// error happens:
//
//   const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
//   ...trigger the error path...
//   expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("..."));
//   errorSpy.mockRestore();
//
// That works because vi.spyOn on an already-spied method returns the same
// mock: the test's mockImplementation replaces the recorder below, so the
// expected call never reaches this guard, while the test's own assertions
// still see it. There is deliberately NO central allowlist here.

const GUARDED_CONSOLE_METHODS = ["error", "warn"] as const;

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// Calls are recorded in this closure array, not read from spy.mock.calls, so
// a file-level vi.restoreAllMocks()/vi.clearAllMocks() can't erase evidence
// of output that already leaked.
let leakedConsoleCalls: string[] = [];
let consoleGuards: Array<{ mockRestore: () => void }> = [];

beforeEach(() => {
  leakedConsoleCalls = [];
  consoleGuards = GUARDED_CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      leakedConsoleCalls.push(
        `console.${method}: ${args.map(formatConsoleArg).join(" ")}`,
      );
    }),
  );
});

afterEach(() => {
  for (const guard of consoleGuards) guard.mockRestore();
  consoleGuards = [];
  if (leakedConsoleCalls.length > 0) {
    const leaked = leakedConsoleCalls.join("\n  ");
    leakedConsoleCalls = [];
    throw new Error(
      `Unexpected console output — a passing test must not log errors or warnings:\n  ${leaked}\n` +
        `If this test exercises an error path on purpose, spy the console method in the test body, ` +
        `assert the expected message, and mockRestore() it (see src/__tests__/setup.ts).`,
    );
  }
});
// ────────────────────────────────────────────────────────────────────────────

// jsdom (as configured by vitest) does not install `localStorage` / `sessionStorage`
// on the global, and Node 24+'s native experimental Web Storage returns undefined
// without `--localstorage-file`. Install a Map-backed Storage polyfill so tests
// can use bare `localStorage` regardless of environment.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
