import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Command } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandsStorageService } from "../commands/commands.storage.service";
import { CommandMaterializerService } from "./command-materializer.service";

const orchestrate: Command = {
  id: "orchestrate",
  description: "Run chains",
  "argument-hint": "[task]",
  enabled: true,
  instructions: "Orchestrate: $ARGUMENTS",
};
const disabled: Command = { id: "off", enabled: false, instructions: "noop" };

function makeMaterializer(commands: Command[]): CommandMaterializerService {
  const store = { list: async () => commands } as unknown as CommandsStorageService;
  return new CommandMaterializerService(store);
}

describe("CommandMaterializerService", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "materialize-test-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes enabled commands as a ZIBBY plugin under <dir>/zibby-commands and returns it", async () => {
    const pluginDir = await makeMaterializer([orchestrate, disabled]).materialize(dir);
    expect(pluginDir).toBe(path.join(dir, "zibby-commands"));
    const manifest = JSON.parse(
      await fs.readFile(path.join(dir, "zibby-commands", ".claude-plugin", "plugin.json"), "utf8"),
    ) as { name: string };
    expect(manifest.name).toBe("zibby");
    const text = await fs.readFile(
      path.join(dir, "zibby-commands", "commands", "orchestrate.md"),
      "utf8",
    );
    expect(text).toContain("Orchestrate: $ARGUMENTS");
    expect(text).toContain("argument-hint");
    await expect(
      fs.access(path.join(dir, "zibby-commands", "commands", "off.md")),
    ).rejects.toThrow();
  });

  it("returns null and writes nothing when there are no enabled commands", async () => {
    expect(await makeMaterializer([disabled]).materialize(dir)).toBeNull();
    await expect(fs.access(path.join(dir, "zibby-commands"))).rejects.toThrow();
  });

  it("never writes into <dir>/.claude/commands any more", async () => {
    await makeMaterializer([orchestrate]).materialize(dir);
    await expect(fs.access(path.join(dir, ".claude"))).rejects.toThrow();
  });
});
