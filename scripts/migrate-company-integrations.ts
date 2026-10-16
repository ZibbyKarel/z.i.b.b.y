import { promises as fs } from "node:fs";
import * as path from "node:path";
import { IntegrationSchema } from "@zibby/contracts";
import {
  formatPlan,
  planCompanyIntegrationMigration,
  planGithubCompanyMigration,
  withRoutingRule,
} from "../apps/api/src/integrations/company-integration-migration";
import { dataDir } from "../apps/api/src/shared/data-dir";

/**
 * Phase 128 (D11) — one-shot migration of project-owned Jira integrations into
 * one company-owned integration per (company, baseUrl). Phase 129 (G3) — and of
 * project-owned GitHub integrations sharing token + username into one repo-less
 * `<companyId>-github` (each project's repo then comes from its gitRemote; a repo
 * GitHub reports under a new name blocks the merge). Tokens are read to compare
 * and to ask GitHub for each repo's current name, never printed. Dry-run by default;
 * `--apply` writes. Run: `pnpm migrate:company-integrations [-- --apply]`.
 */
const integrationsDir = process.env.INTEGRATIONS_DIR ?? dataDir("integrations");
const credentialsDir = process.env.CREDENTIALS_DIR ?? dataDir("credentials");
const stateDir = process.env.INTEGRATION_STATE_DIR ?? dataDir("integration-state");
const manifest = path.join(process.env.PROJECTS_DIR ?? dataDir("projects"), "_projects.json");

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await fs.readFile(file, "utf8"));
const rmIfExists = (file: string) => fs.rm(file, { force: true });

/** GitHub's current `full_name` for `repo` (follows a rename redirect), or null. */
async function currentRepoName(repo: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { full_name?: unknown };
    return typeof body.full_name === "string" ? body.full_name : null;
  } catch {
    return null;
  }
}

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

  const tokens = new Map<string, string>();
  const canonicalRepos = new Map<string, string>();
  for (const i of integrations) {
    if (i.config.kind !== "github" || !i.projectId || !i.config.repo) continue;
    const creds = (await readJson(path.join(credentialsDir, `${i.id}.json`)).catch(() => null)) as {
      token?: unknown;
    } | null;
    if (typeof creds?.token !== "string") continue;
    tokens.set(i.id, creds.token);
    const canonical = await currentRepoName(i.config.repo, creds.token);
    if (canonical) canonicalRepos.set(i.id, canonical);
    else console.log(`note: could not look up ${i.config.repo} on GitHub (rename not checked)`);
  }
  const githubPlan = planGithubCompanyMigration(
    integrations,
    rawProjects.map((p) => ({
      id: String(p.id),
      companyId: p.companyId as string | undefined,
      gitRemote: p.gitRemote as string | undefined,
    })),
    tokens,
    canonicalRepos,
  );

  console.log(formatPlan(plan, githubPlan));
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
  for (const g of githubPlan.groups) {
    await fs.writeFile(
      path.join(integrationsDir, `${g.target.id}.json`),
      JSON.stringify(g.target),
      { flag: "wx" },
    );
    await fs.copyFile(
      path.join(credentialsDir, `${g.credentialsFrom}.json`),
      path.join(credentialsDir, `${g.target.id}.json`),
    );
    for (const id of g.removeIds) {
      await rmIfExists(path.join(integrationsDir, `${id}.json`));
      await rmIfExists(path.join(credentialsDir, `${id}.json`));
      await rmIfExists(path.join(stateDir, `${id}.json`));
    }
  }
  console.log(`\nApplied ${plan.groups.length + githubPlan.groups.length} group(s).`);
}

main().catch((error) => {
  console.error(
    "[migrate-company-integrations] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
