import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import type { HandoffSeverity, HandoffSignal, Project } from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { HandoffService } from "../handoff/handoff.service";
import { subsystemShelfId } from "../memory/subsystem-shelf";
import { VaultService } from "../memory/vault.service";
import { resolveGithubToken } from "../projects/project-pr.service";
import { ProjectLocalService } from "../projects/project-local.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { ActivityLogService } from "../activity/activity-log.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { SubsystemFindingsStore } from "../subsystems/subsystem-findings.store";

const GITHUB_API = "https://api.github.com";

/** The findings-store snapshot key + the vault note id (gap-detector's note pattern). */
const FINDINGS_KEY = "sentinel";
const NOTE_ID = "suggestions/security-findings";

/** A dependency CVE from GitHub Dependabot's open alerts. */
export interface SentinelCveFinding {
  kind: "cve";
  fingerprint: string;
  projectId: string;
  projectName: string;
  repo: string;
  severity: string;
  cveId?: string;
  package?: string;
  summary?: string;
  url?: string;
}

/**
 * A possible leaked secret found in a project's local clone. Binding ruling
 * (orchestrator review addendum #2): NEVER carries the matched secret value —
 * only `file`/`line`/`rule`, which is all that reaches the vault note, the
 * briefing line, the activity summary and the fingerprint.
 */
export interface SentinelSecretFinding {
  kind: "secret";
  fingerprint: string;
  projectId: string;
  projectName: string;
  file: string;
  line: number;
  rule: string;
}

export type SentinelFinding = SentinelCveFinding | SentinelSecretFinding;

/** Tolerant shape of one `GET /repos/{repo}/dependabot/alerts` entry. */
interface GitHubDependabotAlert {
  number?: number;
  security_advisory?: { severity?: string; cve_id?: string; summary?: string };
  dependency?: { package?: { name?: string } };
  html_url?: string;
}

/**
 * The curated secret-pattern rule set (kept deliberately small, per the plan).
 * Each rule is a `(name, pattern)` pair; the rule NAME (never the match) rides
 * into the finding.
 */
const SECRET_RULES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "github-pat", pattern: /ghp_[0-9A-Za-z]{36}/ },
  { name: "private-key", pattern: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/ },
  { name: "slack-token", pattern: /xox[baprs]-[0-9A-Za-z-]+/ },
  {
    name: "generic-secret-assignment",
    pattern: /(password|secret|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
];

/** Directories the secret scan never descends into. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
/** Binary/asset extensions the secret scan never reads as text. */
const SKIP_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".mp4",
  ".mp3",
  ".lock",
]);
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES_SCANNED = 5000;

/** Sha1 hex digest — the fingerprint's collision-resistant tail. */
function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

/**
 * GitHub Dependabot severities → the handoff ladder. Behavior-critical: an
 * unknown/absent severity falls back to `"low"` (never `"critical"`), so the
 * seed rule's `minSeverity: "critical"` keeps rejecting it — preserving
 * today's exact dispatch set (only `severity === "critical"` fires).
 */
const SEVERITY_MAP: Record<string, HandoffSeverity> = {
  low: "low",
  moderate: "moderate",
  high: "high",
  critical: "critical",
};

/** One human line for the vault note / briefing — never the matched secret text. */
function toFindingLine(finding: SentinelFinding): string {
  if (finding.kind === "cve") {
    const sev = finding.severity.toUpperCase();
    const pkg = finding.package ? ` in ${finding.package}` : "";
    const cve = finding.cveId ? ` (${finding.cveId})` : "";
    const summary = finding.summary ? ` — ${finding.summary}` : "";
    return `${finding.projectName}: ${sev} vulnerability${pkg}${cve} — ${finding.repo}${summary}`;
  }
  return `${finding.projectName}: possible secret in ${finding.file}:${finding.line} (${finding.rule})`;
}

/**
 * NS2 F5a — Sentinel's scheduled security watch. Per project: open Dependabot
 * alerts over REST (the token-resolution seam `ProjectPrService` already
 * uses) plus a bounded secret-pattern scan over the local clone. Findings are
 * a vault-note proposal (gap-detector's pattern) filed onto Sentinel's shelf
 * and read back for the briefing; every NEW finding is ALSO normalized into a
 * {@link HandoffSignal} and routed through the {@link HandoffService} rule
 * engine (A3) — a critical CVE still ends up dispatching a gated fix task
 * through the ordinary scheduler (it still ends at the PR gate, same as every
 * other autonomous fix), now because the seed rule's `minSeverity: "critical"`
 * says so, not a hard-coded `if`; a secret finding matches no seed rule and
 * never dispatches. Fail-open everywhere: a missing github link, a
 * 403/404/429 from Dependabot, or a project with no local clone all read as
 * "nothing to show", never a thrown error out of the scheduler's tick.
 */
@Injectable()
export class SentinelService {
  private readonly fetchImpl: typeof fetch;
  private readonly log: ScopedLogger;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly projectLocal: ProjectLocalService,
    private readonly vault: VaultService,
    private readonly handoff: HandoffService,
    private readonly activity: ActivityLogService,
    private readonly findingsStore: SubsystemFindingsStore,
    logger: LoggerService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.log = logger.child(SentinelService.name);
  }

  /** Scan every project for open CVEs + possible leaked secrets. */
  async scan(now: Date = new Date()): Promise<{ findings: SentinelFinding[] }> {
    const projects = await this.projects.list().catch(() => []);
    const findings: SentinelFinding[] = [];
    for (const project of projects) {
      try {
        findings.push(...(await this.scanDependabot(project)));
      } catch (err) {
        this.log.warn("sentinel: dependabot scan failed", {
          project: project.id,
          error: String(err),
        });
      }
      try {
        findings.push(...(await this.scanSecrets(project)));
      } catch (err) {
        this.log.warn("sentinel: secret scan failed", { project: project.id, error: String(err) });
      }
    }

    const currentFingerprints = new Set(findings.map((f) => f.fingerprint));
    const lastFingerprints = await this.findingsStore.read(FINDINGS_KEY);
    const newFindings = findings.filter((f) => !lastFingerprints.has(f.fingerprint));
    const changed =
      currentFingerprints.size !== lastFingerprints.size ||
      [...currentFingerprints].some((fp) => !lastFingerprints.has(fp));

    if (!changed) {
      this.log.info("sentinel: no new findings", { scanned: projects.length });
      await this.findingsStore.write(FINDINGS_KEY, currentFingerprints);
      return { findings };
    }

    await this.writeFindings(findings, now).catch((err) => {
      this.log.warn("sentinel: failed to write findings to vault", { error: String(err) });
    });
    await this.vault
      .updateIndex(
        subsystemShelfId("sentinel"),
        NOTE_ID,
        `Bezpečnostní nálezy — ${now.toISOString().slice(0, 10)}`,
      )
      .catch(() => {});
    await this.findingsStore.write(FINDINGS_KEY, currentFingerprints);
    void this.activity.record({
      kind: "subsystem-scan",
      summary: `Sentinel: ${newFindings.length} nových bezpečnostních nálezů`,
      refs: { noteId: NOTE_ID },
    });

    for (const finding of newFindings) {
      try {
        // The handoff engine decides tier/dispatch from the rule table — a secret
        // signal matches no seed rule (`{ action: "none" }`), same as today; a
        // non-critical CVE is gated out by the seed rule's `minSeverity: "critical"`.
        await this.handoff.evaluate(this.toSignal(finding));
      } catch (err) {
        // Belt-and-suspenders: `evaluate` is itself fail-open and never throws, but
        // the scan tick must survive regardless. A failed handoff leaves the
        // finding in the note; the next scan retries it (same fingerprint).
        this.log.warn("sentinel: handoff evaluate failed — finding stays for retry", {
          fingerprint: finding.fingerprint,
          error: String(err),
        });
      }
    }

    return { findings };
  }

  /**
   * Normalize one finding into the handoff engine's signal shape. CVE text is
   * the exact title/body the old hard-coded dispatch built (Behavior preserved:
   * only the tier/rule table now decides whether it fires). A secret finding's
   * body is `toFindingLine` — NEVER the matched secret value.
   */
  private toSignal(f: SentinelFinding): HandoffSignal {
    if (f.kind === "cve") {
      return {
        from: "sentinel",
        kind: "cve",
        severity: SEVERITY_MAP[f.severity] ?? "low",
        projectId: f.projectId,
        title: `Sentinel: kritická zranitelnost ${f.package ?? f.repo}`,
        body: [
          f.summary ?? "Kritická CVE nalezena.",
          "",
          `Repo: ${f.repo}`,
          `Balíček: ${f.package ?? "?"} (${f.cveId ?? "CVE"})`,
          "",
          "Připrav opravu na vlastní větvi. Nepushuj ani nemerguj — brána je PR.",
        ].join("\n"),
        fingerprint: f.fingerprint,
      };
    }
    return {
      from: "sentinel",
      kind: "secret",
      projectId: f.projectId,
      title: `Sentinel: možný únik tajemství v ${f.projectName}`,
      body: toFindingLine(f),
      fingerprint: f.fingerprint,
    };
  }

  /** Read the latest security findings from the vault (for the briefing). */
  async readFindings(): Promise<string[]> {
    try {
      const note = await this.vault.note(NOTE_ID);
      return (note.body ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
        .map((l) => l.replace(/^- \[.\] /, "").trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private async scanDependabot(project: Project): Promise<SentinelFinding[]> {
    const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
    if (!link) return [];

    let res: Response;
    try {
      res = await this.fetchImpl(
        `${GITHUB_API}/repos/${link.repo}/dependabot/alerts?state=open&per_page=50`,
        {
          headers: { authorization: `Bearer ${link.token}`, accept: "application/vnd.github+json" },
        },
      );
    } catch (err) {
      this.log.debug("sentinel: dependabot fetch failed", {
        project: project.id,
        error: String(err),
      });
      return [];
    }
    if (!res.ok) {
      // 403 (Dependabot alerts disabled / no scope), 404 (no repo access), 429
      // (rate limited) — all fail-open. A scheduled scan never throws out of
      // the heartbeat the way an operator's interactive read is allowed to.
      this.log.debug("sentinel: dependabot alerts unavailable", {
        project: project.id,
        status: res.status,
      });
      return [];
    }
    const body = (await res.json().catch(() => null)) as unknown;
    const alerts = Array.isArray(body) ? (body as GitHubDependabotAlert[]) : [];

    const findings: SentinelFinding[] = [];
    for (const alert of alerts) {
      if (alert.number === undefined) continue;
      findings.push({
        kind: "cve",
        fingerprint: `dep-${link.repo}-${alert.number}`,
        projectId: project.id,
        projectName: project.name,
        repo: link.repo,
        severity: alert.security_advisory?.severity ?? "unknown",
        ...(alert.security_advisory?.cve_id ? { cveId: alert.security_advisory.cve_id } : {}),
        ...(alert.dependency?.package?.name ? { package: alert.dependency.package.name } : {}),
        ...(alert.security_advisory?.summary ? { summary: alert.security_advisory.summary } : {}),
        ...(alert.html_url ? { url: alert.html_url } : {}),
      });
    }
    return findings;
  }

  private async scanSecrets(project: Project): Promise<SentinelFinding[]> {
    const local = await this.projectLocal.resolve(project).catch(() => null);
    if (!local?.present || !local.resolvedPath) return [];
    const root = local.resolvedPath;

    const findings: SentinelFinding[] = [];
    let scanned = 0;
    const stack: string[] = [root];
    while (stack.length > 0 && scanned < MAX_FILES_SCANNED) {
      const dir = stack.pop();
      if (dir === undefined) break;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (scanned >= MAX_FILES_SCANNED) break;
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) stack.push(path.join(dir, entry.name));
          continue;
        }
        if (!entry.isFile()) continue;
        if (SKIP_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
        const full = path.join(dir, entry.name);
        const stat = await fs.stat(full).catch(() => null);
        if (!stat || stat.size > MAX_FILE_BYTES) continue;
        scanned += 1;
        const content = await fs.readFile(full, "utf8").catch(() => null);
        if (content === null) continue;
        const rel = path.relative(root, full);
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          for (const rule of SECRET_RULES) {
            if (!rule.pattern.test(line)) continue;
            findings.push({
              kind: "secret",
              fingerprint: `secret-${project.id}-${sha1(`${rel}:${i + 1}:${rule.name}`)}`,
              projectId: project.id,
              projectName: project.name,
              file: rel,
              line: i + 1,
              rule: rule.name,
            });
          }
        }
      }
    }
    return findings;
  }

  private async writeFindings(findings: SentinelFinding[], now: Date): Promise<void> {
    const date = now.toISOString().slice(0, 10);
    const lines = findings.map(toFindingLine);
    const body = [
      `*Updated: ${date}*`,
      "",
      "Open security findings (dependency CVEs + possible leaked secrets):",
      "",
      ...lines.map((l) => `- [ ] ${l}`),
      "",
      "_Approve a line to turn it into a fix task; critical CVEs already dispatch automatically._",
    ].join("\n");
    try {
      await this.vault.updateNote(NOTE_ID, { body });
    } catch {
      await this.vault.createNote({
        id: NOTE_ID,
        title: "Security Findings",
        tier: "memory",
        body,
      });
    }
  }
}
