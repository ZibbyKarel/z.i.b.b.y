import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { Command } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { CommandsStorageService } from "../commands/commands.storage.service"
import { CommandMaterializerService } from "./command-materializer.service"

const orchestrate: Command = {
  id: "orchestrate",
  description: "Run chains",
  "argument-hint": "[task]",
  enabled: true,
  instructions: "Orchestrate: $ARGUMENTS",
}
const disabled: Command = { id: "off", enabled: false, instructions: "noop" }

function makeMaterializer(commands: Command[]): CommandMaterializerService {
  const store = { list: async () => commands } as unknown as CommandsStorageService
  return new CommandMaterializerService(store)
}

describe("CommandMaterializerService", () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "materialize-test-"))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("writes enabled commands into <dir>/.claude/commands and skips disabled ones", async () => {
    await makeMaterializer([orchestrate, disabled]).materialize(dir)
    const file = path.join(dir, ".claude", "commands", "orchestrate.md")
    const raw = await fs.readFile(file, "utf8")
    // Claude Code frontmatter keys present; the ZIBBY-internal `enabled` is omitted.
    expect(raw).toContain("description: Run chains")
    expect(raw).toContain("argument-hint")
    expect(raw).not.toContain("enabled")
    expect(raw).toContain("Orchestrate: $ARGUMENTS")
    // The disabled command is not materialized.
    await expect(fs.access(path.join(dir, ".claude", "commands", "off.md"))).rejects.toThrow()
  })

  it("does not overwrite a pre-existing command file (project/user command wins)", async () => {
    const commandsDir = path.join(dir, ".claude", "commands")
    await fs.mkdir(commandsDir, { recursive: true })
    await fs.writeFile(path.join(commandsDir, "orchestrate.md"), "PROJECT VERSION", "utf8")
    await makeMaterializer([orchestrate]).materialize(dir)
    expect(await fs.readFile(path.join(commandsDir, "orchestrate.md"), "utf8")).toBe("PROJECT VERSION")
  })

  it("no-ops when there are no enabled commands", async () => {
    await makeMaterializer([disabled]).materialize(dir)
    await expect(fs.access(path.join(dir, ".claude"))).rejects.toThrow()
  })

  it("adds .claude/commands/ to the git exclude so it can't be committed", async () => {
    execFileSync("git", ["init", "-q"], { cwd: dir })
    await makeMaterializer([orchestrate]).materialize(dir)
    const exclude = await fs.readFile(path.join(dir, ".git", "info", "exclude"), "utf8")
    expect(exclude).toContain(".claude/commands/")
    // git sees nothing to commit under .claude (the materialized file is excluded).
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: dir }).toString()
    expect(status).not.toContain(".claude")
  })
})
