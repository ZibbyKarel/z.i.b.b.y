import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable } from "@nestjs/common"
import type { Command } from "@zibby/contracts"
import matter from "gray-matter"
import { CommandsStorageService } from "../commands/commands.storage.service"
import { fileExists, writeFileAtomic } from "../shared/file-storage"

/**
 * Materializes the enabled command catalog into a run's working tree so the
 * `claude -p` session can discover them. Claude Code finds custom slash commands
 * ONLY on the filesystem — `.claude/commands/*.md` under the cwd — and there is no
 * `--commands` flag, so this filesystem write is the only mechanism. Each run gets
 * its OWN cwd (a fresh per-run sandbox, or a per-run git worktree), so the write is
 * naturally isolated; nothing is shared between concurrent runs.
 *
 * Pollution guard: a command file is written only when the target tree does NOT
 * already have one of that name (a project's / user's own command wins), and the
 * `.claude/commands/` path is added to the run's git exclude so an agent can't
 * accidentally commit ZIBBY's commands into the project's worktree. Everything is
 * best-effort and fail-open — a materialization hiccup never blocks the run (the
 * run simply lacks the custom commands, exactly as before this feature).
 */
@Injectable()
export class CommandMaterializerService {
  constructor(@Inject(CommandsStorageService) private readonly commands: CommandsStorageService) {}

  /**
   * Write every enabled command into `<targetDir>/.claude/commands/<id>.md`.
   * `targetDir` is the run's spawn cwd (the worktree for a project run, else the
   * sandbox). No-op when there are no enabled commands.
   */
  async materialize(targetDir: string): Promise<void> {
    try {
      const commands = (await this.commands.list().catch((): Command[] => [])).filter(
        (command) => command.enabled,
      )
      if (commands.length === 0) return
      const commandsDir = path.join(targetDir, ".claude", "commands")
      await fs.mkdir(commandsDir, { recursive: true })
      let wroteAny = false
      for (const command of commands) {
        const file = path.join(commandsDir, `${command.id}.md`)
        // A pre-existing project/user command of the same name wins — only fill gaps.
        if (await fileExists(file)) continue
        await writeFileAtomic(file, renderCommandFile(command))
        wroteAny = true
      }
      if (wroteAny) await excludeFromGit(targetDir)
    } catch {
      // Fail-open: never let a materialization error block a run.
    }
  }
}

/**
 * Render a command to its Claude Code command-file text: kebab-case frontmatter
 * (the keys Claude Code reads) plus the instructions body. The ZIBBY-internal
 * `enabled` flag is intentionally omitted from the materialized file.
 */
function renderCommandFile(command: Command): string {
  const data: Record<string, unknown> = {}
  if (command.description !== undefined) data.description = command.description
  if (command["argument-hint"] !== undefined) data["argument-hint"] = command["argument-hint"]
  if (command["allowed-tools"] !== undefined) data["allowed-tools"] = command["allowed-tools"]
  if (command.model !== undefined) data.model = command.model
  if (command["disable-model-invocation"] !== undefined) {
    data["disable-model-invocation"] = command["disable-model-invocation"]
  }
  return matter.stringify(`\n${command.instructions}\n`, data)
}

/**
 * Best-effort: add `.claude/commands/` to the run tree's git exclude so a
 * materialized command can't be committed. Handles both a normal repo (`.git` is a
 * directory) and a worktree (`.git` is a file pointing at the real gitdir). Silent
 * on any failure — the worktree is ephemeral and on a throwaway `zibby/*` branch
 * that never auto-merges, so an un-excluded file is harmless, just untidy.
 */
async function excludeFromGit(targetDir: string): Promise<void> {
  try {
    const dotGit = path.join(targetDir, ".git")
    const stat = await fs.stat(dotGit).catch(() => null)
    if (!stat) return
    let gitDir: string
    if (stat.isDirectory()) {
      gitDir = dotGit
    } else {
      // Worktree: `.git` is a file `gitdir: <absolute path>`.
      const content = await fs.readFile(dotGit, "utf8")
      const match = /^gitdir:\s*(.+)$/m.exec(content.trim())
      if (!match?.[1]) return
      gitDir = path.resolve(targetDir, match[1].trim())
    }
    const infoDir = path.join(gitDir, "info")
    await fs.mkdir(infoDir, { recursive: true })
    const excludeFile = path.join(infoDir, "exclude")
    const existing = await fs.readFile(excludeFile, "utf8").catch(() => "")
    if (existing.split("\n").some((line) => line.trim() === ".claude/commands/")) return
    const next = existing.endsWith("\n") || existing === "" ? existing : `${existing}\n`
    await fs.writeFile(excludeFile, `${next}.claude/commands/\n`)
  } catch {
    // Best-effort only.
  }
}
