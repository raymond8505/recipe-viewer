// Captured OS output for the `yarn stop` helpers (scripts/lib/processTree.ts).
// Test-only: imported by path, not through the barrel.

/**
 * `netstat -ano` with a next dev server on 3001 (IPv4 and IPv6 rows, one
 * pid), storybook on 6007, an ESTABLISHED row on 3001 that is not a listener,
 * and a `:30010` decoy that a substring match on `:3001` would catch.
 */
export const netstatSample = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       2200
  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       500
  TCP    0.0.0.0:30010          0.0.0.0:0              LISTENING       999
  TCP    127.0.0.1:3001         127.0.0.1:52000        ESTABLISHED     500
  TCP    127.0.0.1:6007         0.0.0.0:0              LISTENING       520
  TCP    [::]:3001              [::]:0                 LISTENING       500
  UDP    0.0.0.0:5353           *:*                                    1234
`;

/**
 * The Windows process table as `yarn stop` reads it, holding one dev-server
 * tree: bash (200) → yarn (300) → next dev (400) → server (500, the listener)
 * → a worker (510). The stop script itself is 600 under the same bash; 700 is
 * an unrelated Node process (an MCP server) that must survive; 900 is a Node
 * listener whose parent is the stop script.
 */
export const cimProcessTableSample = `
"ProcessId","ParentProcessId","Name"
"0","0","System Idle Process"
"100","4","explorer.exe"
"200","100","bash.exe"
"300","200","node.exe"
"400","300","node.exe"
"500","400","node.exe"
"510","500","node.exe"
"520","200","node.exe"
"600","200","node.exe"
"700","100","node.exe"
"900","600","node.exe"
`;

/** The same tree in `ps -eo pid=,ppid=,comm=` form, with a path-form command. */
export const psProcessTableSample = `
  100     1 /usr/bin/bash
  300   100 /usr/local/bin/node
  400   300 node
  500   400 node
  510   500 node
`;
