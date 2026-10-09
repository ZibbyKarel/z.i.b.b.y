import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KbReaderService } from "./kb-reader.service";

describe("KbReaderService", () => {
  let base: string;
  let root: string;
  let outsideFile: string;
  let source: KnowledgeBaseSource;
  const reader = new KbReaderService();

  beforeEach(async () => {
    // KB root lives one level below `base` so `../outside.md` is a real file
    // OUTSIDE the root but still inside a directory this test controls —
    // the escape target genuinely exists, so an escape test can't pass merely
    // because the target is missing.
    base = await fs.mkdtemp(path.join(os.tmpdir(), "kb-reader-test-"));
    root = path.join(base, "kb");
    outsideFile = path.join(base, "outside.md");

    await fs.mkdir(path.join(root, "wiki", "notes"), { recursive: true });
    await fs.mkdir(path.join(root, "meetings"), { recursive: true });

    await fs.writeFile(
      outsideFile,
      "---\ntitle: Outside Secret\n---\nThis must never be readable from inside the KB.\n",
      "utf8",
    );

    await fs.writeFile(
      path.join(root, "team-context.md"),
      "---\ntitle: Team Context\n---\nThis team ships the partner portal.\n",
      "utf8",
    );

    await fs.writeFile(
      path.join(root, "wiki", "INDEX.md"),
      "---\ntitle: Wiki Index\n---\nEntry point.\n\n- [[partner-portal]]\n",
      "utf8",
    );

    await fs.writeFile(
      path.join(root, "wiki", "notes", "partner-portal.md"),
      "---\ntitle: Partner Portal\naliases:\n  - partner portal\n---\nThe partner portal lets resellers self-serve.\n",
      "utf8",
    );

    await fs.writeFile(
      path.join(root, "wiki", "notes", "huge.md"),
      `---\ntitle: Huge\n---\n${"lorem ipsum dolor sit amet ".repeat(300)}`,
      "utf8",
    );

    await fs.writeFile(
      path.join(root, "meetings", "kickoff.vtt"),
      // "zorbatron9000" is a distinctive word that appears ONLY in this body —
      // if `.vtt` content were ever indexed, searching for it would wrongly
      // surface this transcript.
      "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello everyone, the codename is zorbatron9000.\n",
      "utf8",
    );

    source = { kind: "vault", path: root, readOnly: true };
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it("finds a note by title and returns a repo-relative path", async () => {
    const hits = await reader.search(source, "partner portal");
    expect(hits[0]?.path).toBe("wiki/notes/partner-portal.md");
    expect(path.isAbsolute(hits[0]?.path ?? "")).toBe(false);
  });

  it("builds a wiki-link graph of markdown notes only (no vtt, no outside files)", async () => {
    const g = await reader.graph(source);
    const ids = g.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([
      "team-context.md",
      "wiki/INDEX.md",
      "wiki/notes/huge.md",
      "wiki/notes/partner-portal.md",
    ]);
    expect(g.nodes.every((n) => n.tier === "knowledge")).toBe(true);
    expect(g.edges).toEqual([{ from: "wiki/INDEX.md", to: "wiki/notes/partner-portal.md" }]);
  });

  it("returns nothing for a query that matches nothing", async () => {
    expect(await reader.search(source, "zzzz-nothing")).toEqual([]);
  });

  it("refuses to escape the knowledge-base root", async () => {
    // Plain traversal — never resolves inside the walk-validated id space.
    expect(await reader.read(source, "../../../etc/passwd")).toBeNull();
    // The escape target genuinely exists (as `outside.md`, one level above the
    // KB root) so these assertions can't pass merely because nothing is there.
    expect(await fs.readFile(outsideFile, "utf8")).toContain("must never be readable");
    expect(await reader.read(source, "../outside")).toBeNull();
    // URL-encoded variant, pointed at the same real, existing target — a
    // decode-then-resolve regression would find `../outside.md` and actually
    // return it, so this discriminates instead of passing vacuously.
    expect(await reader.read(source, "..%2foutside")).toBeNull();
  });

  it("does not follow a symlink pointing outside the root", async () => {
    await fs.symlink(outsideFile, path.join(root, "wiki", "notes", "escape.md"));
    expect(await reader.read(source, "escape")).toBeNull();
  });

  it("ignores dot-directories", async () => {
    await fs.mkdir(path.join(root, ".git"), { recursive: true });
    await fs.writeFile(path.join(root, ".git", "secret.md"), "# secret\ntoken", "utf8");
    expect(await reader.search(source, "secret")).toEqual([]);
  });

  it("returns an empty result for a missing root instead of throwing", async () => {
    expect(
      await reader.search({ kind: "vault", path: "/nope/missing", readOnly: true }, "x"),
    ).toEqual([]);
  });

  it("caps a note body so one huge note cannot flood a prompt", async () => {
    const note = await reader.read(source, "huge");
    expect(note?.body.length).toBeLessThanOrEqual(4000);
  });

  it("never hands back a .vtt transcript body through read()", async () => {
    expect(await reader.read(source, "kickoff")).toBeNull();
  });

  it("lists markdown notes with their top folder, excluding .vtt and _templates/", async () => {
    await fs.mkdir(path.join(root, "_templates"), { recursive: true });
    await fs.writeFile(path.join(root, "_templates", "talk.md"), "tpl", "utf8");
    const list = await reader.notes(source);
    expect(list.map((n) => n.id).sort()).toEqual([
      "team-context.md",
      "wiki/INDEX.md",
      "wiki/notes/huge.md",
      "wiki/notes/partner-portal.md",
    ]);
    expect(list.find((n) => n.id === "team-context.md")).toEqual({
      id: "team-context.md",
      title: "Team Context",
      folder: "",
    });
    expect(list.find((n) => n.id === "wiki/notes/partner-portal.md")?.folder).toBe("wiki");
  });

  it("reads one note by repo-relative path (capped body, raw wikilinks)", async () => {
    const idx = await reader.readPath(source, "wiki/INDEX.md");
    expect(idx).toEqual({
      id: "wiki/INDEX.md",
      title: "Wiki Index",
      body: expect.stringContaining("Entry point."),
      links: ["partner-portal"],
    });
    expect((await reader.readPath(source, "wiki/notes/huge.md"))?.body.length).toBeLessThanOrEqual(
      4000,
    );
  });

  it("readPath refuses traversal, absolute paths, templates, vtt, symlinks and missing notes", async () => {
    await fs.mkdir(path.join(root, "_templates"), { recursive: true });
    await fs.writeFile(path.join(root, "_templates", "talk.md"), "tpl", "utf8");
    await fs.symlink(outsideFile, path.join(root, "wiki", "notes", "escape.md"));
    for (const bad of [
      "../outside.md",
      "wiki/../../outside.md",
      "wiki/../team-context.md",
      outsideFile,
      "/etc/passwd",
      "_templates/talk.md",
      "meetings/kickoff.vtt",
      "wiki/notes/escape.md",
      "wiki/notes/missing.md",
    ]) {
      expect(await reader.readPath(source, bad), bad).toBeNull();
    }
  });

  it("tails the last non-empty lines of a note, uncapped by the body budget, each line capped", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `entry ${i + 1} ${"x".repeat(400)}`);
    await fs.mkdir(path.join(root, "_meta"), { recursive: true });
    await fs.writeFile(path.join(root, "_meta", "log.md"), `# Log\n\n${lines.join("\n\n")}\n`);
    const tail = await reader.tailLines(source, "_meta/log.md", 20);
    expect(tail).toHaveLength(20);
    expect(tail[19]?.startsWith("entry 40 ")).toBe(true);
    expect(tail[0]?.startsWith("entry 21 ")).toBe(true);
    expect(tail.every((l) => l.length <= 300)).toBe(true);
    expect(await reader.tailLines(source, "_meta/nope.md", 20)).toEqual([]);
  });

  it("skips the log's heading and HTML-comment preamble", async () => {
    await fs.mkdir(path.join(root, "_meta"), { recursive: true });
    await fs.writeFile(
      path.join(root, "_meta", "log.md"),
      "# Activity Log\n<!-- format: ... -->\n2026-01-01 | a | init\n",
    );
    expect(await reader.tailLines(source, "_meta/log.md", 20)).toEqual(["2026-01-01 | a | init"]);
  });

  it("indexes a .vtt by filename only, never by its (verbatim transcript) content", async () => {
    const byFilename = await reader.search(source, "kickoff");
    expect(byFilename.some((h) => h.noteId === "kickoff")).toBe(true);

    // Distinctive text that exists ONLY inside the transcript body — if
    // `.vtt` content were ever parsed/indexed, this would wrongly find it.
    const byBody = await reader.search(source, "zorbatron9000");
    expect(byBody).toEqual([]);
  });
});

describe("KbReaderService source (structural)", () => {
  it("never calls a filesystem write primitive — read-only is structural, not incidental", async () => {
    const raw = await fs.readFile(path.join(__dirname, "kb-reader.service.ts"), "utf8");
    // Strip comments first — the class doc deliberately *names* these
    // primitives to say they're absent, which would otherwise self-trigger.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/fs\.(writeFile|mkdir|rename|unlink|appendFile|rm|rmdir|copyFile)\(/);
  });
});
