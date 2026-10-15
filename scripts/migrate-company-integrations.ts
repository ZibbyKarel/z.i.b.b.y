import { promises as fs } from "node:fs";
import * as path from "node:path";
import { IntegrationSchema } from "@zibby/contracts";
import {
  formatPlan,
  planCompanyIntegrationMigration,
  withRoutingRule,
} from "../apps/api/src/integrations/company-integration-migration";
import { dataDir } from "../apps/api/src/shared/data-dir";

/**
 * Phase 128 (D11) — one-shot migration of project-owned Jira integrations into
 * one company-owned integration per (company, baseUrl). Dry-run by default;
 * `--apply` writes. Run: `pnpm migrate:company-integrations [-- --apply]`.
 */
const integrationsDir = process.env.INTEGRATIONS_DIR ?? dataDir("integrations");
const credentialsDir = process.env.CREDENTIALS_DIR ?? dataDir("credentials");
const stateDir = process.env.INTEGRATION_STATE_DIR ?? dataDir("integration-state");
const manifest = path.join(process.env.PROJECTS_DIR ?? dataDir("projects"), "_projects.json");

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await fs.readFile(file, "utf8"));
const rmIfExists = (file: string) => fs.rm(file, { force: true });

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const files = (await fs.readdir(integrationsDir)).filter((f) => f.endsWith(".json"));
  const integrations = [];
  for (const f of files) {
    const parsed = IntegrationSchema.safeParse(await readJson(path.join(integrationsDir, f)));
    if (parsed.success) integrations.push(parsed.data);
  }
  const rawProjects = (await readJson(manifest)) as Record<string, unknown>[];
  const plan = planCompanyIntegrationMigration(
    integrations,
    rawProjects.map((p) => ({ id: String(p.id), companyId: p.companyId as string | undefined })),
  );

  console.log(formatPlan(plan));
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  for (const g of plan.groups) {
    await fs.writeFile(
      path.join(integrationsDir, `${g.target.id}.json`),
      JSON.stringify(g.target),
      { flag: "wx" },
    );
    await fs.copyFile(
      path.join(credentialsDir, `${g.credentialsFrom}.json`),
      path.join(credentialsDir, `${g.target.id}.json`),
    );
    for (const r of g.routing) {
      const project = rawProjects.find((p) => p.id === r.projectId);
      if (!project) continue;
      project.integrationRouting = withRoutingRule(project.integrationRouting as never, r.rule);
    }
    await fs.writeFile(manifest, `${JSON.stringify(rawProjects, null, 2)}\n`);
    for (const id of g.removeIds) {
      await rmIfExists(path.join(integrationsDir, `${id}.json`));
      await rmIfExists(path.join(credentialsDir, `${id}.json`));
      await rmIfExists(path.join(stateDir, `${id}.json`));
    }
  }
  console.log(`\nApplied ${plan.groups.length} group(s).`);
}

main().catch((error) => {
  console.error(
    "[migrate-company-integrations] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
