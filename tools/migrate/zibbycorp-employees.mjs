#!/usr/bin/env node
// ZibbyCorp employees migration (ZE-01 / D-015).
//
// Employees are instances of an agent (a position) — see DECISIONS.md D-015.
// For every `agents/<id>.md` file that still carries a `department:`
// frontmatter line, this hires ONE employee for that agent in that
// department (the next free name off the seed pool, PART-E order), then
// removes the `department:` line from the agent's frontmatter — an agent's
// department is now DERIVED from its employees, never stored on the agent
// itself. Agents are processed in `id` (filename) order, so re-running the
// migration against the same starting tree always assigns the same names.
//
// Idempotent: an agent file with no `department:` line is a no-op (never had
// one, or was already migrated) — so a second `--apply` run over an
// already-migrated tree makes zero changes. A partial re-run (an employee
// file already exists for an agent that STILL carries `department:`, e.g. an
// interrupted previous apply) skips the duplicate hire but still strips the
// frontmatter line.
//
// Dry-run by default; `--apply` backs the whole tree up first (mirrors
// `zibbycorp-departments.mjs`), then writes.
//
// Usage:
//   node tools/migrate/zibbycorp-employees.mjs --data <dir> [--apply] [--report <file>]

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PART-E's 30 Minion-style seed names plus 30 more (D-018), in the SAME order as
 * `apps/api/src/employees/employee-names.store.ts`'s `EMPLOYEE_NAME_SEED` —
 * this list and that one must never drift apart, or a name pool seeded by the
 * API and one seeded by this migration would disagree. Keep both in sync by
 * hand; there is no shared import (this is a standalone `.mjs` script, the
 * store is TypeScript/NestJS).
 */
export const EMPLOYEE_NAME_SEED = [
  "Kevin",
  "Stuart",
  "Bob",
  "Dave",
  "Jerry",
  "Carl",
  "Phil",
  "Tim",
  "Mark",
  "Tom",
  "Jorge",
  "Norbert",
  "Otto",
  "Mel",
  "Lance",
  "Steve",
  "Donnie",
  "Mike",
  "Ken",
  "Chris",
  "John",
  "Paul",
  "Larry",
  "Herb",
  "Walter",
  "Gus",
  "Barry",
  "Frank",
  "Lenny",
  "Ziggy",
  // D-018: 30 more, appended so the operator's first 30 keep their order.
  "Tony",
  "Eric",
  "Henry",
  "Norman",
  "Brian",
  "Pete",
  "Ron",
  "Felix",
  "Jimmy",
  "Dan",
  "Sid",
  "Ralph",
  "Vince",
  "Leo",
  "Max",
  "Rudy",
  "Hank",
  "Moe",
  "Sam",
  "Nick",
  "Ted",
  "Joe",
  "Ed",
  "Hugo",
  "Vito",
  "Bruno",
  "Gary",
  "Ollie",
  "Rex",
  "Zeke",
];

const isBackupDir = (name) => /^_backup-/.test(name) || name === ".git";

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;
const DEPARTMENT_LINE_RE = /^[ \t]*department[ \t]*:[ \t]*([a-z]+)[ \t]*\r?\n/m;

/**
 * Read `department: <id>` off an agent file's frontmatter, or `null` when
 * absent (no frontmatter fence, or no `department` key inside it).
 */
export function readDepartment(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return null;
  const inner = m[2];
  const dm = DEPARTMENT_LINE_RE.exec(`${inner}\n`);
  return dm ? dm[1] : null;
}

/** Strip the `department:` frontmatter line — body and every other key untouched. */
export function stripDepartment(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return text;
  const [, open, inner, close] = m;
  const nextInner = `${inner}\n`.replace(DEPARTMENT_LINE_RE, "");
  return open + nextInner.replace(/\n$/, "") + close + text.slice(m[0].length);
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** `agents/<id>.md` (top-level only — never `agents/runs/**`). */
function listAgentFiles(dataDir) {
  const agentsDir = join(dataDir, "agents");
  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));
}

function slugName(name) {
  return name.toLowerCase();
}

/**
 * @typedef {Object} EmployeePlan
 * @property {string} agentId
 * @property {string} department
 * @property {string} employeeId
 * @property {string} name
 * @property {string} agentFileRel
 * @property {string} agentFileNewContent
 * @property {boolean} alreadyHired
 */

/**
 * Build the full hire plan: which agents need an employee, which seed name
 * each gets, and the frontmatter-stripped content for its agent file.
 * `existingEmployeeIds` / `existingClaimedNames` reflect any employees/names
 * already on disk (a prior partial apply), so a re-run assigns names that are
 * still actually free.
 */
export function planEmployees(dataDir) {
  const agentIds = listAgentFiles(dataDir);
  const employeesDir = join(dataDir, "employees");
  const existingEmployeeIds = new Set(
    existsSync(employeesDir)
      ? readdirSync(employeesDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.slice(0, -".json".length))
      : [],
  );
  const existingClaimedNames = new Set();
  for (const id of existingEmployeeIds) {
    const full = join(employeesDir, `${id}.json`);
    try {
      const parsed = JSON.parse(readFileSync(full, "utf8"));
      if (parsed?.name) existingClaimedNames.add(parsed.name);
    } catch {
      // Corrupt/unreadable — ignore for name-availability purposes.
    }
  }

  const plans = [];
  const claimedThisRun = new Set(existingClaimedNames);
  for (const agentId of agentIds) {
    const agentFileRel = `agents/${agentId}.md`;
    const original = readFileSync(join(dataDir, agentFileRel), "utf8");
    const department = readDepartment(original);
    if (!department) continue; // already migrated, or never owned an agent-level department

    const employeeId = `employee_${agentId}`;
    const alreadyHired = existingEmployeeIds.has(employeeId);
    let name = null;
    if (!alreadyHired) {
      name = EMPLOYEE_NAME_SEED.find((n) => !claimedThisRun.has(n)) ?? null;
      if (!name) {
        throw new Error(
          `name pool exhausted: ${agentId} needs hiring but every seed name is already claimed`,
        );
      }
      claimedThisRun.add(name);
    }

    plans.push({
      agentId,
      department,
      employeeId,
      name, // null when `alreadyHired` — the existing employee keeps its own name
      agentFileRel,
      agentFileNewContent: stripDepartment(original),
      alreadyHired,
    });
  }
  return plans;
}

/** The full name-pool manifest content after this migration's hires — `EmployeeName[]`. */
function buildNameManifest(plans, existingManifest) {
  const byName = new Map((existingManifest ?? []).map((n) => [n.name, n]));
  for (const name of EMPLOYEE_NAME_SEED) {
    if (!byName.has(name)) byName.set(name, { id: `empname_${slugName(name)}`, name });
  }
  for (const plan of plans) {
    if (plan.alreadyHired || !plan.name) continue;
    const entry = byName.get(plan.name);
    byName.set(plan.name, { ...entry, employeeId: plan.employeeId });
  }
  // Pool order: alphabetical by name (mirrors `EmployeeNamesStore.list()`).
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport({ dataDir, apply, plans, backupDir }) {
  const hires = plans.filter((p) => !p.alreadyHired);
  const lines = [];
  lines.push(`# ZibbyCorp employees migration${apply ? " (applied)" : " (dry run)"}`);
  lines.push("");
  lines.push(`Data dir: \`${dataDir}\``);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Agent files carrying \`department:\`: ${plans.length}`);
  lines.push(`- New hires: ${hires.length}`);
  lines.push(
    `- Already hired (skipped, frontmatter still stripped): ${plans.length - hires.length}`,
  );
  if (apply && backupDir) lines.push(`- Backup: \`${backupDir}\``);
  lines.push("");
  lines.push("## Hires");
  lines.push("");
  if (plans.length === 0) {
    lines.push("(none)");
  } else {
    for (const p of plans) {
      const who = p.alreadyHired
        ? `${p.employeeId} (already hired)`
        : `${p.name} (${p.employeeId})`;
      lines.push(`- \`${p.agentId}\` -> ${who} in \`${p.department}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function walkFiles(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).split(sep).join("/");
    const isTop = dirname(rel) === ".";
    if (isTop && isBackupDir(entry.name)) continue;
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function backupDataDir(dataDir, timestamp) {
  const backupDir = join(dataDir, `_backup-zibbycorp-employees-${timestamp}`);
  const files = walkFiles(dataDir, dataDir);
  for (const rel of files) {
    const dest = join(backupDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(dataDir, rel), dest);
  }
  return backupDir;
}

/**
 * @param {{ dataDir: string, apply?: boolean, reportPath?: string|null }} opts
 */
export function runMigration({ dataDir, apply = false, reportPath = null }) {
  if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
    throw new Error(`--data dir does not exist or is not a directory: ${dataDir}`);
  }

  const plans = planEmployees(dataDir);
  const namesFile = join(dataDir, "employee-names", "employee-names.json");
  const existingManifest = existsSync(namesFile)
    ? JSON.parse(readFileSync(namesFile, "utf8"))
    : null;
  const nameManifest = buildNameManifest(plans, existingManifest);

  let backupDir = null;
  if (apply) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupDir = backupDataDir(dataDir, timestamp);

    const employeesDir = join(dataDir, "employees");
    mkdirSync(employeesDir, { recursive: true });
    const hiredAt = new Date().toISOString();
    for (const plan of plans) {
      if (plan.alreadyHired) continue;
      const employee = {
        id: plan.employeeId,
        name: plan.name,
        agentId: plan.agentId,
        department: plan.department,
        status: "active",
        hiredAt,
      };
      writeFileSync(join(employeesDir, `${plan.employeeId}.json`), JSON.stringify(employee));
    }

    mkdirSync(dirname(namesFile), { recursive: true });
    writeFileSync(namesFile, `${JSON.stringify(nameManifest, null, 2)}\n`);

    for (const plan of plans) {
      writeFileSync(join(dataDir, plan.agentFileRel), plan.agentFileNewContent, "utf8");
    }
  }

  const report = buildReport({ dataDir, apply, plans, backupDir });
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, report, "utf8");
  }

  return { plans, nameManifest, backupDir, report, changedCount: plans.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, data: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--data") args.data = argv[++i];
    else if (a === "--report") args.report = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.data) throw new Error("--data <dir> is required");
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    console.error(
      "usage: node tools/migrate/zibbycorp-employees.mjs --data <dir> [--apply] [--report <file>]",
    );
    process.exit(1);
  }

  try {
    const result = runMigration({ dataDir: args.data, apply: args.apply, reportPath: args.report });
    console.log(result.report);
    if (args.report) console.log(`\nReport written to ${args.report}`);
    process.exit(0);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
