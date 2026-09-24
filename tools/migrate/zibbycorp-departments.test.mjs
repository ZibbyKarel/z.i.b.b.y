import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateContent, migratePath, runMigration } from "./zibbycorp-departments.mjs";

let dir;

function write(rel, content) {
  const full = join(dir, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function read(rel) {
  return readFileSync(join(dir, rel), "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zc-departments-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("migrateContent / migratePath (unit)", () => {
  it("rewrites agent frontmatter ownerSubsystem to a short department id, body untouched", () => {
    const src = [
      "---",
      "name: foo",
      "ownerSubsystem: forge",
      "---",
      "",
      "Forge stays put in the body.",
    ].join("\n");
    const out = migrateContent(src, "agents/foo.md");
    expect(out).toContain("department: dev");
    expect(out).not.toContain("ownerSubsystem");
    // Body text is untouched per PART-0 — "Forge" in prose is not a frontmatter field.
    expect(out).toContain("Forge stays put in the body.");
  });

  it("fully migrates a run artifact under agents/runs or pipelines/runs (not frontmatter-only)", () => {
    // The frontmatter-only carve-out is for the agent/pipeline DEFINITION
    // files directly under agents/ and pipelines/ — not their runs/**
    // execution artifacts (reports, logs, prompts), which have no such
    // frontmatter and must get the same full pipeline as any other data file.
    const src = "Audit of the subsystem-federation arc: every subsystem node is accessible.";
    const out = migrateContent(src, "pipelines/runs/code-audit_1/02_quality/quality.md");
    expect(out).toBe(
      "Audit of the department-federation arc: every department node is accessible.",
    );
  });

  it("rewrites pipeline frontmatter ownerSubsystem", () => {
    const src = ["---", "name: CI Triage", "ownerSubsystem: puls", "complexity: light", "---"].join(
      "\n",
    );
    const out = migrateContent(src, "pipelines/ci-triage.pipeline.md");
    expect(out).toContain("department: ops");
  });

  it("rewrites {kind:subsystem} targets and from/id fields in gate-like JSON", () => {
    const src = JSON.stringify({ kind: "subsystem", id: "sentinel" });
    const out = migrateContent(src, "gate-rules.json");
    expect(JSON.parse(out)).toEqual({ kind: "department", id: "sec" });
  });

  it("rewrites handoff rule from/to fields", () => {
    const src = JSON.stringify([
      {
        id: "sentinel-cve-critical",
        from: "sentinel",
        signalKind: "cve",
        to: { kind: "subsystem", id: "forge" },
        tier: 2,
      },
    ]);
    const out = migrateContent(src, "handoff/rules.json");
    const parsed = JSON.parse(out);
    expect(parsed[0].from).toBe("sec");
    expect(parsed[0].to).toEqual({ kind: "department", id: "dev" });
    expect(parsed[0].id).toBe("security-cve-critical");
  });

  it("rewrites activity jsonl lines", () => {
    const line1 = JSON.stringify({
      kind: "handoff",
      from: "maestro",
      to: { kind: "subsystem", id: "forge" },
    });
    const line2 = JSON.stringify({ kind: "note", text: "nothing subsystem-related here" });
    const src = `${line1}\n${line2}\n`;
    const out = migrateContent(src, "activity/2026-07-01.jsonl");
    const lines = out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0].from).toBe("rel");
    expect(lines[0].to).toEqual({ kind: "department", id: "dev" });
    expect(lines[1].text).toContain("department-related");
  });

  it("maps ledger as a subsystem id in id-context fields, but leaves generic ledger words alone", () => {
    const src = JSON.stringify({
      ownerSubsystem: "ledger",
      from: "ledger",
      to: { kind: "subsystem", id: "ledger" },
      note: "see budget-ledger and reply-ledger for the real numbers",
    });
    const out = migrateContent(src, "handoff/rules.json");
    const parsed = JSON.parse(out);
    // The ownerSubsystem -> department key rename is the shared map's job; this
    // pass only fixes the VALUE, so by the time both passes have run the field
    // reads as `department: "fin"`.
    expect(parsed.department).toBe("fin");
    expect(parsed.from).toBe("fin");
    expect(parsed.to).toEqual({ kind: "department", id: "fin" });
    expect(parsed.note).toBe("see budget-ledger and reply-ledger for the real numbers");
  });

  it("does not touch ledger as a bare YAML value outside a department-id key", () => {
    const src = ["---", "title: ledger", "---", "prose mentioning ledger in passing"].join("\n");
    const out = migrateContent(src, "vault/knowledge/some-note.md");
    // "title" is not an id-context key, so the bare scalar is left alone.
    expect(out).toContain("title: ledger");
  });

  it("renames a vault MOC file's frontmatter, title, and rewrites its wikilink elsewhere", () => {
    const moc = [
      "---",
      'title: "Loom — polička"',
      "subsystem: loom",
      "type: fact",
      "tags: [subsystem, loom, moc]",
      "---",
      "",
      "Loom owns proactive code quality, filing findings as proposals to Forge.",
    ].join("\n");
    const mocOut = migrateContent(moc, "vault/knowledge/subsystem-loom-moc.md");
    expect(mocOut).toContain('title: "QA & Architecture — polička"');
    expect(mocOut).toContain("department: qa");
    expect(mocOut).toContain("QA & Architecture owns proactive code quality");
    expect(mocOut).toContain("proposals to Development."); // cross-reference to the Forge/dev MOC

    const other = "See [[subsystem-loom-moc]] and [[subsystem-forge-moc#Poznatky]] for detail.";
    const otherOut = migrateContent(other, "vault/knowledge/zibby-index.md");
    expect(otherOut).toBe(
      "See [[department-qa-moc]] and [[department-dev-moc#Poznatky]] for detail.",
    );

    expect(migratePath("vault/knowledge/subsystem-loom-moc.md")).toBe(
      "vault/knowledge/department-qa-moc.md",
    );
  });

  it("renames the ledger MOC file and its wikilink using the short id", () => {
    expect(migratePath("vault/knowledge/subsystem-ledger-moc.md")).toBe(
      "vault/knowledge/department-fin-moc.md",
    );
    const wikilink = "[[subsystem-ledger-moc]]";
    expect(migrateContent(wikilink, "vault/knowledge/x.md")).toBe("[[department-fin-moc]]");
  });

  it("renames automation ids that use the function word, in filename and content", () => {
    expect(migratePath("automations/sentinel-scan.json")).toBe("automations/security-scan.json");
    const src = JSON.stringify({ id: "sentinel-scan", target: { type: "sentinel-scan" } });
    const out = migrateContent(src, "automations/sentinel-scan.json");
    expect(JSON.parse(out)).toEqual({ id: "security-scan", target: { type: "security-scan" } });
  });

  it("moves herald/ and maestro/ to comms/ and release/", () => {
    expect(migratePath("herald/ledger/reply_1.json")).toBe("comms/ledger/reply_1.json");
    expect(migratePath("maestro/merge-watch/x.json")).toBe("release/merge-watch/x.json");
  });
});

describe("runMigration (integration, temp dirs)", () => {
  it("dry-run writes nothing to disk", () => {
    write("agents/foo.md", ["---", "ownerSubsystem: forge", "---"].join("\n"));
    const before = read("agents/foo.md");
    runMigration({ dataDir: dir, apply: false });
    expect(read("agents/foo.md")).toBe(before);
    expect(existsSync(join(dir, "agents", "foo.md"))).toBe(true);
    // no backup, no new files anywhere
    const top = readdirSync(dir);
    expect(top.some((n) => n.startsWith("_backup-"))).toBe(false);
  });

  it("--apply backs the whole tree up first, then writes", () => {
    write("agents/foo.md", ["---", "ownerSubsystem: forge", "---"].join("\n"));
    const result = runMigration({ dataDir: dir, apply: true });
    expect(result.backupDir).toBeTruthy();
    expect(existsSync(result.backupDir)).toBe(true);
    expect(read(`${result.backupDir.slice(dir.length + 1)}/agents/foo.md`)).toContain(
      "ownerSubsystem: forge",
    );
    expect(read("agents/foo.md")).toContain("department: dev");
  });

  it("is idempotent: a second --apply run reports zero changes", () => {
    write("agents/foo.md", ["---", "ownerSubsystem: loom", "---"].join("\n"));
    write(
      "vault/knowledge/subsystem-forge-moc.md",
      [
        "---",
        'title: "Forge — polička"',
        "subsystem: forge",
        "---",
        "",
        "Forge owns delivery.",
      ].join("\n"),
    );
    write("vault/knowledge/idx.md", "[[subsystem-forge-moc]]");
    runMigration({ dataDir: dir, apply: true });
    const second = runMigration({ dataDir: dir, apply: true });
    expect(second.plans.filter((p) => p.pathChanged || p.contentChanged)).toHaveLength(0);
    expect(second.chains).toBeNull();
  });

  it("purges chains/ into _purged/chains-<ISO>/", () => {
    write("chains/runs/leftover.json", "{}");
    const result = runMigration({ dataDir: dir, apply: true });
    expect(result.chains).toBeTruthy();
    expect(existsSync(join(dir, "chains"))).toBe(false);
    expect(existsSync(join(dir, result.chains.targetRel))).toBe(true);
    expect(existsSync(join(dir, result.chains.targetRel, "runs", "leftover.json"))).toBe(true);
  });

  it("writes a markdown report to --report", () => {
    write("agents/foo.md", ["---", "ownerSubsystem: forge", "---"].join("\n"));
    const reportPath = join(dir, "..", `report-${Date.now()}.md`);
    try {
      const result = runMigration({ dataDir: dir, apply: false, reportPath });
      expect(existsSync(reportPath)).toBe(true);
      expect(readFileSync(reportPath, "utf8")).toContain("agents/foo.md");
      expect(result.report).toContain("dry run");
    } finally {
      rmSync(reportPath, { force: true });
    }
  });

  it("aborts before writing anything when a move target conflicts", () => {
    // Two different sources that migratePath maps to the same target with
    // different content must abort the whole run, before any write happens.
    write(
      "vault/knowledge/subsystem-forge-moc.md",
      ["---", "subsystem: forge", "---", "A"].join("\n"),
    );
    // Pre-existing file already sitting at the computed target, with different content.
    write("vault/knowledge/department-dev-moc.md", "pre-existing, unrelated content");
    expect(() => runMigration({ dataDir: dir, apply: true })).toThrow(
      /merge conflict|already exists/,
    );
    // Nothing was written: no backup dir created.
    const top = readdirSync(dir);
    expect(top.some((n) => n.startsWith("_backup-"))).toBe(false);
  });

  it("merges cleanly when a move target already exists with identical content", () => {
    write(
      "vault/knowledge/subsystem-forge-moc.md",
      ["---", "subsystem: forge", "---", "A"].join("\n"),
    );
    const identical = migrateContent(
      ["---", "subsystem: forge", "---", "A"].join("\n"),
      "vault/knowledge/subsystem-forge-moc.md",
    );
    write("vault/knowledge/department-dev-moc.md", identical);
    expect(() => runMigration({ dataDir: dir, apply: true })).not.toThrow();
  });

  it("overwrites a read-only pipeline run artifact and restores its original mode", () => {
    // A handful of real pipeline stage outputs are chmod'd read-only after the
    // run finishes; the migration still has to edit their content in place.
    const rel = "pipelines/runs/code-audit_1/02_quality/quality.md";
    write(rel, "Audit of the subsystem-federation arc.");
    const full = join(dir, rel);
    chmodSync(full, 0o444);

    expect(() => runMigration({ dataDir: dir, apply: true })).not.toThrow();

    expect(read(rel)).toBe("Audit of the department-federation arc.");
    expect(statSync(full).mode & 0o777).toBe(0o444);
  });
});
