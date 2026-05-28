#!/usr/bin/env node
/**
 * Utility script to analyze token usage in Claude project logs, comparing sessions before and after a specific cutoff date (CodeGraph integration).
 * It discovers main and subagent log files, collects assistant turn records, and computes statistics on output tokens per turn and per session.
 * The script also performs an equal-token-budget comparison to assess changes in token efficiency post-switch.
 *
 * Usage: Run this script in an environment with access to the specified project logs. Adjust the PROJECT_DIR constant if needed.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const CODEGRAPH_CUTOFF_UTC = "2026-05-19T14:08:00Z";
const CUTOFF_MS = Date.parse(CODEGRAPH_CUTOFF_UTC);
const PROJECT_DIR = path.join(
  os.homedir(),
  ".claude",
  "projects",
  "c--Users-crazy-OneDrive-Desktop-projects-recipe-viewer",
);

function sessionIdFromMain(file) {
  return path.basename(file, ".jsonl");
}
function sessionIdFromSubagent(file) {
  return path.basename(path.dirname(path.dirname(file)));
}

function discoverLogs(root) {
  const main = [];
  const sub = [];
  if (!fs.existsSync(root)) return { main, sub };
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      main.push(p);
    } else if (entry.isDirectory()) {
      const subDir = path.join(p, "subagents");
      if (fs.existsSync(subDir)) {
        for (const f of fs.readdirSync(subDir)) {
          if (f.endsWith(".jsonl")) sub.push(path.join(subDir, f));
        }
      }
    }
  }
  return { main, sub };
}

async function collectRecords(file, isSubagent) {
  const seen = new Set();
  const records = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;
    const usage = obj.message && obj.message.usage;
    const id = obj.message && obj.message.id;
    if (!usage || typeof usage.output_tokens !== "number" || !id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const tsMs = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    records.push({
      messageId: id,
      sessionFile: file,
      sessionId: isSubagent
        ? sessionIdFromSubagent(file)
        : sessionIdFromMain(file),
      outputTokens: usage.output_tokens,
      inputTokens: usage.input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      timestampMs: tsMs,
      isSubagent,
    });
  }
  return records;
}

function stats(values) {
  if (values.length === 0) return { mean: 0, median: 0, p90: 0, stdev: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const pick = (q) => {
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[idx];
  };
  const variance =
    sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length;
  return {
    mean,
    median: pick(0.5),
    p90: pick(0.9),
    stdev: Math.sqrt(variance),
  };
}

function sessionTotals(records) {
  const byFile = new Map();
  for (const r of records) {
    byFile.set(
      r.sessionFile,
      (byFile.get(r.sessionFile) ?? 0) + r.outputTokens,
    );
  }
  return [...byFile.values()];
}

const COL_W = 14;
const LABEL_W = 28;
const DELTA_W = 14;
function fmt(n) {
  if (!isFinite(n) || n === 0) return "—".padStart(COL_W);
  return Math.round(n).toLocaleString("en-US").padStart(COL_W);
}
function deltaStr(base, other) {
  if (!base || !other) return "—".padStart(DELTA_W);
  const pct = ((other - base) / base) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`.padStart(DELTA_W);
}

(async () => {
  const { main, sub } = discoverLogs(PROJECT_DIR);

  const mainByMtime = main
    .map((f) => ({ file: f, mtime: fs.statSync(f).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  const preMain = mainByMtime.filter((m) => m.mtime < CUTOFF_MS);
  const postMain = mainByMtime.filter((m) => m.mtime >= CUTOFF_MS);

  // Matched-pre = most-recent N pre main sessions where N = post main count.
  // Subagents follow their parent session id.
  const N = postMain.length;
  const matchedPreMain = preMain.slice(-N);
  const matchedPreSessionIds = new Set(
    matchedPreMain.map((m) => sessionIdFromMain(m.file)),
  );
  const postSessionIds = new Set(
    postMain.map((m) => sessionIdFromMain(m.file)),
  );

  console.log(`CodeGraph cutoff: ${CODEGRAPH_CUTOFF_UTC} (commit 1b00b5a)`);
  console.log(`Project dir:      ${PROJECT_DIR}`);
  console.log(
    `Logs scanned:     ${main.length} main + ${sub.length} subagent files`,
  );
  console.log(
    `Matched-pre window: ${N} most-recent pre-cutoff main session(s) ` +
      `(+ their subagents)`,
  );
  console.log();

  const allRecords = [];
  for (const f of main) allRecords.push(...(await collectRecords(f, false)));
  for (const f of sub) allRecords.push(...(await collectRecords(f, true)));

  // Cohort assignment by sessionId membership (subagents inherit via parent session uuid).
  const allPre = allRecords.filter((r) => {
    const isPost = postSessionIds.has(r.sessionId);
    return !isPost;
  });
  const matchedPre = allRecords.filter((r) =>
    matchedPreSessionIds.has(r.sessionId),
  );
  const post = allRecords.filter((r) => postSessionIds.has(r.sessionId));

  const cohorts = [
    { name: "ALL PRE", records: allPre },
    { name: "MATCHED PRE", records: matchedPre },
    { name: "POST", records: post },
  ];

  const TOTAL_W = LABEL_W + COL_W * cohorts.length + DELTA_W;

  // Header
  console.log(
    "".padEnd(LABEL_W) +
      cohorts.map((c) => c.name.padStart(COL_W)).join("") +
      "Δ POST vs MP".padStart(DELTA_W),
  );
  console.log("-".repeat(TOTAL_W));

  const padNum = (n) => String(n).padStart(COL_W);

  // Sessions row
  const sessionsRow = cohorts.map(
    (c) => new Set(c.records.map((r) => r.sessionId)).size,
  );
  console.log("Sessions".padEnd(LABEL_W) + sessionsRow.map(padNum).join(""));

  // Files row
  const filesRow = cohorts.map(
    (c) => new Set(c.records.map((r) => r.sessionFile)).size,
  );
  console.log(
    "Files (main+sub)".padEnd(LABEL_W) + filesRow.map(padNum).join(""),
  );

  // Turns row
  const turnsRow = cohorts.map((c) => c.records.length);
  console.log(
    "Turns (deduped)".padEnd(LABEL_W) + turnsRow.map(padNum).join(""),
  );

  console.log();
  console.log("Output tokens / turn");

  const tokenView = (filter) =>
    cohorts.map((c) => c.records.filter(filter).map((r) => r.outputTokens));
  const allTok = tokenView(() => true);
  const mainTok = tokenView((r) => !r.isSubagent);
  const subTok = tokenView((r) => r.isSubagent);

  const allStats = allTok.map(stats);
  const mainStats = mainTok.map(stats);
  const subStats = subTok.map(stats);

  // Cohorts are [ALL PRE, MATCHED PRE, POST]; baseline for delta = MATCHED PRE (idx 1).
  const printStatRow = (label, statsArr, key) => {
    const cells = statsArr.map((s) => fmt(s[key]));
    const trailingDelta = deltaStr(statsArr[1][key], statsArr[2][key]);
    console.log(label.padEnd(LABEL_W) + cells.join("") + trailingDelta);
  };

  printStatRow("  mean (combined)", allStats, "mean");
  printStatRow("  median (combined)", allStats, "median");
  printStatRow("  p90 (combined)", allStats, "p90");
  printStatRow("  stdev (combined)", allStats, "stdev");
  printStatRow("  mean (main only)", mainStats, "mean");
  printStatRow("  mean (subagents only)", subStats, "mean");

  console.log();
  console.log("Output tokens / session");
  const sessTotals = cohorts.map((c) => sessionTotals(c.records));
  const sessStats = sessTotals.map(stats);
  printStatRow("  mean total / session", sessStats, "mean");
  printStatRow("  median total / session", sessStats, "median");

  console.log();
  console.log(
    `Δ POST vs MP = POST vs MATCHED PRE (the equal-N fair baseline that grows with POST).`,
  );
  if (postMain.length < 5) {
    console.log(
      `Note: post-cutoff n=${postMain.length} main session(s). Sample is still small — re-run after more branches.`,
    );
  }

  // -------- Equal-token-budget comparison --------
  // Sum all four billable categories per record, then walk pre backwards from
  // the cutoff until accumulated tokens match the post total. Time is ignored;
  // we're matching spend, so the comparison is "for the same N tokens, how
  // many turns did each cohort take and how big were they on average."
  const tokensOf = (r) =>
    r.outputTokens + r.inputTokens + r.cacheReadTokens + r.cacheCreationTokens;

  const withTs = allRecords.filter((r) => Number.isFinite(r.timestampMs));
  const postRecs = withTs.filter((r) => r.timestampMs >= CUTOFF_MS);
  const postTotal = postRecs.reduce((s, r) => s + tokensOf(r), 0);

  const preSortedDesc = withTs
    .filter((r) => r.timestampMs < CUTOFF_MS)
    .sort((a, b) => b.timestampMs - a.timestampMs);

  const preRecs = [];
  let preAcc = 0;
  for (const r of preSortedDesc) {
    preRecs.push(r);
    preAcc += tokensOf(r);
    if (preAcc >= postTotal) break;
  }
  const preTotal = preAcc;
  const preExhausted = preAcc < postTotal;

  const sumCat = (recs) =>
    recs.reduce(
      (acc, r) => {
        acc.output += r.outputTokens;
        acc.input += r.inputTokens;
        acc.cacheRead += r.cacheReadTokens;
        acc.cacheCreate += r.cacheCreationTokens;
        return acc;
      },
      { output: 0, input: 0, cacheRead: 0, cacheCreate: 0 },
    );
  const preSum = sumCat(preRecs);
  const postSum = sumCat(postRecs);
  const totalOf = (s) => s.output + s.input + s.cacheRead + s.cacheCreate;

  const isoShort = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const fmtDuration = (ms) => {
    const h = ms / 3_600_000;
    if (h < 48) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  const preStartTs = preRecs.length
    ? preRecs[preRecs.length - 1].timestampMs
    : CUTOFF_MS;
  const postEndTs = postRecs.length
    ? Math.max(...postRecs.map((r) => r.timestampMs))
    : CUTOFF_MS;
  const preSpanMs = CUTOFF_MS - preStartTs;
  const postSpanMs = postEndTs - CUTOFF_MS;

  console.log();
  console.log("=".repeat(TOTAL_W));
  console.log(
    `Equal-token-budget comparison (POST total = ${postTotal.toLocaleString("en-US")} tokens)`,
  );
  console.log(
    `  POST: ${isoShort(CUTOFF_MS)} → ${isoShort(postEndTs)}   (${fmtDuration(postSpanMs)})`,
  );
  console.log(
    `  PRE:  ${isoShort(preStartTs)} → ${isoShort(CUTOFF_MS)}   (${fmtDuration(preSpanMs)}, walked back ${preRecs.length} turns)`,
  );
  if (preExhausted) {
    console.log(
      `  ⚠ Pre data exhausted before matching POST total ` +
        `(only ${preTotal.toLocaleString("en-US")} tokens of pre history available).`,
    );
  }
  console.log("-".repeat(TOTAL_W));
  console.log();

  const labelW = 28;
  const numW = 16;
  const padLabel = (s) => s.padEnd(labelW);
  const padNum2 = (n) =>
    (typeof n === "number" ? n.toLocaleString("en-US") : String(n)).padStart(
      numW,
    );
  const deltaCol = (base, other) => {
    if (!base || !other) return "—".padStart(DELTA_W);
    const pct = ((other - base) / base) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`.padStart(DELTA_W);
  };

  console.log(
    padLabel("") +
      "PRE (equal $)".padStart(numW) +
      "POST".padStart(numW) +
      "Δ POST vs PRE".padStart(DELTA_W),
  );
  console.log(
    padLabel("TOTAL all-in tokens") +
      padNum2(preTotal) +
      padNum2(postTotal) +
      "~equal".padStart(DELTA_W),
  );
  console.log(
    padLabel("Assistant turns") +
      padNum2(preRecs.length) +
      padNum2(postRecs.length) +
      deltaCol(preRecs.length, postRecs.length),
  );
  console.log(
    padLabel("Tokens / turn (mean)") +
      padNum2(Math.round(preTotal / Math.max(1, preRecs.length))) +
      padNum2(Math.round(postTotal / Math.max(1, postRecs.length))) +
      deltaCol(
        preTotal / Math.max(1, preRecs.length),
        postTotal / Math.max(1, postRecs.length),
      ),
  );
  console.log(
    padLabel("  output tokens") +
      padNum2(preSum.output) +
      padNum2(postSum.output) +
      deltaCol(preSum.output, postSum.output),
  );
  console.log(
    padLabel("  input tokens (uncached)") +
      padNum2(preSum.input) +
      padNum2(postSum.input) +
      deltaCol(preSum.input, postSum.input),
  );
  console.log(
    padLabel("  cache read tokens") +
      padNum2(preSum.cacheRead) +
      padNum2(postSum.cacheRead) +
      deltaCol(preSum.cacheRead, postSum.cacheRead),
  );
  console.log(
    padLabel("  cache creation tokens") +
      padNum2(preSum.cacheCreate) +
      padNum2(postSum.cacheCreate) +
      deltaCol(preSum.cacheCreate, postSum.cacheCreate),
  );

  console.log();
  console.log(
    `Headline metric: turns to spend ~${postTotal.toLocaleString("en-US")} tokens. ` +
      `Fewer turns post-switch ⇒ each turn produced more value per token.`,
  );
})();
