#!/usr/bin/env node
// PreToolUse approval hook for real `claude -p` agent runs (replaces the old
// stdout-`INTENT` gate that demo scripts faked). Claude Code runs this BEFORE a
// Bash tool call, passing the call as JSON on stdin. A hook's stdout never reaches
// the parent process's pipe, so the gate is coordinated through files in the
// session's own sandbox cwd:
//
//   1. A Bash command the classifier doesn't recognise → allow immediately (exit 0).
//   2. A gated command → announce it by writing `intent-request.json` into the
//      coordination dir, then BLOCK polling for `intent-decision.json`. We gate:
//        - deletes: the rm family, `find … -delete`, `git clean`;
//        - git publish: `git push` (→ git.push) and force variants (→ git.force_push);
//        - PRs: `gh pr create` (→ pr.open) and `gh pr merge` (→ pr.merge).
//   3. RunnerCore watches the dir for the request, routes it through the gate
//      evaluator (allow / ask-a-human / deny), and writes the decision file.
//   4. The hook returns the decision to Claude as `hookSpecificOutput`, which
//      overrides `--permission-mode dontAsk` (verified by spike).
//   5. The hook NEVER outlives Claude Code's hook timeout: a hook killed at that
//      timeout is a NON-decision, and under `dontAsk` the pending command then
//      executes as if approved. So the hook takes its own, shorter deadline as
//      argv[2] and DENIES fail-closed when it elapses, before the CLI kills it.
//
// The coordination directory is the run's sandbox, passed explicitly by RunnerCore as
// `ZIBBY_INTENT_DIR`. We must NOT use the Bash call's own cwd: an agent runs `rm`/`git`
// *inside* the granted target (or its worktree spawn cwd), so trusting `input.cwd`
// would drop the request where the core never watches, stranding the gate.
//
// Denylist honesty: this is a best-effort matcher, not a sandbox. It does NOT catch
// a push/merge hidden behind `$(…)` nesting it can't normalize, `gh api … -X PUT
// …/merges` (the REST merge), or an aliased binary. The locked floor + the
// non-interactive run shape are the real guarantees; this just routes the common
// idioms to the gate.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUEST_FILE = "intent-request.json";
const DECISION_FILE = "intent-decision.json";
const POLL_MS = 200;

/**
 * Fallback approval deadline when no argv deadline was passed (a non-RunnerCore
 * invocation). Claude Code kills a hook at its configured timeout — 600 s by
 * default — and treats the kill as a non-decision that lets the command run, so
 * the fallback must deny safely below that default.
 */
const DEFAULT_DEADLINE_S = 540;

// File-removal binaries invoked directly. The leading class covers command
// boundaries (start, separators, subshells, command-substitution) so `$(rm …)`
// and `` `rm …` `` are caught too, not just a bare `rm` at column 0.
const RM_FAMILY = /(^|[\s;&|(`])(rm|rmdir|unlink|shred|trash|trash-put)(\s|$)/;

/**
 * Chain-severity rank: when a command chains several gated segments, we announce
 * the single most severe one. pr.merge (a locked deny) outranks a force-push,
 * which outranks opening a PR, which outranks a plain push, which outranks a delete.
 */
const ACTION_RANK = {
  delete: 0,
  "git.push": 1,
  "pr.open": 2,
  "git.force_push": 3,
  "pr.merge": 4,
};

/** Czech presentation per push/PR action (delete carries its own, target-aware copy). */
const ACTION_META = {
  "git.push": {
    summary: "Push větve na remote",
    consequence: "Commity se objeví na vzdáleném repozitáři.",
  },
  "git.force_push": {
    summary: "Force-push větve (přepíše vzdálenou historii)",
    consequence: "Vzdálená historie větve bude přepsána — nevratné pro ostatní.",
  },
  "pr.open": {
    summary: "Otevřít pull request",
    consequence: "Vznikne PR viditelný v repozitáři; spustí CI i notifikace.",
  },
  "pr.merge": {
    summary: "Sloučit pull request do cílové větve",
    consequence: "Sloučení je nevratná publikace — systémový floor ho zakazuje (deny).",
  },
};

/**
 * True for shell commands that delete files — one of the families we gate. A
 * denylist is inherently leaky, but it must at least cover the idioms an autonomous
 * tidy/clean agent reaches for: the rm family, `find … -delete` (the `.DS_Store`
 * sweep, no rm token), and `git clean` (removes untracked files).
 */
function isDestructive(command) {
  if (RM_FAMILY.test(command)) return true;
  if (/\bfind\b[\s\S]*\s-delete(\s|$)/.test(command)) return true;
  if (/\bgit\s+clean(\s|$)/.test(command)) return true;
  return false;
}

/**
 * Quote- and escape-aware tokenizer so a spaced target stays one token whether it
 * was quoted (`"zibby-ascii 2.txt"`) or backslash-escaped (`zibby-ascii\ 2.txt`).
 */
function tokenize(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|((?:\\.|[^\s\\])+)/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    const unquoted = m[3] === undefined ? undefined : m[3].replace(/\\(.)/g, "$1");
    tokens.push(m[1] ?? m[2] ?? unquoted);
  }
  return tokens;
}

/**
 * Best-effort: pull the file targets out of an `rm`-style command for the card.
 * Splits on shell operators and collects the positional args of each rm-family
 * segment. `find`/`git clean` carry no enumerable targets (implicit set), so the
 * command-string preview stays the source of truth there.
 */
function parseTargets(command) {
  const targets = [];
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const tokens = tokenize(segment.trim());
    if (!/^(rm|rmdir|unlink|shred|trash|trash-put)$/.test(tokens[0] ?? "")) continue;
    for (const tok of tokens.slice(1)) {
      if (tok && !tok.startsWith("-")) targets.push(tok);
    }
  }
  return targets;
}

/** Normalize subshell/command-substitution boundaries to whitespace so a leading
 * `$(git push` / `` `gh pr merge `` tokenizes to `git`/`gh` as the first token. */
function normalizeSegment(segment) {
  return segment.replace(/\$\(|[`()]/g, " ").trim();
}

/** Classify a `git …` segment as a push (with branch) / force-push, or null. */
function classifyGit(tokens) {
  if (tokens[0] !== "git") return null;
  let i = 1;
  // Skip git's global options (some take a separate value).
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "-C" || t === "-c") {
      i += 2;
      continue;
    }
    if (/^--(git-dir|work-tree|namespace)=/.test(t)) {
      i += 1;
      continue;
    }
    break;
  }
  if (tokens[i] !== "push") return null;
  const rest = tokens.slice(i + 1);
  const isForce = rest.some(
    (t) =>
      t === "--force" ||
      t === "-f" ||
      t === "--force-with-lease" ||
      t.startsWith("--force-with-lease=") ||
      t.startsWith("+"),
  );
  // Positional args after `push` are `[remote?, refspec…]`; the branch is the
  // refspec's destination (after a `:`), with a leading force `+` stripped.
  const positionals = rest.filter((t) => !t.startsWith("-"));
  let branch;
  if (positionals.length >= 2) {
    let ref = positionals[1].replace(/^\+/, "");
    if (ref.includes(":")) ref = ref.split(":").pop();
    branch = ref || undefined;
  }
  return { action: isForce ? "git.force_push" : "git.push", branch };
}

/** Classify a `gh …` segment as opening or merging a PR, or null. */
function classifyGh(tokens) {
  if (tokens[0] !== "gh") return null;
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "-R" || t === "--repo") {
      i += 2;
      continue;
    }
    break;
  }
  if (tokens[i] !== "pr") return null;
  const sub = tokens[i + 1];
  if (sub === "create") return { action: "pr.open" };
  if (sub === "merge") return { action: "pr.merge" };
  return null;
}

/** Build the full classification (action + display enrichment) for one action. */
function enrich(action, { branch, command } = {}) {
  if (action === "delete") {
    const targets = parseTargets(command);
    return {
      action: "delete",
      riskType: "mazani",
      summary: targets.length
        ? `Smazat ${targets.length} ${targets.length === 1 ? "položku" : "položek"}`
        : "Smazat soubory odpovídající příkazu",
      consequence: "Vypsané soubory budou nevratně odstraněny.",
      preview: {
        kind: "command",
        shell: "bash",
        cmd: command,
        note: targets.length ? `${targets.length} cílů` : undefined,
        targets,
      },
    };
  }
  const meta = ACTION_META[action];
  return {
    action,
    ...(branch ? { branch } : {}),
    riskType: "push",
    summary: branch ? `${meta.summary} (${branch})` : meta.summary,
    consequence: meta.consequence,
    preview: { kind: "command", shell: "bash", cmd: command, targets: [] },
  };
}

/**
 * Classify one shell segment to a gated action, or null. `fullCommand` is the whole
 * (possibly chained) command — used for the preview/targets so the card shows the
 * operator the real thing, not a fragment.
 */
function classifySegment(segment, fullCommand) {
  const normalized = normalizeSegment(segment);
  if (!normalized) return null;
  const tokens = tokenize(normalized);
  const git = classifyGit(tokens);
  if (git) return enrich(git.action, { branch: git.branch, command: fullCommand });
  const gh = classifyGh(tokens);
  if (gh) return enrich(gh.action, { command: fullCommand });
  if (isDestructive(segment)) return enrich("delete", { command: fullCommand });
  return null;
}

/**
 * Classify a Bash command into the single most severe gated action it performs, or
 * null when nothing is gated (the caller then lets Claude's own permissions decide).
 * Pure and synchronous — exported for unit tests; the hook entry point calls it
 * inside a try/catch so a classifier bug fails OPEN (null), never blocks all Bash.
 */
export function classify(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  let best = null;
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const c = classifySegment(segment.trim(), command);
    if (c && (best === null || ACTION_RANK[c.action] > ACTION_RANK[best.action])) best = c;
  }
  return best;
}

/** Emit a PreToolUse decision and exit. `allow` overrides dontAsk; `deny` blocks. */
function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function waitForDecision(decisionFile, deadlineMs) {
  const startedAt = Date.now();
  for (;;) {
    if (existsSync(decisionFile)) {
      let decision = "deny";
      try {
        decision =
          JSON.parse(readFileSync(decisionFile, "utf8")).decision === "allow" ? "allow" : "deny";
      } catch {
        decision = "deny";
      }
      rmSync(decisionFile, { force: true });
      return decision;
    }
    if (Date.now() - startedAt >= deadlineMs) return "timeout";
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
  }
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    // Can't parse the event → don't gate; let Claude's own permissions decide.
    process.exit(0);
  }

  const command = input?.tool_input?.command ?? "";
  // Fail OPEN: a classifier exception must never block all Bash (it is in the spawn
  // path of every run) — an unclassified command falls through to Claude's perms.
  let cls = null;
  try {
    if (input?.tool_name === "Bash") cls = classify(command);
  } catch {
    cls = null;
  }
  if (!cls) process.exit(0);

  // The sandbox RunnerCore watches — pinned via env, not the command's cwd.
  const cwd = process.env.ZIBBY_INTENT_DIR || input.cwd || process.cwd();
  const context = JSON.stringify({
    riskType: cls.riskType,
    summary: cls.summary,
    consequence: cls.consequence,
    preview: cls.preview,
  });

  writeFileSync(
    path.join(cwd, REQUEST_FILE),
    JSON.stringify({ action: cls.action, ...(cls.branch ? { branch: cls.branch } : {}), context }),
    "utf8",
  );

  const deadlineS = Number(process.argv[2]);
  const deadlineMs =
    (Number.isFinite(deadlineS) && deadlineS > 0 ? deadlineS : DEFAULT_DEADLINE_S) * 1000;

  const decision = waitForDecision(path.join(cwd, DECISION_FILE), deadlineMs);
  if (decision === "allow") decide("allow", "Approved by the gate.");
  if (decision === "timeout") {
    rmSync(path.join(cwd, REQUEST_FILE), { force: true });
    decide("deny", "Approval window elapsed with no decision — denied fail-safe.");
  }
  decide("deny", "Blocked by the gate (denied).");
}

// Run only as a CLI entry point; an `import` (the classifier unit tests) does not
// trigger the blocking gate flow.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
