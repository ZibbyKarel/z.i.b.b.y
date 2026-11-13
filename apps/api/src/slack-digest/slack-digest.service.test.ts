import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TodoStore } from "../todo/todo.store";
import type { MarketplacesService } from "../marketplaces/marketplaces.service";
import type { SkillsStorageService } from "../skills/skills.storage.service";
import { VaultService } from "../memory/vault.service";
import {
  SLACK_DIGEST_ALLOWED_TOOLS,
  SLACK_DIGEST_DENIED_TOOLS,
  SlackDigestService,
  overviewSentence,
  parseOwnTodos,
  pragueDate,
} from "./slack-digest.service";

const logger = {
  child: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
};

const digest = (overview: string) =>
  `# Slack 2026-11-12\n\n## Přehled\n${overview}\n\n## Rozhovory\n- Jana — deploy\n`;

class FakeSpawnService extends SlackDigestService {
  calls: string[][] = [];
  next: string | Error = "";
  protected override async spawn(args: string[]): Promise<string> {
    this.calls.push(args);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

describe("SlackDigestService", () => {
  let dir: string;
  let vault: VaultService;
  let svc: FakeSpawnService;
  let created: { text: string; sourceUrl?: string }[];
  let todoFail = false;
  const todos = {
    create: async (text: string, sourceUrl?: string) => {
      if (todoFail) throw new Error("list full");
      created.push({ text, ...(sourceUrl ? { sourceUrl } : {}) });
    },
  } as unknown as TodoStore;
  const skills = {
    get: async (id: string) => {
      if (id !== "slack-daily-digest") throw new Error("nf");
      return { id, instructions: "SKILL TEXT" };
    },
  } as unknown as SkillsStorageService;

  let marketSkill: string | null = null;
  const marketplaces = {
    skillInstructions: async () => marketSkill,
  } as unknown as MarketplacesService;

  beforeEach(async () => {
    marketSkill = null;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-digest-"));
    vault = new VaultService(dir);
    await vault.onModuleInit();
    created = [];
    todoFail = false;
    svc = new FakeSpawnService(logger as never, skills, vault, todos, marketplaces);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes the note and an index line, and spawns a contained read-only turn", async () => {
    svc.next = digest("Domluvili jsme deploy. Zbytek je klid.");
    expect(await svc.run("2026-11-12")).toBe("slack-digest:slack-2026-11-12");

    const note = await vault.note("slack-2026-11-12");
    expect(note.tier).toBe("knowledge");
    expect(note.title).toBe("Slack 2026-11-12");
    expect(note.tags).toEqual(["slack"]);
    expect(note.body).toContain("## Rozhovory");
    const index = await vault.note("slack-index");
    expect(index.body).toContain("- [[slack-2026-11-12]] — Domluvili jsme deploy.");

    const args = svc.calls[0] ?? [];
    expect(args[0]).toBe("-p");
    expect(args[1]).toContain("SKILL TEXT");
    expect(args[1]).toContain("2026-11-12");
    const at = (flag: string) => args[args.indexOf(flag) + 1] ?? "";
    expect(at("--setting-sources")).toBe("user");
    expect(at("--permission-mode")).toBe("dontAsk");
    expect(at("--model")).toBe("sonnet");
    const allowed = at("--allowedTools").split(",");
    expect(allowed).toEqual(SLACK_DIGEST_ALLOWED_TOOLS);
    expect(allowed.some((t) => /send|draft|schedule|create|update|add_reaction/.test(t))).toBe(
      false,
    );
    expect(allowed.every((t) => t.startsWith("mcp__claude_ai_Slack__slack_"))).toBe(true);
    const denied = at("--disallowedTools").split(",");
    for (const t of ["Bash", "Write", "Edit", "WebFetch", "WebSearch", "Agent", "Task"]) {
      expect(denied).toContain(t);
    }
    expect(denied).toContain("mcp__claude_ai_Slack__slack_send_message");
    expect(denied).toContain("mcp__claude_ai_Slack__slack_send_message_draft");
    expect(SLACK_DIGEST_DENIED_TOOLS.filter((t) => allowed.includes(t))).toEqual([]);
  });

  it("NO_ACTIVITY writes nothing", async () => {
    svc.next = "  NO_ACTIVITY\n";
    expect(await svc.run("2026-11-12")).toBe("slack-digest:empty");
    await expect(vault.note("slack-2026-11-12")).rejects.toThrow();
    await expect(vault.note("slack-index")).rejects.toThrow();
  });

  it.each([
    ["spawn failure", new Error("claude exited 1")],
    ["empty output", ""],
    ["garbage", "Sure! Here is your digest"],
  ])("%s writes nothing", async (_n, next) => {
    svc.next = next;
    expect(await svc.run("2026-11-12")).toBe("slack-digest:error");
    await expect(vault.note("slack-2026-11-12")).rejects.toThrow();
    await expect(vault.note("slack-index")).rejects.toThrow();
  });

  it("prefers the marketplace skill over a same-id own skill", async () => {
    marketSkill = "MARKET SKILL";
    svc.next = "NO_ACTIVITY";
    await svc.run("2026-11-12");
    expect(svc.calls[0]?.[1]).toBe("MARKET SKILL\n\nDate: 2026-11-12");
  });

  it("a missing skill returns an error ref without spawning", async () => {
    const noSkill = new FakeSpawnService(
      logger as never,
      { get: async () => Promise.reject(new Error("nf")) } as unknown as SkillsStorageService,
      vault,
      todos,
      marketplaces,
    );
    expect(await noSkill.run("2026-11-12")).toBe("slack-digest:error");
    expect(noSkill.calls).toEqual([]);
  });

  it("re-running a date updates the note and replaces its index line; newest first", async () => {
    svc.next = digest("Starý přehled.");
    await svc.run("2026-11-12");
    svc.next = digest("Dnes bylo klidno.");
    await svc.run("2026-11-13");
    svc.next = digest("Nový přehled.");
    await svc.run("2026-11-12");

    expect((await vault.note("slack-2026-11-12")).body).toContain("Nový přehled.");
    const lines = ((await vault.note("slack-index")).body ?? "")
      .split("\n")
      .filter((l) => l.startsWith("- [["));
    expect(lines).toEqual([
      "- [[slack-2026-11-13]] — Dnes bylo klidno.",
      "- [[slack-2026-11-12]] — Nový přehled.",
    ]);
  });

  const withTasks = `${digest("Přehled.")}
## Úkoly a termíny

- [ ] já — poslat Janě podklady — 2026-11-20 · [odkaz](https://t.slack.com/archives/C1/p1)
- [ ] Jana — cizí úkol — 2026-11-21 · [odkaz](https://t.slack.com/archives/C1/p2)
`;

  it("adds todos only when the note is first created, not on a re-run", async () => {
    svc.next = withTasks;
    await svc.run("2026-11-12");
    expect(created).toEqual([
      {
        text: "poslat Janě podklady (do 2026-11-20)",
        sourceUrl: "https://t.slack.com/archives/C1/p1",
      },
    ]);
    await svc.run("2026-11-12");
    expect(created).toHaveLength(1);
  });

  it("a todo store failure does not fail the digest", async () => {
    todoFail = true;
    svc.next = withTasks;
    expect(await svc.run("2026-11-12")).toBe("slack-digest:slack-2026-11-12");
    expect((await vault.note("slack-2026-11-12")).body).toContain("## Úkoly");
  });

  it("parseOwnTodos keeps only `já`, handles dates and drops non-slack urls", () => {
    const d = [
      "# Slack x",
      "## Úkoly a termíny",
      "- [ ] já — ověřit DNS — bez termínu · [odkaz](https://evil.com/x)",
      "- [ ] já — a — b — c — 2026-11-20 · [odkaz](https://slack.com/x)",
      "- [ ] já — fake host — bez termínu · [odkaz](https://notslack.com/x)",
      "- [ ] já — http — bez termínu · [odkaz](http://t.slack.com/x)",
      "- [ ] já — bez odkazu — bez termínu",
      "- [ ] Jana Nováková — cizí — bez termínu",
      "- [ ] jáchym — cizí — bez termínu",
      "",
      "## Další",
      "- [ ] já — mimo sekci — bez termínu",
    ].join("\n");
    expect(parseOwnTodos(d)).toEqual([
      { text: "ověřit DNS" },
      { text: "a — b — c (do 2026-11-20)", sourceUrl: "https://slack.com/x" },
      { text: "fake host" },
      { text: "http" },
      { text: "bez odkazu" },
    ]);
    expect(parseOwnTodos("# Slack x\n\n## Přehled\nOk.")).toEqual([]);
  });

  it("overviewSentence takes the first sentence of ## Přehled; pragueDate is YYYY-MM-DD", () => {
    expect(overviewSentence(digest("Jedna věta. Druhá věta."))).toBe("Jedna věta.");
    expect(overviewSentence("# Slack\n\nno overview")).toBe("");
    expect(pragueDate(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
  });
});
