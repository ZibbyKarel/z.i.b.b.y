import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { Command } from "@zibby/contracts";
import matter from "gray-matter";
import { CommandsStorageService } from "../commands/commands.storage.service";
import { writeFileAtomic } from "../shared/file-storage";

/** Name of the ZIBBY-owned commands plugin dir inside a run's sandbox. */
const PLUGIN_DIR_NAME = "zibby-commands";

/**
 * Materializes the enabled command catalog as a ZIBBY-owned Claude Code plugin in
 * the run's per-run sandbox, loaded via `--plugin-dir`. Runs spawn with
 * `--setting-sources ""`, under which the CLI no longer discovers
 * `<cwd>/.claude/commands`, so a plugin is the only way to deliver them. Plugin
 * commands are namespaced `/zibby:<id>`; the Skill tool still resolves a bare
 * `/<id>` to them. Nothing is written into a client worktree. The sandbox is
 * per-run, so files are simply overwritten. Best-effort and fail-open — a
 * materialization hiccup never blocks the run (it just lacks the commands).
 */
@Injectable()
export class CommandMaterializerService {
  constructor(@Inject(CommandsStorageService) private readonly commands: CommandsStorageService) {}

  /**
   * Write every enabled command into `<sandboxDir>/zibby-commands/commands/<id>.md`
   * plus the plugin manifest, and return the plugin dir. Returns `null` (writing
   * nothing) when there are no enabled commands or on any error.
   */
  async materialize(sandboxDir: string): Promise<string | null> {
    try {
      const commands = (await this.commands.list().catch((): Command[] => [])).filter(
        (command) => command.enabled,
      );
      if (commands.length === 0) return null;
      const pluginDir = path.join(sandboxDir, PLUGIN_DIR_NAME);
      const manifestDir = path.join(pluginDir, ".claude-plugin");
      const commandsDir = path.join(pluginDir, "commands");
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.mkdir(commandsDir, { recursive: true });
      await writeFileAtomic(
        path.join(manifestDir, "plugin.json"),
        JSON.stringify({
          name: "zibby",
          description: "ZIBBY custom commands materialized for this run",
        }),
      );
      for (const command of commands) {
        await writeFileAtomic(
          path.join(commandsDir, `${command.id}.md`),
          renderCommandFile(command),
        );
      }
      return pluginDir;
    } catch {
      // Fail-open: never let a materialization error block a run.
      return null;
    }
  }
}

/**
 * Render a command to its Claude Code command-file text: kebab-case frontmatter
 * (the keys Claude Code reads) plus the instructions body. The ZIBBY-internal
 * `enabled` flag is intentionally omitted from the materialized file.
 */
function renderCommandFile(command: Command): string {
  const data: Record<string, unknown> = {};
  if (command.description !== undefined) data.description = command.description;
  if (command["argument-hint"] !== undefined) data["argument-hint"] = command["argument-hint"];
  if (command["allowed-tools"] !== undefined) data["allowed-tools"] = command["allowed-tools"];
  if (command.model !== undefined) data.model = command.model;
  if (command["disable-model-invocation"] !== undefined) {
    data["disable-model-invocation"] = command["disable-model-invocation"];
  }
  return matter.stringify(`\n${command.instructions}\n`, data);
}
