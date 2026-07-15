#!/usr/bin/env node
// PreToolUse approval hook for real `claude -p` agent runs (replaces the old
// stdout-`INTENT` gate that demo scripts faked). Claude Code runs this BEFORE a
// Bash tool call OR a Task (Agent-delegation) call, passing the call as JSON on
// stdin. A hook's stdout never reaches the parent process's pipe, so the gate is
// coordinated through files in the session's own sandbox cwd:
//
//   1. A Bash command the classifier doesn't recognise → allow immediately (exit 0).
//   2. A gated command → announce it by writing `intent-request.json` into the
//      coordination dir, then BLOCK polling for `intent-decision.json`. We gate:
//        - deletes: the rm family (matched by token basename, so `/bin/rm`, `\rm`,
//          `command rm`, `busybox rm` no longer bypass it), `find … -delete`, `git clean`;
//        - overwrites: bare `>`/`>>` onto a real file (not `/dev/null`), `tee` (no
//          `-a`), `dd of=…`, `truncate`, `sed -i`, `install`, `cp` with ≥2 positional
//          args (best-effort — can't statically know the destination exists);
//        - moves: `mv`;
//        - git publish: `git push` (→ git.push) and force variants (→ git.force_push);
//        - PRs: `gh pr create` (→ pr.open) and `gh pr merge` (→ pr.merge);
//        - mutating `gh api …` calls (Fáze 17.1): PUT/POST/PATCH/DELETE (or a field
//          flag implying POST) → `pr.merge`/`pr.open` when the path matches, else
//          the generic `gh.api_write`;
//        - EVERY `Task` call (an orchestrator delegating to a subagent) → `agent.delegate`
//          (Fáze 2a). Delegation happens entirely inside this one `claude -p` process, so
//          this hook is the only realtime signal the backend gets of a handoff — there is
//          no locked floor rule for it (default allow, Tier 1, just logged), but an
//          operator's own gate-rules.json rule on `action: agent.delegate` (e.g. `ask`)
//          takes effect immediately through the same protocol.
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
// a push/merge hidden behind `$(…)` nesting it can't normalize, an aliased binary, or
// a raw `curl` call to the GitHub API that bypasses `gh` entirely. `gh api …`
// mutations ARE now caught (Fáze 17.1): an explicit `-X`/`--method` of
// PUT/POST/PATCH/DELETE, or a `-f`/`-F`/`--field`/`--raw-field`/`--input` field flag
// that implies an implicit POST body — routed to `pr.merge`/`pr.open` when the path
// semantically matches, else the generic `gh.api_write` intent. A plain `gh api` GET
// (optionally `--paginate`) stays unclassified — reads are Tier-1. The locked floor +
// the non-interactive run shape are the real guarantees; this just routes the common
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

// File-removal binaries invoked directly. Matched by comparing each shell token's
// `path.basename()` against this set (see `isDestructive`/`parseTargets`) rather
// than a boundary-character regex — a regex's leading character class can never
// anticipate every prefix, and in fact didn't: `/bin/rm foo`, `\rm foo`,
// `command rm foo`, `busybox rm foo` all evaded the old `RM_FAMILY` regex because
// none of `/`, `\`, or a wrapper token were in its boundary class. Token/basename
// matching fixes all four shapes in one change, since `rm` still shows up as its
// own token (or basename of a path-qualified one) in every case.
const RM_FAMILY_NAMES = new Set(["rm", "rmdir", "unlink", "shred", "trash", "trash-put"]);

/**
 * Chain-severity rank: when a command chains several gated segments, we announce
 * the single most severe one. pr.merge (a locked deny) outranks a force-push, which
 * outranks a generic `gh api` write (unknown effect — could be anything from adding
 * a comment to deleting a ref, so it's ranked above the two *known*, bounded
 * git-publish actions below it), which outranks opening a PR, which outranks a
 * plain push, which outranks a delete.
 */
const ACTION_RANK = {
  delete: 0,
  overwrite: 0,
  move: 0,
  "git.push": 1,
  "pr.open": 2,
  "gh.api_write": 3,
  "git.force_push": 4,
  "pr.merge": 5,
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
  "gh.api_write": {
    summary: "Mutační volání GitHub API (gh api)",
    consequence: "Neznámý dopad — může měnit nastavení, oprávnění nebo obsah repozitáře na GitHubu.",
  },
};

/**
 * True for shell commands that delete files — one of the families we gate. A
 * denylist is inherently leaky, but it must at least cover the idioms an autonomous
 * tidy/clean agent reaches for: the rm family (by token basename — see
 * `RM_FAMILY_NAMES`), `find … -delete` (the `.DS_Store` sweep, no rm token), and
 * `git clean` (removes untracked files). `tokens` is the already-tokenized segment
 * (see `classifySegment`); `segment` is the raw string, still needed for the
 * `find`/`git clean` regexes below.
 */
function isDestructive(segment, tokens) {
  if (tokens.some((t) => RM_FAMILY_NAMES.has(path.basename(t)))) return true;
  if (/\bfind\b[\s\S]*\s-delete(\s|$)/.test(segment)) return true;
  if (/\bgit\s+clean(\s|$)/.test(segment)) return true;
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
    if (!RM_FAMILY_NAMES.has(path.basename(tokens[0] ?? ""))) continue;
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

/**
 * Flags accepted by `gh api` that consume the following token as their value —
 * so that value never gets mistaken for the request path. `-f`/`-F`/`--field`/
 * `--raw-field`/`--input` additionally imply an implicit POST body (tracked
 * separately, see {@link classifyGhApi}).
 */
const GH_API_FIELD_FLAGS = new Set(["-f", "-F", "--field", "--raw-field", "--input"]);
const GH_API_VALUE_FLAGS = new Set([
  "-X",
  "--method",
  "-R",
  "--repo",
  "-H",
  "--header",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "--cache",
]);

/**
 * Classify a `gh api <path> …` segment (Fáze 17.1 — the gap the header comment
 * used to admit by name). A mutating call is one with an explicit `-X`/`--method`
 * of PUT/POST/PATCH/DELETE, or any field flag (`-f`/`-F`/`--field`/`--raw-field`/
 * `--input`) — gh sends those as an implicit POST body even with no `-X`. A plain
 * GET (optionally `--paginate`) is left unclassified: reads are Tier-1.
 *
 * Two request shapes get an existing, semantically matching intent: a path
 * containing `/merges` IS a REST merge (`pr.merge`); a POST whose path ends in
 * `/pulls` IS creating a pull request (`pr.open`). Every other mutating call falls
 * back to the generic `gh.api_write` intent — `action` is a free string across the
 * approval/gate contracts (`z.string()`, no closed enum), so adding this new kind
 * costs nothing structurally; it just needs its own floor rule (see
 * `policy.storage.service.ts`) so it doesn't silently default-allow.
 */
function classifyGhApi(tokens, startIdx) {
  let method;
  let hasFieldFlag = false;
  let pathArg;
  for (let j = startIdx; j < tokens.length; j++) {
    const t = tokens[j];
    if (t === undefined) continue;
    const eqMatch = /^(-X|--method)=(.+)$/i.exec(t);
    if (eqMatch) {
      method = eqMatch[2];
      continue;
    }
    if (/^(-X|--method)$/i.test(t)) {
      method = tokens[j + 1];
      j += 1;
      continue;
    }
    if (GH_API_FIELD_FLAGS.has(t)) {
      hasFieldFlag = true;
      j += 1;
      continue;
    }
    if (GH_API_VALUE_FLAGS.has(t)) {
      j += 1;
      continue;
    }
    if (t.startsWith("-")) continue; // unknown flag — best-effort, assume no value
    if (pathArg === undefined) pathArg = t;
  }
  // Field flags send an implicit POST when no explicit method was given.
  const effectiveMethod = method ?? (hasFieldFlag ? "POST" : undefined);
  if (effectiveMethod === undefined || !/^(PUT|POST|PATCH|DELETE)$/i.test(effectiveMethod)) {
    return null;
  }
  const path = (pathArg ?? "").replace(/\?.*$/, "").replace(/\/$/, "");
  if (path.includes("/merges")) return { action: "pr.merge" };
  if (/^POST$/i.test(effectiveMethod) && path.endsWith("/pulls")) return { action: "pr.open" };
  return { action: "gh.api_write" };
}

/** Classify a `gh …` segment as opening/merging a PR, or a mutating `gh api` call. */
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
  const sub = tokens[i];
  if (sub === "pr") {
    const prSub = tokens[i + 1];
    if (prSub === "create") return { action: "pr.open" };
    if (prSub === "merge") return { action: "pr.merge" };
    return null;
  }
  if (sub === "api") return classifyGhApi(tokens, i + 1);
  return null;
}

/**
 * File-overwrite/rename commands whose destination isn't statically knowable to be
 * new vs. pre-existing — gated as best-effort (the file's own documented posture),
 * accepting some false positives over missing a real overwrite. Command identity is
 * by token basename (`path.basename(tokens[0])`), so a path-qualified invocation
 * (`/usr/bin/mv a b`) is recognised the same way the rm-family fix recognises
 * `/bin/rm`. Returns the enrichment kind (`"move"` / `"overwrite"`) or `null`.
 */
function classifyFsCommand(tokens) {
  const cmd = path.basename(tokens[0] ?? "");
  if (cmd === "mv") return "move";
  if (cmd === "cp") {
    // Can't know statically whether the destination already exists; gate any cp
    // that takes ≥2 positional (non-flag) args, per the file's best-effort posture.
    const positionals = tokens.slice(1).filter((t) => !t.startsWith("-"));
    return positionals.length >= 2 ? "overwrite" : null;
  }
  if (cmd === "tee") {
    // `-a`/`--append` doesn't truncate the destination; a bare `tee` does.
    const appends = tokens.slice(1).some((t) => t === "-a" || t === "--append");
    return appends ? null : "overwrite";
  }
  if (cmd === "dd") return tokens.slice(1).some((t) => /^of=/.test(t)) ? "overwrite" : null;
  if (cmd === "truncate") return "overwrite";
  if (cmd === "install") return "overwrite";
  if (cmd === "sed") return tokens.slice(1).some((t) => /^-i/.test(t)) ? "overwrite" : null;
  return null;
}

/**
 * True for a bare `>`/`>>` shell redirect onto a real file target — the idiom
 * `tokenize()` can't reliably isolate (the operator can be glued to its target with
 * no whitespace, e.g. `>file`). Scans the raw segment for a redirect operator,
 * skipping fd-duplication forms (`2>&1`, `>&2`, `>&-`) and a `/dev/null` discard
 * target (not a real-file overwrite) — both explicitly required to stay ungated.
 */
function classifyRedirectOverwrite(segment) {
  const re = /\d*(>{1,2})(&[-\d]+)?\s*(\S+)?/g;
  let m;
  while ((m = re.exec(segment)) !== null) {
    if (m[2]) continue; // fd duplication, e.g. `2>&1` — not a file write
    const target = m[3] ? m[3].replace(/^["']|["']$/g, "") : "";
    if (!target || target === "/dev/null") continue;
    return true;
  }
  return false;
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
  if (action === "overwrite" || action === "move") {
    // Irreversible-external-effect in the same way delete is (§Design), so it
    // reuses the "mazani" risk type the dashboard already renders correctly —
    // but keeps its own action id (not "delete") so gate rules and the approval
    // card can distinguish an overwrite/move from an actual deletion.
    return {
      action,
      riskType: "mazani",
      summary:
        action === "move" ? "Přesunout nebo přejmenovat soubor" : "Přepsat soubor",
      consequence:
        action === "move"
          ? "Soubor bude přesunut nebo přejmenován — může skončit mimo sledovaný adresář."
          : "Cílový soubor bude přepsán nebo zkrácen — původní obsah může být nenávratně ztracen.",
      preview: { kind: "command", shell: "bash", cmd: command, targets: [] },
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
  const fsKind = classifyFsCommand(tokens);
  if (fsKind) return enrich(fsKind, { command: fullCommand });
  if (isDestructive(segment, tokens)) return enrich("delete", { command: fullCommand });
  if (classifyRedirectOverwrite(segment)) return enrich("overwrite", { command: fullCommand });
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

/**
 * Bound on the delegated-prompt excerpt carried into the `agent.delegate` intent's
 * `context`. Kept short: unlike a Bash intent's `context` (a JSON display blob),
 * this `context` is a plain string the gate ALSO matches on (`MatchCondition` type
 * `"context"`), so it must stay a short, meaningful excerpt — not the whole prompt.
 */
const TASK_CONTEXT_CHARS = 200;

/**
 * Classify a `Task` tool call (the Agent tool's delegation — one subagent handoff)
 * into an `agent.delegate` intent. `subagent_type` becomes the intent's `scope` (so
 * an operator's gate rule can target one subagent, e.g. `scope: "cleaner*"`); the
 * delegated prompt (or, failing that, its `description`) is truncated into
 * `context` so the approval card shows what was actually asked of the subagent.
 * Every `Task` call classifies to SOMETHING (never null) — Fáze 2a's point is that
 * every handoff goes through the same gate protocol as a destructive Bash command,
 * even though the default decision (no floor rule for `agent.delegate`) is allow.
 */
export function classifyTask(toolInput) {
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  const scope = typeof input.subagent_type === "string" ? input.subagent_type : undefined;
  const prompt =
    typeof input.prompt === "string"
      ? input.prompt
      : typeof input.description === "string"
        ? input.description
        : "";
  const context =
    prompt.length > TASK_CONTEXT_CHARS ? `${prompt.slice(0, TASK_CONTEXT_CHARS)}…` : prompt;
  return {
    action: "agent.delegate",
    ...(scope ? { scope } : {}),
    ...(context ? { context } : {}),
  };
}

/**
 * Classify a PreToolUse event into the `intent-request.json` payload, or `null`
 * when nothing is gated (Bash's classifier fell through — the caller then lets
 * Claude's own permissions decide; every `Task` call always classifies to
 * something, see {@link classifyTask}). Pure and synchronous, called inside a
 * try/catch by `main()` so a classifier bug fails OPEN, never blocks the tool.
 */
function classifyEvent(input) {
  if (input?.tool_name === "Bash") {
    const cls = classify(input?.tool_input?.command ?? "");
    if (!cls) return null;
    return {
      action: cls.action,
      ...(cls.branch ? { branch: cls.branch } : {}),
      context: JSON.stringify({
        riskType: cls.riskType,
        summary: cls.summary,
        consequence: cls.consequence,
        preview: cls.preview,
      }),
    };
  }
  if (input?.tool_name === "Task") return classifyTask(input?.tool_input);
  return null;
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

  // Fail OPEN: a classifier exception must never block all Bash/Task calls (this
  // hook sits in the spawn path of every run) — an unclassified command, or a
  // non-Bash/Task tool, falls through to Claude's own permissions.
  let request = null;
  try {
    request = classifyEvent(input);
  } catch {
    request = null;
  }
  if (!request) process.exit(0);

  // The sandbox RunnerCore watches — pinned via env, not the command's cwd.
  const cwd = process.env.ZIBBY_INTENT_DIR || input.cwd || process.cwd();

  writeFileSync(path.join(cwd, REQUEST_FILE), JSON.stringify(request), "utf8");

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
