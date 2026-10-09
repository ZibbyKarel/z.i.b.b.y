import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VaultLintService } from "./vault-lint.service";
import { VaultService, localDate } from "./vault.service";

describe("vault change log + updated stamp + lint", () => {
  let dir: string;
  let vault: VaultService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-lint-"));
    vault = new VaultService(dir);
    await vault.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const writeRaw = (rel: string, content: string) =>
    fs
      .mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
      .then(() => fs.writeFile(path.join(dir, rel), content, "utf8"));

  it("stamps updated and logs create/update/append/index, never daily or itself", async () => {
    await vault.createNote({ id: "a", tier: "knowledge", body: "x", frontmatter: { keep: 1 } });
    await vault.updateNote("a", { body: "y" });
    await vault.appendToNote("a", "more");
    await vault.updateIndex("proj-index", "a");
    await vault.appendDaily("hello");
    const a = await vault.note("a");
    expect(a.frontmatter.keep).toBe(1);
    expect(String(a.frontmatter.updated).slice(0, 10)).toBe(localDate());
    const log = await fs.readFile(path.join(dir, "knowledge", "vault-log.md"), "utf8");
    const lines = log.split("\n").filter((l) => l.startsWith("- "));
    const ops = lines.map((l) => l.split(" | ").slice(1).join("|"));
    expect(ops).toEqual([
      "create|[[a]]",
      "update|[[a]]",
      "append|[[a]]",
      "create|[[proj-index]]",
      "index|[[proj-index]]",
    ]);
    expect(lines[0]).toMatch(/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} \| create \| \[\[a\]\]$/);
    expect(log).toContain("Vault change log");
  });

  it("serializes concurrent writes into the log", async () => {
    await Promise.all(
      ["n1", "n2", "n3", "n4"].map((id) => vault.createNote({ id, tier: "knowledge", body: "x" })),
    );
    const log = await fs.readFile(path.join(dir, "knowledge", "vault-log.md"), "utf8");
    expect(log.split("\n").filter((l) => l.includes("| create |"))).toHaveLength(4);
  });

  it("reports broken links, orphans, stale, missing and tag bloat without touching notes", async () => {
    const tags = Array.from({ length: 16 }, (_, i) => `- t${i}`).join("\n");
    await writeRaw(
      "knowledge/hub-index.md",
      "---\nupdated: 2026-10-01\n---\n[[linked]] [[ghost]]\n",
    );
    await writeRaw("knowledge/linked.md", "---\nupdated: 2026-10-01\n---\nok\n");
    await writeRaw("knowledge/lonely.md", "---\nupdated: 2026-10-01\n---\nnobody links here\n");
    await writeRaw("knowledge/old.md", "---\nupdated: 2020-01-01\n---\n[[lonely]]\n");
    await writeRaw("knowledge/nostamp.md", "---\ntitle: x\n---\n[[lonely]]\n");
    await writeRaw(
      `knowledge/tagged.md`,
      `---\nupdated: 2026-10-01\ntags:\n${tags}\n---\n[[lonely]]\n`,
    );
    await writeRaw("daily/2020-01-01.md", "- old entry [[nowhere]]\n");
    await writeRaw("north-star.md", "---\nupdated: 2026-10-01\n---\ngoals\n");
    const before = await fs.readFile(path.join(dir, "knowledge", "old.md"), "utf8");

    const res = await new VaultLintService(vault).run(new Date(2026, 9, 9));
    expect(res).toMatchObject({ brokenLinks: 2, stale: 1, missingUpdated: 1, tagBloat: 1 });

    const report = await fs.readFile(path.join(dir, "knowledge", "vault-lint.md"), "utf8");
    expect(report).toContain("title: Vault lint");
    expect(report).toContain("- [[hub-index]] → `ghost`");
    expect(report).toContain("- [[old]] (2020-01-01)");
    expect(report).toContain("- [[tagged]] (16 tags)");
    const orphanSection = report.split("## Orphans")[1]?.split("##")[0] ?? "";
    expect(orphanSection).toContain("[[old]]");
    expect(orphanSection).toContain("[[nostamp]]");
    expect(orphanSection).not.toContain("[[linked]]");
    expect(orphanSection).not.toContain("[[lonely]]");
    expect(orphanSection).not.toContain("north-star");
    expect(orphanSection).not.toContain("hub-index");
    expect(await fs.readFile(path.join(dir, "knowledge", "old.md"), "utf8")).toBe(before);

    // second run overwrites, and the lint/log notes never log themselves or become orphans
    await new VaultLintService(vault).run(new Date(2026, 9, 9));
    const log = await fs
      .readFile(path.join(dir, "knowledge", "vault-log.md"), "utf8")
      .catch(() => "");
    expect(log).not.toContain("[[vault-lint]]");
  });
});
