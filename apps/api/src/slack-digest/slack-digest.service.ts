import { Injectable } from "@nestjs/common";
import { TODO_TEXT_MAX } from "@zibby/contracts";
import {
  CHAT_CLAUDE_ENV,
  CHAT_CLAUDE_SETTINGS,
  CHAT_HIDDEN_BUILTIN_TOOLS,
  CHAT_SLACK_TOOLS,
} from "../chat/chat-session.service";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { TodoStore } from "../todo/todo.store";
import { MarketplacesService } from "../marketplaces/marketplaces.service";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { spawnClaudeCli } from "../shared/spawn-claude-cli";

export const SLACK_DIGEST_SKILL_ID = "slack-daily-digest";
const INDEX_ID = "slack-index";
const TIMEOUT_MS = 10 * 60_000;
const DIGEST_LINE = /^- \[\[slack-(\d{4}-\d{2}-\d{2})\]\]/;

/** Read/search Slack tools only: the chat's list minus the draft (write) tool. */
export const SLACK_DIGEST_ALLOWED_TOOLS = CHAT_SLACK_TOOLS.filter(
  (t) => !t.endsWith("slack_send_message_draft"),
);
/**
 * Everything else is off. `--allowedTools` is only a permission list, so containment is
 * `dontAsk` (off-list tools are denied, never prompted/auto-approved) PLUS this explicit
 * deny list: the built-ins the chat hides, Bash, ToolSearch (tool discovery) and the
 * known Slack write tools. Any other connector/MCP tool is off-list, hence denied.
 */
export const SLACK_DIGEST_DENIED_TOOLS = [
  ...CHAT_HIDDEN_BUILTIN_TOOLS.split(","),
  "Bash",
  "ToolSearch",
  ...[
    "slack_send_message",
    "slack_send_message_draft",
    "slack_schedule_message",
    "slack_create_canvas",
    "slack_update_canvas",
    "slack_add_reaction",
    "slack_create_conversation",
    "slack_create_list",
    "slack_update_list",
    "slack_add_list_record",
    "slack_update_list_record",
    "slack_get_file_upload_url",
    "slack_complete_file_upload",
  ].map((n) => `mcp__claude_ai_Slack__${n}`),
];

/** Today's `YYYY-MM-DD` in Europe/Prague (the cron's timezone). */
export function pragueDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
}

/** First sentence of the digest's `## Přehled` section, for the index line. */
export function overviewSentence(digest: string): string {
  const section = /^##\s+Přehled[^\n]*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/m.exec(digest)?.[1] ?? "";
  const text = section.replace(/\s+/g, " ").trim();
  return (/^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text).slice(0, 240);
}

export interface DigestTodo {
  text: string;
  sourceUrl?: string;
}

/** `https://*.slack.com/...` only; anything else is dropped. */
function slackUrl(raw: string | undefined): string | undefined {
  try {
    const u = new URL(raw ?? "");
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && (host === "slack.com" || host.endsWith(".slack.com"))
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The operator's own (`já`) items from the digest's `## Úkoly a termíny` section:
 * `- [ ] já — <co> — <YYYY-MM-DD | bez termínu> · [odkaz](<url>)`. Pure; Slack-derived text
 * is returned as plain strings and never interpreted.
 */
export function parseOwnTodos(digest: string): DigestTodo[] {
  const section =
    /^##\s+Úkoly a termíny[^\n]*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/m.exec(digest)?.[1] ?? "";
  const todos: DigestTodo[] = [];
  for (const line of section.split("\n")) {
    const m = /^- \[ \] (.+?) — (.+) — ([^—]+?)(?: · \[[^\]]*\]\(([^)\s]*)\))?\s*$/.exec(
      line.trim(),
    );
    if (!m || m[1]?.trim() !== "já") continue;
    const what = (m[2] ?? "").trim();
    if (!what) continue;
    const due = (m[3] ?? "").trim();
    const text = (/^\d{4}-\d{2}-\d{2}$/.test(due) ? `${what} (do ${due})` : what).slice(
      0,
      TODO_TEXT_MAX,
    );
    const sourceUrl = slackUrl(m[4]);
    todos.push({ text, ...(sourceUrl ? { sourceUrl } : {}) });
  }
  return todos;
}

/** Evening Slack digest: one read-only claude turn → vault note `slack-<date>` + index line. */
@Injectable()
export class SlackDigestService {
  private readonly log: ScopedLogger;

  constructor(
    logger: LoggerService,
    private readonly skills: SkillsStorageService,
    private readonly vault: VaultService,
    private readonly todos: TodoStore,
    private readonly marketplaces: MarketplacesService,
  ) {
    this.log = logger.child(SlackDigestService.name);
  }

  /** Never throws; returns the scheduler ref. */
  async run(date: string = pragueDate()): Promise<string> {
    try {
      // The skill ships in the operator's marketplace plugin (`zibby:slack-daily-digest`);
      // a same-id own/external skill is the fallback.
      const instructions =
        (await this.marketplaces.skillInstructions(SLACK_DIGEST_SKILL_ID).catch(() => null)) ??
        (await this.skills.get(SLACK_DIGEST_SKILL_ID).catch(() => null))?.instructions;
      if (!instructions) {
        this.log.warn("slack digest skill missing", { skill: SLACK_DIGEST_SKILL_ID });
        return "slack-digest:error";
      }
      let out: string;
      try {
        out = (await this.spawn(buildArgs(`${instructions}\n\nDate: ${date}`))).trim();
      } catch (error) {
        this.log.warn("slack digest turn failed", { error: String(error) });
        return "slack-digest:error";
      }
      if (out === "NO_ACTIVITY") return "slack-digest:empty";
      if (!out.startsWith("# Slack")) {
        this.log.warn("slack digest output rejected", { head: out.slice(0, 80) });
        return "slack-digest:error";
      }
      const id = `slack-${date}`;
      const body = `${out}\n`;
      let created = true;
      await this.vault
        .createNote({ id, tier: "knowledge", title: `Slack ${date}`, tags: ["slack"], body })
        .catch(async (error) => {
          if (!(error instanceof DuplicateNoteError)) throw error;
          created = false;
          await this.vault.updateNote(id, { title: `Slack ${date}`, body });
        });
      await this.indexDay(date, overviewSentence(out));
      // Only on first creation: a re-run must not re-add todos the operator already ticked off.
      const added = created ? await this.addTodos(out) : 0;
      this.log.info("slack digest stored", { id, created, todosAdded: added });
      return `slack-digest:${id}`;
    } catch (error) {
      this.log.warn("slack digest failed", { error: String(error) });
      return "slack-digest:error";
    }
  }

  /** Fail-open per item (list full / store error never fails the digest). */
  private async addTodos(digest: string): Promise<number> {
    let added = 0;
    for (const t of parseOwnTodos(digest)) {
      try {
        await this.todos.create(t.text, t.sourceUrl);
        added++;
      } catch (error) {
        this.log.warn("slack digest todo not added", { error: String(error) });
      }
    }
    return added;
  }

  /** Seam for tests: the real one spawns a headless claude. */
  protected spawn(args: string[]): Promise<string> {
    return spawnClaudeCli({
      args,
      timeoutMs: TIMEOUT_MS,
      label: "slack-digest",
      extraEnv: CHAT_CLAUDE_ENV,
    });
  }

  /** One line per day, newest first; the same day replaces its line. */
  private async indexDay(date: string, label: string): Promise<void> {
    const line = `- [[slack-${date}]] — ${label || "digest"}`;
    const existing = await this.vault.note(INDEX_ID).catch(() => null);
    const lines = (existing?.body ?? "").split("\n");
    const head = lines.filter((l) => l.trim() && !DIGEST_LINE.test(l));
    const days = new Map(
      lines.flatMap((l) => {
        const d = DIGEST_LINE.exec(l)?.[1];
        return d ? [[d, l] as const] : [];
      }),
    );
    days.set(date, line);
    const sorted = [...days].sort(([a], [b]) => b.localeCompare(a)).map(([, l]) => l);
    const body = `${[...(head.length ? head : ["Daily Slack digests, newest first."]), "", ...sorted].join("\n")}\n`;
    if (existing) await this.vault.updateNote(INDEX_ID, { body });
    else
      await this.vault.createNote({
        id: INDEX_ID,
        tier: "knowledge",
        title: "Slack index",
        tags: ["slack"],
        body,
      });
  }
}

function buildArgs(prompt: string): string[] {
  return [
    "-p",
    prompt,
    // Operator's user setup (claude.ai connectors) minus hooks; CLAUDE.md + auto-memory off via env.
    "--setting-sources",
    "user",
    "--settings",
    CHAT_CLAUDE_SETTINGS,
    "--model",
    "sonnet",
    "--no-session-persistence",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    SLACK_DIGEST_ALLOWED_TOOLS.join(","),
    "--disallowedTools",
    SLACK_DIGEST_DENIED_TOOLS.join(","),
  ];
}
