import { describe, expect, it } from "vitest";

import {
  ancestorsOf,
  descendantsOf,
  isNodeProcess,
  killRootFor,
  parseLsofListeners,
  parseNetstatListeners,
  parseProcessTable,
} from "../../scripts/lib/processTree";
import {
  cimProcessTableSample,
  netstatSample,
  psProcessTableSample,
} from "@/fixtures/processTree";

describe("parseNetstatListeners", () => {
  it("collects LISTENING pids per requested port, across IPv4 and IPv6 rows", () => {
    const listeners = parseNetstatListeners(netstatSample, [3001, 6007, 4000]);
    expect(listeners.get(3001)).toEqual(new Set([500]));
    expect(listeners.get(6007)).toEqual(new Set([520]));
    expect(listeners.get(4000)).toEqual(new Set());
  });

  it("ignores ESTABLISHED rows and ports that merely start with the digits", () => {
    const listeners = parseNetstatListeners(netstatSample, [3001]);
    expect(listeners.get(3001)?.has(999)).toBe(false);
    expect(parseNetstatListeners(netstatSample, [30010]).get(30010)).toEqual(new Set([999]));
  });
});

describe("parseLsofListeners", () => {
  it("reads one pid per line and nothing from empty output", () => {
    expect(parseLsofListeners("500\n510\n")).toEqual(new Set([500, 510]));
    expect(parseLsofListeners("")).toEqual(new Set());
  });
});

describe("parseProcessTable", () => {
  it("reads the PowerShell CSV form", () => {
    const table = parseProcessTable(cimProcessTableSample);
    expect(table.get(500)).toEqual({ pid: 500, ppid: 400, name: "node.exe" });
    expect(table.get(200)).toEqual({ pid: 200, ppid: 100, name: "bash.exe" });
  });

  it("reads the ps form, keeping a path-form command intact", () => {
    const table = parseProcessTable(psProcessTableSample);
    expect(table.get(300)).toEqual({ pid: 300, ppid: 100, name: "/usr/local/bin/node" });
    expect(table.get(400)).toEqual({ pid: 400, ppid: 300, name: "node" });
  });
});

describe("isNodeProcess", () => {
  it("matches node by name or path on either platform", () => {
    expect(isNodeProcess("node.exe")).toBe(true);
    expect(isNodeProcess("/usr/local/bin/node")).toBe(true);
    expect(isNodeProcess("C:\\Program Files\\nodejs\\node.exe")).toBe(true);
    expect(isNodeProcess("bash.exe")).toBe(false);
    expect(isNodeProcess("nodepad.exe")).toBe(false);
  });
});

describe("killRootFor", () => {
  const table = parseProcessTable(cimProcessTableSample);
  const protectedPids = ancestorsOf(600, table);

  it("walks up to the top Node process and stops at the shell", () => {
    expect(killRootFor(500, table, protectedPids)).toBe(300);
  });

  it("never returns a protected ancestor", () => {
    expect(killRootFor(900, table, protectedPids)).toBe(900);
  });

  it("refuses a listener that is itself protected", () => {
    expect(killRootFor(600, table, protectedPids)).toBeNull();
  });

  it("returns the pid itself when the table does not know it", () => {
    expect(killRootFor(4242, table, protectedPids)).toBe(4242);
  });
});

describe("ancestorsOf / descendantsOf", () => {
  const table = parseProcessTable(cimProcessTableSample);

  it("ancestors include the pid and stop at the table's root", () => {
    expect(ancestorsOf(600, table)).toEqual(new Set([600, 200, 100, 4]));
  });

  it("descendants cover the whole tree below the root, not the root", () => {
    expect(descendantsOf(300, table)).toEqual(new Set([400, 500, 510]));
    expect(descendantsOf(700, table)).toEqual(new Set());
  });
});
