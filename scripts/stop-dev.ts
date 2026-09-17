// Kills whatever is serving this checkout's dev ports, in one call.
//
//   yarn stop           # PORT (next dev) and SB_PORT (storybook)
//   yarn stop 4000      # those plus any extra ports given as arguments
//
// Yarn injects .env.yarn, so PORT/SB_PORT are the same values `yarn dev` and
// `yarn storybook` bind — a sibling checkout on other ports is never touched.
// Scoped to ports rather than process names on purpose: stdio MCP servers a
// Claude Code session spawns carry this project's path in their argv, and a
// name/argv match would take them down with the dev servers.
//
// Exit 0 when every port is free afterwards (including when nothing was
// listening to begin with), 1 when a listener survived, 2 on bad arguments.

import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import {
  ancestorsOf,
  descendantsOf,
  killRootFor,
  parseLsofListeners,
  parseNetstatListeners,
  parseProcessTable,
  type ProcessTable,
} from "./lib/processTree";

const isWindows = process.platform === "win32";
const FREE_PORT_TIMEOUT_MS = 3000;
const FREE_PORT_POLL_MS = 250;

function run(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function listenersByPort(ports: readonly number[]): Map<number, Set<number>> {
  if (isWindows) return parseNetstatListeners(run("netstat", ["-ano"]), ports);
  const result = new Map<number, Set<number>>();
  for (const port of ports) {
    let output = "";
    try {
      output = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    } catch {
      // lsof exits 1 when nothing matches, which is the "port is free" case.
    }
    result.set(port, parseLsofListeners(output));
  }
  return result;
}

function readProcessTable(): ProcessTable {
  const text = isWindows
    ? run("powershell", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation",
      ])
    : run("ps", ["-eo", "pid=,ppid=,comm="]);
  return parseProcessTable(text);
}

function killTree(root: number, table: ProcessTable): void {
  if (isWindows) {
    try {
      run("taskkill", ["/PID", String(root), "/T", "/F"]);
    } catch {
      // Already gone (a sibling root took it down first); the port poll below
      // is the check that matters.
    }
    return;
  }
  for (const pid of [root, ...descendantsOf(root, table)]) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ESRCH: already gone.
    }
  }
}

function portsFromEnvAndArgs(args: string[]): number[] | null {
  const ports = [Number(process.env.PORT ?? 3000), Number(process.env.SB_PORT ?? 6006)];
  for (const arg of args) {
    if (!/^\d+$/.test(arg)) {
      console.error(`stop: "${arg}" is not a port number`);
      return null;
    }
    ports.push(Number(arg));
  }
  return [...new Set(ports)];
}

async function waitUntilFree(ports: readonly number[]): Promise<Map<number, Set<number>>> {
  const deadline = Date.now() + FREE_PORT_TIMEOUT_MS;
  let remaining = listenersByPort(ports);
  while (Date.now() < deadline && [...remaining.values()].some((pids) => pids.size > 0)) {
    await sleep(FREE_PORT_POLL_MS);
    remaining = listenersByPort(ports);
  }
  return remaining;
}

async function main(): Promise<void> {
  const ports = portsFromEnvAndArgs(process.argv.slice(2));
  if (!ports) {
    process.exitCode = 2;
    return;
  }

  const before = listenersByPort(ports);
  const anyListener = [...before.values()].some((pids) => pids.size > 0);
  const table = anyListener ? readProcessTable() : new Map();
  const protectedPids = ancestorsOf(process.pid, table);

  const rootByPort = new Map<number, Set<number>>();
  const roots = new Set<number>();
  for (const [port, pids] of before) {
    const portRoots = new Set<number>();
    for (const pid of pids) {
      const root = killRootFor(pid, table, protectedPids);
      if (root === null) {
        console.log(`${port}: pid ${pid} is an ancestor of this script — not killed`);
        continue;
      }
      portRoots.add(root);
      roots.add(root);
    }
    rootByPort.set(port, portRoots);
  }
  for (const root of roots) killTree(root, table);

  const after = roots.size > 0 ? await waitUntilFree(ports) : before;
  let failed = false;
  for (const port of ports) {
    const survivors = after.get(port) ?? new Set();
    const killed = [...(rootByPort.get(port) ?? [])];
    if (survivors.size > 0) {
      failed = true;
      console.log(`${port}: still listening (pid ${[...survivors].join(", ")})`);
    } else if (killed.length > 0) {
      console.log(`${port}: killed tree rooted at pid ${killed.join(", ")}`);
    } else {
      console.log(`${port}: nothing listening`);
    }
  }
  if (failed) process.exitCode = 1;
}

void main();
