import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type Command,
  CommandSchema,
  type CreateCommandInput,
  type UpdateCommandInput,
} from "@zibby/contracts";
import { MarkdownEntityStore } from "../shared/file-storage";
import {
  CommandConflictError,
  CommandNotFoundError,
  CorruptCommandFileError,
  InvalidCommandIdError,
} from "./commands.errors";

/** DI token carrying the absolute path of the directory that holds command files. */
export const COMMANDS_DIR = "COMMANDS_DIR";

/**
 * File-backed persistence for commands: one Markdown command file per command,
 * named `<id>.md`, inside a configurable data directory — the same Claude Code
 * command format (kebab-case frontmatter + Markdown body) the runner materializes
 * into a run's `.claude/commands/`. Same shape and guarantees as
 * {@link SkillsStorageService}; there is intentionally no database.
 */
@Injectable()
export class CommandsStorageService extends MarkdownEntityStore<Command> {
  protected readonly fileExt = ".md";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(COMMANDS_DIR) dir: string) {
    super(dir);
  }

  async create(input: CreateCommandInput): Promise<Command> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) throw new CommandConflictError(input.id);
    const command = CommandSchema.parse({ ...input });
    await this.writeEntity(command);
    return command;
  }

  async update(id: string, patch: UpdateCommandInput): Promise<Command> {
    const existing = await this.get(id);
    const merged: Command = { ...existing, ...patch, id: existing.id };
    await this.writeEntity(merged);
    return merged;
  }

  protected idOf(command: Command): string {
    return command.id;
  }

  protected notFound(id: string): Error {
    return new CommandNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidCommandIdError(id);
  }

  protected corruptError(id: string): Error {
    return new CorruptCommandFileError(id);
  }

  protected compare(a: Command, b: Command): number {
    return a.id.localeCompare(b.id);
  }

  protected bodyOf(command: Command): string {
    return command.instructions;
  }

  protected fromFrontmatter(
    data: Record<string, unknown>,
    id: string,
    body: string,
  ): Command | null {
    const candidate: Record<string, unknown> = { id, instructions: body };
    if (typeof data.description === "string") candidate.description = data.description;
    if (typeof data["argument-hint"] === "string")
      candidate["argument-hint"] = data["argument-hint"];
    if (Array.isArray(data["allowed-tools"])) candidate["allowed-tools"] = data["allowed-tools"];
    if (typeof data.model === "string") candidate.model = data.model;
    if (typeof data["disable-model-invocation"] === "boolean") {
      candidate["disable-model-invocation"] = data["disable-model-invocation"];
    }
    if (typeof data.enabled === "boolean") candidate.enabled = data.enabled;

    const result = CommandSchema.safeParse(candidate);
    return result.success ? result.data : null;
  }

  protected toFrontmatter(command: Command): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (command.description !== undefined) data.description = command.description;
    if (command["argument-hint"] !== undefined) data["argument-hint"] = command["argument-hint"];
    if (command["allowed-tools"] !== undefined) data["allowed-tools"] = command["allowed-tools"];
    if (command.model !== undefined) data.model = command.model;
    if (command["disable-model-invocation"] !== undefined) {
      data["disable-model-invocation"] = command["disable-model-invocation"];
    }
    data.enabled = command.enabled;
    return data;
  }
}
