import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMPLOYEE_NAME_SEED,
  planEmployees,
  readDepartment,
  runMigration,
  stripDepartment,
} from "./zibbycorp-employees.mjs";

let dir;

function write(rel, content) {
  const full = join(dir, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function read(rel) {
  return readFileSync(join(dir, rel), "utf8");
}

function agentFixture({ name = "Coder", department = "dev" } = {}) {
  return [
    "---",
    `name: ${name}`,
    "description: does the thing",
    "glyph: bot",
    `department: ${department}`,
    "---",
    "",
    "Body text, untouched.",
    "",
  ].join("\n");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zc-employees-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readDepartment / stripDepartment (unit)", () => {
  it("reads the department id off frontmatter", () => {
    expect(readDepartment(agentFixture({ department: "dev" }))).toBe("dev");
  });

  it("returns null for an agent with no department frontmatter", () => {
    expect(readDepartment("---\nname: x\n---\n\nbody\n")).toBeNull();
  });

  it("returns null when there is no frontmatter fence at all", () => {
    expect(readDepartment("just a body, no frontmatter\n")).toBeNull();
  });

  it("strips only the department line, keeps every other key and the body verbatim", () => {
    const src = agentFixture({ name: "Coder", department: "dev" });
    const out = stripDepartment(src);
    expect(out).not.toContain("department:");
    expect(out).toContain("name: Coder");
    expect(out).toContain("Body text, untouched.");
  });
});

describe("planEmployees / runMigration", () => {
  it("hires one employee per departmented agent, in agent-id order, off the seed pool in order", () => {
    write("agents/zebra.md", agentFixture({ name: "Zebra", department: "dev" }));
    write("agents/apple.md", agentFixture({ name: "Apple", department: "dev" }));
    write("agents/no-department.md", "---\nname: Loner\n---\n\nno department here\n");

    const plans = planEmployees(dir);
    expect(plans.map((p) => p.agentId)).toEqual(["apple", "zebra"]);
    expect(plans.map((p) => p.name)).toEqual([EMPLOYEE_NAME_SEED[0], EMPLOYEE_NAME_SEED[1]]);
    expect(plans.every((p) => p.department === "dev")).toBe(true);
  });

  it("dry run (no --apply) writes nothing", () => {
    write("agents/apple.md", agentFixture({ name: "Apple", department: "dev" }));
    runMigration({ dataDir: dir, apply: false });
    expect(existsSync(join(dir, "employees"))).toBe(false);
    expect(read("agents/apple.md")).toContain("department: dev");
  });

  it("--apply hires, writes an employee file per hire, seeds the name manifest, and strips the frontmatter line", () => {
    write("agents/architekt.md", agentFixture({ name: "Architekt", department: "dev" }));
    write("agents/scribe.md", agentFixture({ name: "Scribe", department: "knw" }));

    const result = runMigration({ dataDir: dir, apply: true });
    expect(result.changedCount).toBe(2);

    const employeeFiles = readdirSync(join(dir, "employees")).sort();
    expect(employeeFiles).toEqual(["employee_architekt.json", "employee_scribe.json"]);

    const architektEmployee = JSON.parse(read("employees/employee_architekt.json"));
    expect(architektEmployee).toMatchObject({
      id: "employee_architekt",
      agentId: "architekt",
      department: "dev",
      status: "active",
      name: EMPLOYEE_NAME_SEED[0],
    });
    expect(architektEmployee.hiredAt).toBeTruthy();

    const scribeEmployee = JSON.parse(read("employees/employee_scribe.json"));
    expect(scribeEmployee).toMatchObject({
      agentId: "scribe",
      department: "knw",
      name: EMPLOYEE_NAME_SEED[1],
    });

    const manifest = JSON.parse(read("employee-names/employee-names.json"));
    expect(manifest).toHaveLength(EMPLOYEE_NAME_SEED.length);
    const claimed = manifest.filter((n) => n.employeeId);
    expect(claimed).toHaveLength(2);
    expect(claimed.map((n) => n.employeeId).sort()).toEqual([
      "employee_architekt",
      "employee_scribe",
    ]);

    expect(read("agents/architekt.md")).not.toContain("department:");
    expect(read("agents/scribe.md")).not.toContain("department:");
    // Every other frontmatter key + the body survive untouched.
    expect(read("agents/architekt.md")).toContain("name: Architekt");
    expect(read("agents/architekt.md")).toContain("Body text, untouched.");
  });

  it("backs up the tree before writing, under a timestamped _backup- dir", () => {
    write("agents/architekt.md", agentFixture({ department: "dev" }));
    runMigration({ dataDir: dir, apply: true });
    const backups = readdirSync(dir).filter((n) => n.startsWith("_backup-zibbycorp-employees-"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dir, backups[0], "agents/architekt.md"), "utf8")).toContain(
      "department: dev",
    );
  });

  it("is idempotent: a second --apply over an already-migrated tree makes zero new hires", () => {
    write("agents/architekt.md", agentFixture({ department: "dev" }));
    const first = runMigration({ dataDir: dir, apply: true });
    expect(first.changedCount).toBe(1);

    const second = runMigration({ dataDir: dir, apply: true });
    expect(second.changedCount).toBe(0);
    expect(readdirSync(join(dir, "employees"))).toEqual(["employee_architekt.json"]);
  });

  it("a partial re-run (employee file exists but department: still present) skips the duplicate hire", () => {
    write("agents/architekt.md", agentFixture({ department: "dev" }));
    mkdirSync(join(dir, "employees"), { recursive: true });
    writeFileSync(
      join(dir, "employees", "employee_architekt.json"),
      JSON.stringify({
        id: "employee_architekt",
        name: "Kevin",
        agentId: "architekt",
        department: "dev",
        status: "active",
        hiredAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = runMigration({ dataDir: dir, apply: true });
    const plan = result.plans.find((p) => p.agentId === "architekt");
    expect(plan.alreadyHired).toBe(true);
    // The frontmatter line is still stripped even though no new employee was hired.
    expect(read("agents/architekt.md")).not.toContain("department:");
    // No duplicate employee file, and "Kevin" is not claimed a second time.
    expect(readdirSync(join(dir, "employees"))).toEqual(["employee_architekt.json"]);
  });

  it("throws (writes nothing) when the seed pool would be exhausted", () => {
    for (let i = 0; i < EMPLOYEE_NAME_SEED.length + 1; i++) {
      write(`agents/agent-${String(i).padStart(2, "0")}.md`, agentFixture({ department: "dev" }));
    }
    expect(() => runMigration({ dataDir: dir, apply: true })).toThrow(/name pool exhausted/);
    expect(existsSync(join(dir, "employees"))).toBe(false);
  });

  it("a report is written when --report is given, noting hires and totals", () => {
    write("agents/architekt.md", agentFixture({ department: "dev" }));
    const reportPath = join(dir, "report.md");
    runMigration({ dataDir: dir, apply: true, reportPath });
    const report = readFileSync(reportPath, "utf8");
    expect(report).toContain("New hires: 1");
    expect(report).toContain("architekt");
  });
});
