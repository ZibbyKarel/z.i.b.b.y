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
//      Independently of all that, a Bash call that hits the approvals decision API
//      (approve/reject/revise/answer) or touches the operator token is hard-denied
//      (`touchesOperatorOnly`) — deciding an approval is the operator's alone.
//   3. RunnerCore watches the dir for the request, routes it through the gate
//      evaluator (allow / ask-a-human / deny), and writes the decision file.
//   4. The hook returns the decision to Claude as `hookSpecificOutput`, which
//      overrides `--permission-mode dontAsk` (verified by spike).
//   5. The hook NEVER outlives Claude Code's hook timeout: a hook killed at that
//      timeout is a NON-decision, and under `dontAsk` the pending command then
//      executes as if approved. So the hook takes its own, shorter deadline as
//      argv[2] and DENIES fail-closed when it elapses, before the CLI kills it.
//
//   6. Ownership (see `analyzeOwnership`): a file the session created itself is its
//      own scratch — overwriting, moving or deleting it later is NOT gated. The
//      per-session ledger `created-files.json` in the coordination dir records each
//      path a Bash/Write call creates; every doubt falls back to the gate.
//
//   7. Free zone (`ZIBBY_FREE_DIRS`, set by RunnerCore): the project checkout, the
//      sandbox, the granted dirs and the temp dirs. A file effect (or a Write/Edit)
//      whose every target lands inside it is not gated at all; one that reaches a
//      path outside it — someone else's system or user folder — always asks, even
//      for a path that doesn't exist yet. Without the env (tests, non-RunnerCore
//      callers) the old behaviour stands: only pre-existing, non-owned files gate.
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

import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUEST_FILE = "intent-request.json";
const DECISION_FILE = "intent-decision.json";
const LEDGER_FILE = "created-files.json";
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
    consequence:
      "Neznámý dopad — může měnit nastavení, oprávnění nebo obsah repozitáře na GitHubu.",
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
const DEV_SINKS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

function classifyRedirectOverwrite(segment) {
  // Quote-aware first: a `>` inside a quoted string (`grep "a->b"`) is no redirect,
  // and `2>/dev/null)` inside `$(…)` targets `/dev/null`, not `/dev/null)`. Only an
  // unlexable segment (a quote the naive chain split cut in half) takes the raw scan.
  const lexed = lex(segment);
  if (lexed) {
    return lexed.some((s) => s.redirects.some((t) => t === null || !DEV_SINKS.has(t)));
  }
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
      summary: action === "move" ? "Přesunout nebo přejmenovat soubor" : "Přepsat soubor",
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
  const text = stripCatHeredocs(command);
  for (const segment of text.split(/&&|\|\||;|\||\n|&/)) {
    const c = classifySegment(segment.trim(), command);
    if (c && (best === null || ACTION_RANK[c.action] > ACTION_RANK[best.action])) best = c;
  }
  // Redirects are judged on the whole command: the naive split above cuts quotes in half.
  if (best === null && classifyRedirectOverwrite(text)) best = enrich("overwrite", { command });
  return best;
}

/**
 * Drop the body of a `cat … <<'DELIM'` heredoc — it is data being written to a
 * file, not shell, so a Python `'-->'` or an `rm` word inside it must not be
 * classified as a command. Only a QUOTED delimiter qualifies (an unquoted body
 * still expands `$(…)`), on a line whose simple command is a plain `cat` (no pipe,
 * no substitution, no quote before it, no trailing `\` continuation): `bash <<EOF`,
 * `cat <<EOF | sh` and `"$(cat <<EOF …)"` all EXECUTE their body, so those stay.
 */
function stripCatHeredocs(command) {
  const lines = command.split("\n");
  const out = [];
  const opener =
    /^\s*(?:[^|`$()"'\n]*(?:&&|;)\s*)?cat\b[^|;&`$()<]*<<(-?)\s*(['"])([A-Za-z_][\w.-]*)\2[^|;&`$()<\\]*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = opener.exec(lines[i]);
    const dash = m?.[1];
    const delim = m?.[3];
    const end = m
      ? lines.findIndex((l, j) => j > i && (dash ? l.replace(/^\t+/, "") : l) === delim)
      : -1;
    if (end === -1) {
      out.push(lines[i]);
      continue;
    }
    // Keep the command, drop the `<<'DELIM'` operator, the body and the delimiter.
    out.push(lines[i].replace(/<<-?\s*(['"])[A-Za-z_][\w.-]*\1/, ""));
    i = end;
  }
  return out.join("\n");
}

// ── Ownership: files the agent created itself ────────────────────────────────
//
// A file this agent session created (it did not exist when the creating command was
// announced) is the agent's own scratch — overwriting, moving or deleting it later
// is Tier 1, not a gate prompt. RunnerCore's intent dir carries a per-session ledger
// (`created-files.json`) of every such path; a directory in it covers everything
// beneath it (files a script wrote into the agent's own dir are its own too).
//
// This is an EXEMPTION from the gate, so every doubt keeps the gate: a target that
// isn't a literal word (`$var`, glob, `~user`, `$(…)`, a symlink leaf), a relative
// path after a `cd`, an effect with no enumerable targets (`find -delete`,
// `git clean`, `xargs rm`, `install`), or anything that pre-existed and is not in
// the ledger → the command is gated exactly as before. The coordination files
// themselves (request/decision/ledger) are never ownable. Known ceiling: a script
// (`python x.py`) can still write the ledger directly — no worse than today, since
// the same script could delete the file without any gate at all.

const COORDINATION_FILES = [REQUEST_FILE, DECISION_FILE, LEDGER_FILE];
const FS_ACTIONS = new Set(["delete", "overwrite", "move"]);

/**
 * Quote-aware lexer: split a command into simple commands at unquoted `;` `&` `|`
 * newline `(` `)`, each with its argv `words` and its `>`/`>>`/`&>`/`<>` redirect
 * targets (`null` = a redirect whose target isn't a readable word). Returns `null`
 * on an unterminated quote — the caller then keeps the gate.
 */
function lex(text) {
  const segments = [];
  let seg = { words: [], redirects: [] };
  let word = "";
  let inWord = false;
  let pending = null; // "redirect" | "input" — what the next word belongs to
  const endWord = () => {
    if (inWord) {
      if (pending === "redirect") seg.redirects.push(word);
      else if (pending !== "input") seg.words.push(word);
      pending = null;
    }
    word = "";
    inWord = false;
  };
  const endSeg = () => {
    endWord();
    if (pending === "redirect") seg.redirects.push(null);
    pending = null;
    if (seg.words.length || seg.redirects.length) segments.push(seg);
    seg = { words: [], redirects: [] };
  };
  /** An all-digit word glued to a redirect operator is its fd (`2>`), not an arg. */
  const startOperator = () => {
    if (inWord && /^\d+$/.test(word)) {
      word = "";
      inWord = false;
    } else endWord();
    if (pending === "redirect") seg.redirects.push(null);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      if (text[i + 1] !== "\n") {
        word += text[i + 1] ?? "";
        inWord = true;
      }
      i++;
      continue;
    }
    if (c === "'") {
      const j = text.indexOf("'", i + 1);
      if (j === -1) return null;
      word += text.slice(i + 1, j);
      inWord = true;
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        // Inside double quotes a backslash only escapes $ ` " \ and newline.
        if (text[j] === "\\" && /[$`"\\\n]/.test(text[j + 1] ?? "")) {
          if (text[j + 1] !== "\n") word += text[j + 1];
          j += 2;
          continue;
        }
        word += text[j];
        j++;
      }
      if (j >= text.length) return null;
      inWord = true;
      i = j;
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      continue;
    }
    if (c === "#" && !inWord) {
      // A comment runs to end of line — its quotes must not pair with real ones.
      const nl = text.indexOf("\n", i);
      i = (nl === -1 ? text.length : nl) - 1;
      continue;
    }
    if (c === "\n" || c === ";" || c === "|" || c === "(" || c === ")") {
      endSeg();
      continue;
    }
    if (c === "&") {
      if (text[i + 1] !== ">") {
        endSeg();
        continue;
      }
      i++; // `&>` / `&>>` — stdout+stderr to a file
      startOperator();
      if (text[i + 1] === ">") i++;
      pending = "redirect";
      continue;
    }
    if (c === ">") {
      startOperator();
      if (text[i + 1] === ">") i++;
      if (text[i + 1] === "|" || text[i + 1] === "!") i++; // `>|`, zsh `>!` clobber
      if (text[i + 1] === "&") {
        const dup = /^&(\d+|-)/.exec(text.slice(i + 1));
        if (dup) {
          i += dup[0].length; // `2>&1`, `>&-` — fd duplication, not a file
          continue;
        }
        i++; // `>&file` — both streams to a file
      }
      pending = "redirect";
      continue;
    }
    if (c === "<") {
      startOperator();
      if (text[i + 1] === ">") {
        i++; // `<>` opens read-write
        pending = "redirect";
        continue;
      }
      while (text[i + 1] === "<" || text[i + 1] === "-") i++; // `<<`, `<<-`, `<<<`
      pending = "input"; // input file / heredoc delimiter / here-string — not a write
      continue;
    }
    word += c;
    inWord = true;
  }
  endSeg();
  return segments;
}

/**
 * Resolve a literal path word against `cwd` to its canonical absolute path
 * (symlinked ancestors like macOS `/tmp` → `/private/tmp` resolved). `null` when
 * the word isn't a literal path, it's relative with no known cwd, or the leaf is a
 * symlink (deleting the link vs. writing through it can't be told apart here).
 * `firstMissing` is the topmost ancestor that doesn't exist yet — what a create
 * records, so `mkdir -p a/b/c` owns `a` and everything below it.
 */
function resolvePath(word, cwd) {
  // Anything a shell (bash or zsh) could expand, plus `..` — the kernel walks `..`
  // physically through a symlink while `path.resolve` would collapse it lexically.
  if (typeof word !== "string" || !word || /[$`*?[\]{}\n^#()<>!\\]/.test(word)) return null;
  if (word.startsWith("=") || word.split("/").includes("..")) return null;
  let p = word;
  if (p === "~" || p.startsWith("~/")) p = path.join(os.homedir(), p.slice(1));
  if (p.includes("~")) return null;
  if (!path.isAbsolute(p)) {
    if (!cwd) return null;
    p = path.resolve(cwd, p);
  }
  p = path.resolve(p);
  const tail = [];
  let head = p;
  let leaf;
  for (;;) {
    try {
      leaf = lstatSync(head);
      break;
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return null;
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
  if (tail.length === 0 && leaf.isSymbolicLink()) return null;
  let real;
  try {
    real = realpathSync(head);
  } catch {
    return null;
  }
  return {
    abs: path.join(real, ...tail),
    exists: tail.length === 0,
    isDir: tail.length === 0 && leaf.isDirectory(),
    // A second hard link makes "this path's content" someone else's file too.
    sharedInode: tail.length === 0 && !leaf.isDirectory() && leaf.nlink > 1,
    missingDepth: tail.length,
    firstMissing: tail.length ? path.join(real, tail[0]) : null,
  };
}

/** True for a path inside (or equal to) an entry of the ledger. */
function isOwned(abs, ledger) {
  return ledger.some((e) => abs === e || abs.startsWith(e.endsWith(path.sep) ? e : e + path.sep));
}

/**
 * The free-zone roots from `ZIBBY_FREE_DIRS` (`path.delimiter`-separated), each
 * canonicalized like a resolved target so `/tmp` matches `/private/tmp/...`.
 * Missing entries are dropped; an empty list means "no free zone".
 */
function readFreeRoots(env = process.env.ZIBBY_FREE_DIRS) {
  if (!env) return [];
  const roots = [];
  for (const dir of env.split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    try {
      roots.push(realpathSync(dir));
    } catch {
      // missing dir — not part of the zone
    }
  }
  return roots;
}

/** The intent dir itself, any ancestor of it, or one of its coordination files. */
function isCoordination(abs, intentDir) {
  const rel = path.relative(abs, intentDir);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return true;
  return COORDINATION_FILES.some((f) => abs === path.join(intentDir, f));
}

/** Positional args of an argv tail: non-flags, everything after `--`, skipping flag values. */
function positionals(args, valueFlags = new Set()) {
  const out = [];
  let flagsDone = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flagsDone || !a.startsWith("-") || a === "-") out.push(a);
    else if (a === "--") flagsDone = true;
    else if (valueFlags.has(a)) i++;
  }
  return out;
}

/** The flags of an argv tail (up to `--`). */
function flagsOf(args) {
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).filter((a) => a.startsWith("-") && a !== "-");
}

/**
 * True for a sed script made only of plain `s/…/…/flags` commands — no `w`/`W`
 * (write a file), `e` (run a command), `r`/`R` or any other command that touches
 * paths beyond the in-place target.
 */
function isPlainSubstitution(script) {
  let i = 0;
  const n = script.length;
  for (;;) {
    while (i < n && /[\s;]/.test(script[i])) i++;
    if (i >= n) return true;
    if (script[i] !== "s") return false;
    const d = script[i + 1];
    if (!d || /[\s\\]/.test(d)) return false;
    i += 2;
    for (let part = 0; part < 2; part++) {
      while (i < n && script[i] !== d) i += script[i] === "\\" ? 2 : 1;
      if (i >= n) return false;
      i++;
    }
    while (i < n && /[gIip0-9M]/.test(script[i])) i++;
    if (i < n && !/[\s;]/.test(script[i])) return false;
  }
}

/** cp/mv flags whose effect on the written path is fully understood. */
const CP_MV_SAFE_SHORT = /^-[rRfvpaiPLHn]+$/;
const CP_MV_SAFE_LONG = new Set(["--recursive", "--force", "--verbose", "--no-clobber"]);

/**
 * Decide whether a Bash command's gated file effects (overwrite / move / delete)
 * all land on paths this session owns or that don't exist yet, and collect the
 * paths it creates. Pure apart from reading the filesystem — exported for tests.
 * `exempt: false` means "gate as usual"; it is the answer to every doubt.
 * `touchesCoordination` flags a literal write onto the gate's own files.
 */
export function analyzeOwnership(command, { cwd, ledger, intentDir, free = [] }) {
  const creates = [];
  const closed = { exempt: false, creates, touchesCoordination: false };
  if (typeof command !== "string") return closed;
  const text = stripCatHeredocs(command);
  // Command/process substitution, ANSI-C quoting and any heredoc left unstripped
  // (its body is not shell this lexer can read) are beyond this check.
  if (/\$\(|`|\$'|[<>]\(|<<(?!<)/.test(text)) return closed;
  const segments = lex(text);
  if (!segments) return closed;
  // Every dir a relative path could be relative to by now: the start cwd plus each
  // literal `cd` target (a failed `cd x; …` leaves the old one in force). A relative
  // target must be acceptable from all of them. `null` = unknowable (`pushd`, `cd -`).
  let cwds = cwd ? [cwd] : null;
  const resolve = (word) => {
    if (typeof word === "string" && (path.isAbsolute(word) || word.startsWith("~"))) {
      return resolvePath(word, null);
    }
    if (!cwds) return null;
    const all = cwds.map((d) => resolvePath(word, d));
    return all.every(acceptable) ? all.at(-1) : null;
  };
  let exempt = true;
  let touchesCoordination = false;

  function acceptable(r) {
    if (r === null || isCoordination(r.abs, intentDir) || r.sharedInode) return false;
    if (isOwned(r.abs, ledger)) return true;
    // With a free zone, outside it nothing passes — not even a brand-new path.
    return free.length ? isOwned(r.abs, free) : !r.exists;
  }
  /** A path the command overwrites/moves/deletes — must be owned or not exist. */
  const mutates = (r) => {
    if (r && isCoordination(r.abs, intentDir)) touchesCoordination = true;
    if (!acceptable(r)) exempt = false;
  };
  /**
   * A path the command creates — recorded when it doesn't exist yet and its parent
   * does (a write into a missing dir fails); `parents` for `mkdir -p`.
   */
  const records = (r, parents = false) => {
    if (!r) return;
    if (isCoordination(r.abs, intentDir)) touchesCoordination = true;
    if (r.exists || !(parents || r.missingDepth === 1)) return;
    if (!isCoordination(r.firstMissing, intentDir)) creates.push(r.firstMissing);
  };
  /** cp/mv destination(s): `dest/<basename>` per source when dest is an existing dir. */
  const destinations = (sources, destWord) => {
    const d = resolve(destWord);
    if (!d || !d.isDir) return [d];
    return sources.map((s) => resolve(path.join(destWord, path.basename(s))));
  };

  for (const { words, redirects } of segments) {
    for (const target of redirects) {
      if (target === "/dev/null" || target === "/dev/stdout" || target === "/dev/stderr") continue;
      const r = resolve(target);
      mutates(r);
      records(r);
    }
    if (!words.length) continue;
    const cmd = path.basename(words[0]);
    const args = words.slice(1);
    const flags = flagsOf(args);

    if (/^(pushd|popd)$/.test(cmd)) cwds = null;
    if (cmd === "cd" && cwds) {
      const dest = positionals(args);
      const resolved =
        dest.length === 1 && dest[0] !== "-" ? cwds.map((d) => resolvePath(dest[0], d)) : [null];
      // A not-yet-existing target is fine: `mkdir -p x && cd x` resolves the same.
      const ok = resolved.every((r) => r && (r.isDir || !r.exists));
      cwds = ok ? [...new Set([...cwds, ...resolved.map((r) => r.abs)])] : null;
    }

    const rmAt = words.findIndex((w) => RM_FAMILY_NAMES.has(path.basename(w)));
    if (rmAt !== -1) {
      const targets = positionals(words.slice(rmAt + 1));
      // Only a plain `rm …` names its own targets: `xargs rm`, `git -C x rm`,
      // `find -exec rm`, `env -C x rm` get them (or their cwd) from elsewhere.
      if (rmAt !== 0 || !targets.length) exempt = false;
      targets.forEach((t) => mutates(resolve(t)));
    }
    if (cmd === "find" && words.includes("-delete")) {
      // The start points are the deleted set's roots: after -H/-L/-P, before the expression.
      let i = 1;
      while (/^-[HLP]$/.test(words[i] ?? "")) i++;
      const roots = [];
      for (; i < words.length && !/^[-(!]/.test(words[i]); i++) roots.push(words[i]);
      (roots.length ? roots : ["."]).forEach((t) => mutates(resolve(t)));
    } else if (words[0] === "git" && words[1] === "clean") {
      mutates(resolve("."));
    } else if (words.includes("-delete") || (words.includes("git") && words.includes("clean"))) {
      exempt = false; // implicit target set
    }

    if (cmd === "cp" || cmd === "mv") {
      const pos = positionals(args);
      const known = flags.every((f) => CP_MV_SAFE_SHORT.test(f) || CP_MV_SAFE_LONG.has(f));
      // BSD `cp -R src/ dest` copies src's CONTENTS into dest, not dest/src.
      if (!known || pos.slice(0, -1).some((s) => s.endsWith("/") || s.endsWith("/."))) {
        exempt = false;
      } else if (pos.length >= 2) {
        const sources = pos.slice(0, -1);
        const dests = destinations(sources, pos.at(-1));
        dests.forEach((r) => mutates(r));
        if (cmd === "mv") {
          const srcs = sources.map(resolve);
          srcs.forEach(mutates);
          // A moved file stays ours only if what was moved was ours.
          if (srcs.every((r) => r && r.exists && isOwned(r.abs, ledger))) {
            dests.forEach((r) => records(r));
          }
        } else dests.forEach((r) => records(r));
      }
    } else if (cmd === "tee") {
      const appends = flags.some((f) => f === "-a" || f === "--append");
      for (const t of positionals(args)) {
        const r = resolve(t);
        if (!appends) mutates(r);
        records(r);
      }
    } else if (cmd === "sed" && flags.some((f) => /^-i/.test(f) || f === "--in-place")) {
      const scripts = [];
      const files = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-e" || a === "--expression") scripts.push(args[++i] ?? "");
        else if (a.startsWith("--expression=")) scripts.push(a.slice("--expression=".length));
        else if (a === "-f" || a.startsWith("--file"))
          exempt = false; // script from a file
        else if (a === "-i" && args[i + 1] === "")
          i++; // BSD `sed -i '' …`
        else if (a === "-l") i++;
        else if (/^-[^-]*[ef]/.test(a))
          exempt = false; // `-ne 's/…/'` — script glued to a cluster
        else if (!a.startsWith("-") || a === "-") files.push(a);
      }
      if (!scripts.length) scripts.push(files.shift() ?? "");
      if (!files.length || !scripts.every(isPlainSubstitution)) exempt = false;
      files.forEach((t) => mutates(resolve(t)));
    } else if (cmd === "truncate") {
      const noCreate = flags.some((f) => f === "-c" || f === "--no-create");
      for (const t of positionals(args, new Set(["-s", "--size", "-r", "--reference"]))) {
        const r = resolve(t);
        mutates(r);
        if (!noCreate) records(r);
      }
    } else if (cmd === "dd") {
      for (const a of args) {
        if (!a.startsWith("of=")) continue;
        const r = resolve(a.slice(3));
        mutates(r);
        records(r);
      }
    } else if (cmd === "install") {
      exempt = false; // -d/-t/-D forms — destination not worth parsing
    } else if (cmd === "mkdir") {
      const parents = flags.some((f) => /^-[^-]*p/.test(f) || f === "--parents");
      positionals(args, new Set(["-m", "--mode"])).forEach((t) => records(resolve(t), parents));
    } else if (cmd === "touch" && !flags.some((f) => /^-[^-]*c/.test(f) || f === "--no-create")) {
      positionals(args, new Set(["-r", "-t", "-d", "--reference", "--date"])).forEach((t) =>
        records(resolve(t)),
      );
    }
  }
  return { exempt, creates, touchesCoordination };
}

/**
 * Read the session's ledger. It must be a plain, singly-linked file — a symlink or
 * a hard link means someone other than the hook can rewrite it, so it counts as
 * empty. Malformed entries, or ones pointing at the intent dir, are dropped.
 */
function readLedger(ledgerPath, intentDir) {
  try {
    const st = lstatSync(ledgerPath);
    if (!st.isFile() || st.nlink !== 1) return [];
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8"));
    return Array.isArray(raw)
      ? raw.filter(
          (e) => typeof e === "string" && path.isAbsolute(e) && !isCoordination(e, intentDir),
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Where a Write/Edit `file_path` actually lands: the realpath when it exists
 * (following a symlink leaf), else the realpath of its deepest existing ancestor
 * plus the rest. `null` when it can't be told (relative with no cwd, dangling link).
 */
function landingPath(filePath, cwd) {
  if (typeof filePath !== "string" || !filePath) return null;
  if (!path.isAbsolute(filePath) && !cwd) return null;
  let head = path.resolve(cwd ?? "/", filePath);
  const tail = [];
  for (;;) {
    try {
      return path.join(realpathSync(head), ...tail);
    } catch {
      try {
        lstatSync(head);
        return null; // exists but realpath fails — a dangling symlink
      } catch {
        const parent = path.dirname(head);
        if (parent === head) return null;
        tail.unshift(path.basename(head));
        head = parent;
      }
    }
  }
}

/**
 * Apply the ownership ledger to one PreToolUse event: record what a Bash/Write call
 * creates, and lift the gate (→ `null`) from a file-effect request whose every
 * target is the session's own. A write aimed at a coordination file returns a
 * `deny` marker — the ledger and the gate files are off-limits to the agent.
 * The ledger is only written for a call that runs without asking (a Write, or a
 * Bash command with no remaining request): a gated create the operator later
 * denies must not leave an "owned" path behind.
 */
function applyOwnership(input, request, intentDirEnv) {
  const intentDir = realpathSync(intentDirEnv);
  const ledgerPath = path.join(intentDir, LEDGER_FILE);
  const ledger = readLedger(ledgerPath, intentDir);
  const free = readFreeRoots();
  let creates = [];
  let result = request;
  const tool = input?.tool_name;
  if (tool === "Write" || tool === "Edit") {
    // An unknowable landing spot (a dangling symlink would CREATE its target) is
    // denied along with the coordination files themselves.
    const landing = landingPath(input?.tool_input?.file_path, input?.cwd);
    if (landing === null || isCoordination(landing, intentDir)) return { deny: true };
    if (free.length && !isOwned(landing, free) && !isOwned(landing, ledger)) {
      return outsideWriteRequest(tool, landing);
    }
    const r = tool === "Write" ? resolvePath(input?.tool_input?.file_path, input?.cwd) : null;
    if (r && !r.exists && !isCoordination(r.firstMissing, intentDir)) creates = [r.firstMissing];
  } else if (tool === "Bash") {
    const analysis = analyzeOwnership(input?.tool_input?.command, {
      cwd: input?.cwd,
      ledger,
      intentDir,
      free,
    });
    if (analysis.touchesCoordination) return { deny: true };
    if (request && FS_ACTIONS.has(request.action) && analysis.exempt) result = null;
    if (result === null) creates = analysis.creates;
  }
  const fresh = [...new Set(creates)].filter((p) => !isOwned(p, ledger));
  if (fresh.length) writeFileSync(ledgerPath, JSON.stringify([...ledger, ...fresh]), "utf8");
  return result;
}

/** A Write/Edit landing outside the free zone — asked like a Bash overwrite. */
function outsideWriteRequest(tool, landing) {
  return {
    action: "overwrite",
    context: JSON.stringify({
      riskType: "mazani",
      summary: "Zapsat soubor mimo projekt",
      consequence: "Agent zapisuje mimo repozitář projektu a dočasné složky.",
      preview: { kind: "command", shell: "bash", cmd: `${tool} ${landing}`, targets: [landing] },
    }),
  };
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
export function classifyEvent(input) {
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
  // An agent's question to the operator always goes through the gate (a locked
  // ask:human floor) — even an empty one, so the tool can never answer itself.
  if (input?.tool_name === "mcp__zibby-run__ask_operator") {
    const q =
      String(input?.tool_input?.question ?? "")
        .trim()
        .slice(0, 2000) || "(empty question)";
    return {
      action: "operator.question",
      context: JSON.stringify({
        riskType: "question",
        summary: q,
        consequence: "The run waits for your answer.",
      }),
    };
  }
  return null;
}

// Operator-only surface (Laws 1 & 4): deciding an approval is the operator's alone.
// ponytail: substring/path match, not a parser — catches every HTTP client by URL path
// and every tool by the token directory; an agent that assembles the path at runtime
// (string concat) still hits the API guard's 401, which is the real lock. The token
// env var is stripped from agent processes (not matched here), so repo code that
// merely mentions "operator-token" stays greppable. This is the early, explainable denial.
const APPROVAL_DECIDE = /\/api\/approvals\/[^\s/'"]+\/(approve|reject|revise|answer)\b/i;
const OPERATOR_SECRET = /\.config\/zibby(\/|\b)/i;
export function touchesOperatorOnly(command) {
  const text = String(command ?? "");
  return APPROVAL_DECIDE.test(text) || OPERATOR_SECRET.test(text);
}

const OPERATOR_ONLY_FIELDS = {
  Bash: ["command"],
  Read: ["file_path", "path", "pattern"],
  Grep: ["file_path", "path", "pattern"],
  Glob: ["file_path", "path", "pattern"],
  Write: ["file_path", "content"],
  Edit: ["file_path", "new_string"],
};

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

  const fields = OPERATOR_ONLY_FIELDS[input?.tool_name] ?? [];
  if (fields.some((f) => touchesOperatorOnly(input?.tool_input?.[f]))) {
    decide(
      "deny",
      "Approvals are decided by the operator only — agents cannot call the approvals API or read the operator token.",
    );
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
  // The ownership ledger only ever LIFTS a gate, so it fails CLOSED: on any error
  // the classified request stands unchanged.
  if (process.env.ZIBBY_INTENT_DIR) {
    try {
      const owned = applyOwnership(input, request, process.env.ZIBBY_INTENT_DIR);
      if (owned?.deny) decide("deny", "The gate's coordination files are off-limits.");
      request = owned;
    } catch {
      // keep `request`
    }
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
