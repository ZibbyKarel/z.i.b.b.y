import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CreateCommandInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CommandConflictError,
  CommandNotFoundError,
  InvalidCommandIdError,
} from "./commands.errors";
import { CommandsStorageService } from "./commands.storage.service";

const sample: CreateCommandInput = {
  id: "orchestrate",
  description: "Run a custom orchestration",
  "argument-hint": "[task]",
  "allowed-tools": ["Read", "Bash"],
  enabled: true,
  instructions: "Orchestrate: $ARGUMENTS",
};

describe("CommandsStorageService", () => {
  let dir: string;
  let service: CommandsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "commands-test-"));
    service = new CommandsStorageService(dir);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("round-trips a command through the Markdown file (frontmatter + body)", async () => {
    await service.create(sample);
    const got = await service.get("orchestrate");
    expect(got.description).toBe("Run a custom orchestration");
    expect(got["argument-hint"]).toBe("[task]");
    expect(got["allowed-tools"]).toEqual(["Read", "Bash"]);
    expect(got.instructions).toBe("Orchestrate: $ARGUMENTS");
    // The on-disk file carries the kebab-case Claude Code frontmatter keys.
    const raw = await fs.readFile(path.join(dir, "orchestrate.md"), "utf8");
    expect(raw).toContain("argument-hint");
    expect(raw).toContain("allowed-tools");
  });

  it("defaults enabled to true", async () => {
    await service.create({ id: "bare", instructions: "do it" } as CreateCommandInput);
    expect((await service.get("bare")).enabled).toBe(true);
  });

  it("rejects a duplicate id", async () => {
    await service.create(sample);
    await expect(service.create(sample)).rejects.toBeInstanceOf(CommandConflictError);
  });

  it("404s on a missing command", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(CommandNotFoundError);
  });

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(service.create({ ...sample, id })).rejects.toBeInstanceOf(InvalidCommandIdError);
    }
  });
});
