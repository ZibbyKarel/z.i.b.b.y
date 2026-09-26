import { promises as fs } from "node:fs";
import * as path from "node:path";
import { request } from "@playwright/test";
import rootGlobalSetup from "../../e2e/global-setup";

const API = "http://localhost:3333";

/**
 * ZB-14 route sweep — extends the shared `e2e/global-setup.ts` fixtures (locale
 * cookie, the seeded gated agent + approval, `demo-project`/`demo-pipe`/`demo-skill`,
 * the `team-slack` integration, the vault notes) with the handful of extra entities
 * ROUTE-MAP §1 needs a real id for and the shared setup doesn't already seed: an
 * employee (People), a chain, a goal, a company, a team, a second (unrestricted)
 * task/run, and one MCP server / hook / slash command for the registries screens.
 *
 * Every id here is written to `.e2e-data/zc-sweep-ids.json`, which `sweep.spec.ts`
 * reads synchronously to resolve ROUTE-MAP's dynamic segments. Anything that can't
 * be seeded deterministically (and there's nothing so far) would be recorded here
 * with a comment, per the phase brief.
 */
export default async function globalSetup(): Promise<void> {
  await rootGlobalSetup();

  const ctx = await request.newContext({ baseURL: API });

  // A position (agent) with no approval gate, so the task it drives dispatches a
  // run immediately (the shared `gated-agent` blocks on an approval instead).
  await ctx
    .post("/api/agents", {
      data: {
        id: "sweep-agent",
        name: "Sweep Agent",
        instructions: "a plain demo position for the ZB-14 sweep",
        department: "dev",
      },
    })
    .catch(() => {});

  // An employee (D-015: People shows employees, not positions) hired into `dev`
  // under the `sweep-agent` position, for `/org/people/[id]`. `name` is
  // omitted (not passed as "Sweep Employee" or similar) — hiring only accepts
  // a name from the fixed `EmployeeName` pool (`GET /api/employee-names`,
  // ZE-01's allocator), so any free-form name 409s "not available"; omitting
  // it lets the allocator assign the next free pool name.
  const employeeRes = await ctx
    .post("/api/departments/dev/employees", {
      data: { agentId: "sweep-agent" },
    })
    .catch(() => null);
  const employee = employeeRes?.ok() ? ((await employeeRes.json()) as { id: string }) : null;

  // A chain for `/work/chains/[id]` and the New-task chain picker (Flow A).
  await ctx
    .put("/api/handoff/chains/sweep-chain", {
      data: {
        label: "Sweep Chain",
        description: "rnd -> dev -> qa, for the ZB-14 sweep and Flow A",
        entry: "rnd",
        steps: [
          { department: "dev", gate: "auto" },
          { department: "qa", gate: "ask" },
        ],
        enabled: true,
      },
    })
    .catch(() => {});

  // A goal for `/work/goals/[id]`.
  await ctx
    .post("/api/goals", {
      data: {
        id: "sweep-goal",
        name: "Sweep Goal",
        objective: "keep the sweep spec green",
        maker: { kind: "agent", id: "sweep-agent" },
        verifier: { kind: "checks", commands: ["true"] },
        maxIterations: 1,
        instructions: "a plain demo goal for the ZB-14 sweep",
      },
    })
    .catch(() => {});

  // A company and a team for `/work/companies/[id]` and `/work/teams/[id]`.
  await ctx
    .post("/api/companies", { data: { id: "sweep-company", name: "Sweep Co" } })
    .catch(() => {});
  await ctx
    .post("/api/teams", {
      data: { id: "sweep-team", name: "Sweep Team", companyId: "sweep-company" },
    })
    .catch(() => {});

  // A second, non-gated task/run for `/work/tasks/[id]` and `/activity/runs/[runId]`
  // (the shared `gated-agent` task pauses on approval and never produces a
  // straightforward `runRef` to browse).
  const taskRes = await ctx
    .post("/api/tasks", {
      data: {
        title: "Sweep task",
        text: "a plain demo task for the ZB-14 sweep",
        paths: [],
        target: { kind: "agent", id: "sweep-agent", name: "Sweep Agent", glyph: "bot" },
      },
    })
    .catch(() => null);
  const taskBody = taskRes?.ok()
    ? ((await taskRes.json()) as {
        task?: { id?: string };
        runRef?: string;
      })
    : null;
  const taskId = taskBody?.task?.id;
  // `createTask` can return the `pending` outcome (no `runRef` yet — dispatch
  // is still running) even for a synchronous caller like this one; poll the
  // task record briefly for the `runRef` `TaskDetailScreen`/`/activity/runs`
  // need, rather than trusting the immediate response shape.
  let runId = taskBody?.runRef;
  if (taskId && !runId) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && !runId) {
      const res = await ctx.get(`/api/tasks/${taskId}`).catch(() => null);
      if (res?.ok()) {
        const body = (await res.json()) as { runRef?: string };
        runId = body.runRef;
      }
      if (!runId) await new Promise((r) => setTimeout(r, 250));
    }
  }

  // MCP server / hook / slash command, one each, for the registries detail routes.
  await ctx
    .post("/api/mcp-servers", { data: { id: "sweep-mcp", type: "stdio", command: "true" } })
    .catch(() => {});
  await ctx
    .post("/api/hooks", {
      data: { id: "sweep-hook", event: "PreToolUse", command: "true" },
    })
    .catch(() => {});
  await ctx
    .post("/api/commands", { data: { id: "sweep-command", instructions: "do the demo" } })
    .catch(() => {});

  await ctx.dispose();

  const ids = {
    departmentId: "dev",
    departmentPipelineId: "demo-pipe",
    employeeId: employee?.id ?? null,
    chainId: "sweep-chain",
    goalId: "sweep-goal",
    companyId: "sweep-company",
    teamId: "sweep-team",
    projectId: "demo-project",
    integrationId: "team-slack",
    taskId: taskId ?? null,
    runId: runId ?? null,
    positionId: "sweep-agent",
    skillId: "demo-skill",
    mcpId: "sweep-mcp",
    hookId: "sweep-hook",
    commandId: "sweep-command",
    redirectAgentId: "gated-agent",
    redirectPipelineId: "demo-pipe",
  };
  await fs.writeFile(path.resolve(".e2e-data/zc-sweep-ids.json"), JSON.stringify(ids, null, 2));
}
