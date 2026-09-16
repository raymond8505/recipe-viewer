// Pure helpers behind `yarn stop` (scripts/stop-dev.ts): parsing the OS's
// listener and process-table output, and deciding which process to kill.
// No I/O here so every branch is unit-testable with captured output.

/** One row of the OS process table. */
export interface ProcessInfo {
  pid: number;
  ppid: number;
  /** Executable name (`node.exe`, `bash.exe`) or a path, as the OS reports it. */
  name: string;
}

export type ProcessTable = Map<number, ProcessInfo>;

/**
 * Extracts the pids listening on each of `ports` from `netstat -ano` output.
 *
 * @returns A map with an entry for every requested port, empty sets included,
 * so a caller can iterate the ports it asked for without a second lookup.
 */
export function parseNetstatListeners(
  output: string,
  ports: readonly number[],
): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>(ports.map((p) => [p, new Set()]));
  // TCP <local> <foreign> LISTENING <pid>; the local address is IPv4
  // (`0.0.0.0:3001`) or bracketed IPv6 (`[::]:3001`).
  const row = /^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$/;
  for (const line of output.split(/\r?\n/)) {
    const match = row.exec(line);
    if (!match) continue;
    const port = Number(match[1].slice(match[1].lastIndexOf(":") + 1));
    result.get(port)?.add(Number(match[2]));
  }
  return result;
}

/** Parses `lsof -t` output: one pid per line, blank when nothing listens. */
export function parseLsofListeners(output: string): Set<number> {
  const pids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed)) pids.add(Number(trimmed));
  }
  return pids;
}

/**
 * Parses a process table in either of the two forms the script reads.
 *
 * @remarks
 * Windows: the CSV of `Get-CimInstance Win32_Process | Select-Object
 * ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation`
 * (quoted fields, header row). POSIX: `ps -eo pid=,ppid=,comm=` (whitespace
 * separated, no header; the command may be a path containing spaces, so it is
 * the remainder of the line).
 */
export function parseProcessTable(text: string): ProcessTable {
  const table: ProcessTable = new Map();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const isCsv = lines[0]?.startsWith('"ProcessId"');
  for (const line of isCsv ? lines.slice(1) : lines) {
    const info = isCsv ? parseCsvRow(line) : parsePsRow(line);
    if (info) table.set(info.pid, info);
  }
  return table;
}

function parseCsvRow(line: string): ProcessInfo | null {
  const match = /^"(\d+)","(\d+)","(.*)"$/.exec(line);
  if (!match) return null;
  return { pid: Number(match[1]), ppid: Number(match[2]), name: match[3] };
}

function parsePsRow(line: string): ProcessInfo | null {
  const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
  if (!match) return null;
  return { pid: Number(match[1]), ppid: Number(match[2]), name: match[3] };
}

/** True for a Node.js process, whether the table reports a name or a path. */
export function isNodeProcess(name: string): boolean {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  return /^node(\.exe)?$/i.test(base);
}

/** The pid itself and every ancestor found in the table, nearest first. */
export function ancestorsOf(pid: number, table: ProcessTable): Set<number> {
  const chain = new Set<number>();
  let current: number | undefined = pid;
  while (current !== undefined && !chain.has(current)) {
    chain.add(current);
    current = table.get(current)?.ppid;
  }
  return chain;
}

/**
 * Finds the process to kill so that `pid`'s whole dev-server tree goes away.
 *
 * @remarks
 * `next dev` is a CLI process that forks the server that owns the port; on
 * POSIX the CLI survives its child dying by signal, so the kill has to start
 * at the top of the chain of Node processes above the listener. The walk
 * stops at the first non-Node ancestor (the shell that launched it) and never
 * enters `protectedPids`, which the caller sets to its own ancestry so the
 * script cannot kill the shell or harness running it.
 *
 * @returns The topmost pid to kill, or null when `pid` itself is protected.
 */
export function killRootFor(
  pid: number,
  table: ProcessTable,
  protectedPids: ReadonlySet<number>,
): number | null {
  if (protectedPids.has(pid)) return null;
  let root = pid;
  const seen = new Set<number>([pid]);
  for (;;) {
    const parentPid = table.get(root)?.ppid;
    if (parentPid === undefined || seen.has(parentPid)) return root;
    const parent = table.get(parentPid);
    if (!parent || !isNodeProcess(parent.name) || protectedPids.has(parentPid)) return root;
    seen.add(parentPid);
    root = parentPid;
  }
}

/** Every process below `pid` in the table, not including `pid` itself. */
export function descendantsOf(pid: number, table: ProcessTable): Set<number> {
  const found = new Set<number>();
  const queue = [pid];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const info of table.values()) {
      if (info.ppid === parent && info.pid !== parent && !found.has(info.pid)) {
        found.add(info.pid);
        queue.push(info.pid);
      }
    }
  }
  return found;
}
