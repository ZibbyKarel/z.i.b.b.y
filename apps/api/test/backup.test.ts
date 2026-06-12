import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Exec-level verification of apps/api/scripts/backup.sh (Phase 8.3). Runs the real
 * script against a temp data root + backup dir and asserts the layout, idempotency,
 * and that credentials are excluded by default. Skipped on non-macOS/Linux where the
 * rsync flags may differ (the script targets the operator's macOS).
 */
const SCRIPT = path.resolve(__dirname, "../scripts/backup.sh")
const supported = process.platform === "darwin" || process.platform === "linux"

describe.skipIf(!supported)("backup.sh", () => {
  let root: string
  let dataDir: string
  let backupDir: string

  const run = (args: string[] = []) =>
    execFileSync("bash", [SCRIPT, ...args], {
      env: {
        ...process.env,
        ZIBBY_DATA_DIR: dataDir,
        ZIBBY_BACKUP_DIR: backupDir,
        BACKUP_DATE: "2026-06-12",
      },
      encoding: "utf8",
    })

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-backup-"))
    dataDir = path.join(root, "data")
    backupDir = path.join(root, "backups")
    // Seed a couple of runtime dirs + a secret + a config file.
    await fs.mkdir(path.join(dataDir, "projects"), { recursive: true })
    await fs.writeFile(path.join(dataDir, "projects", "_projects.json"), "[]")
    await fs.mkdir(path.join(dataDir, "activity"), { recursive: true })
    await fs.writeFile(path.join(dataDir, "activity", "2026-06-12.jsonl"), "{}\n")
    await fs.mkdir(path.join(dataDir, "credentials"), { recursive: true })
    await fs.writeFile(path.join(dataDir, "credentials", "slack.json"), '{"token":"secret"}')
    await fs.mkdir(path.join(dataDir, "vault"), { recursive: true })
    await fs.writeFile(path.join(dataDir, "vault", "note.md"), "# note\n")
    await fs.writeFile(path.join(dataDir, "budget.json"), "{}\n")
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const exists = async (p: string) => fs.access(p).then(() => true).catch(() => false)

  it("creates the day-of-week layout with the runtime dirs + config", async () => {
    run()
    const day = new Date().getDay() === 0 ? "7" : String(new Date().getDay())
    const dest = path.join(backupDir, day)
    expect(await exists(path.join(dest, "projects", "_projects.json"))).toBe(true)
    expect(await exists(path.join(dest, "activity", "2026-06-12.jsonl"))).toBe(true)
    expect(await exists(path.join(dest, "budget.json"))).toBe(true)
  })

  it("excludes credentials by default but includes them with the flag", async () => {
    run()
    const day = new Date().getDay() === 0 ? "7" : String(new Date().getDay())
    const dest = path.join(backupDir, day)
    expect(await exists(path.join(dest, "credentials"))).toBe(false)

    run(["--include-credentials"])
    expect(await exists(path.join(dest, "credentials", "slack.json"))).toBe(true)
  })

  it("is idempotent — running twice is safe and exits 0", () => {
    run()
    expect(() => run()).not.toThrow()
  })

  it("commits the vault to a local git repo (no remote)", async () => {
    run()
    expect(await exists(path.join(dataDir, "vault", ".git"))).toBe(true)
    const remotes = execFileSync("git", ["-C", path.join(dataDir, "vault"), "remote"], {
      encoding: "utf8",
    })
    expect(remotes.trim()).toBe("") // Law 3: no remote, nothing to push
  })
})
