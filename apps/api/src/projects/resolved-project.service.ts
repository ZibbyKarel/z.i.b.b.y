import { Injectable } from "@nestjs/common";
import type { Integration, Project, ProjectBudget, ProjectPerson } from "@zibby/contracts";
import { CompaniesStorageService } from "../companies/companies.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import {
  type ResolvedProjectContext,
  computeResolvedContext,
  mergeBudget,
  mergeIntegrationsByKind,
  mergePeople,
} from "./resolved-project.helpers";

/**
 * Computes a project's EFFECTIVE people / budget / integrations by merging its
 * linked company's data at READ TIME (Phase 70 — the master plan's "resolved
 * project context service"). Never persists anything: editing the company (or the
 * project) is reflected live on the next resolve, same idiom as the computed
 * `hasSecrets` on `Project`.
 *
 * A `project.companyId` that doesn't resolve to an existing company (deleted
 * company, dangling reference — Phase 68/69's "allow delete, no cascade" decision)
 * is treated as "no company": every method below returns the project's own raw
 * data rather than throwing/500ing. A project with no `companyId` at all takes the
 * exact same path (identity — company is `null` either way).
 *
 * The actual field-merge rules are pure functions in `resolved-project.helpers.ts`,
 * unit-tested there without touching storage; this service is only the DB-facing
 * seam (company lookup + integration-ownership fan-out).
 */
@Injectable()
export class ResolvedProjectService {
  constructor(
    private readonly companies: CompaniesStorageService,
    private readonly integrations: IntegrationsStorageService,
  ) {}

  /** Effective (company-merged) people for `project`. */
  async resolvePeople(project: Project): Promise<ProjectPerson[]> {
    const company = await this.findCompany(project.companyId);
    return mergePeople(company?.people ?? [], project.identity?.people ?? []);
  }

  /** Effective (field-level, company-merged) budget for `project`. */
  async resolveBudget(project: Project): Promise<ProjectBudget | undefined> {
    const company = await this.findCompany(project.companyId);
    return mergeBudget(company?.budget, project.budget);
  }

  /** Effective (company + project, merged by `kind`) integrations for `project`. */
  async resolveIntegrations(project: Project): Promise<Integration[]> {
    const company = await this.findCompany(project.companyId);
    const { companyIntegrations, projectIntegrations } = await this.integrationsByOwner(
      project,
      company?.id,
    );
    return mergeIntegrationsByKind(companyIntegrations, projectIntegrations);
  }

  /**
   * All three facets in one call, sharing a single company lookup + a single
   * integrations listing — the cheapest way for a consumer that needs more than
   * one facet (e.g. a future project-detail read) to get the full context.
   */
  async resolve(project: Project): Promise<ResolvedProjectContext> {
    const company = await this.findCompany(project.companyId);
    const { companyIntegrations, projectIntegrations } = await this.integrationsByOwner(
      project,
      company?.id,
    );
    return computeResolvedContext(project, company, companyIntegrations, projectIntegrations);
  }

  /**
   * The linked company's `id`/`name` — `undefined` for "no company" (absent
   * `companyId`, or a dangling one whose company was deleted). Only for the wire
   * context's UI-facing "resolved from company X" note (Phase 72); the merge
   * itself (above) never needs the name, so this is a separate, additive lookup
   * that doesn't change {@link resolve}'s existing (tested) return shape.
   */
  async resolveCompanyRef(project: Project): Promise<{ id: string; name: string } | undefined> {
    const company = await this.findCompany(project.companyId);
    return company ? { id: company.id, name: company.name } : undefined;
  }

  /**
   * Resolve `companyId` to a `Company`, or `null` for "no company" — absent id, OR
   * a dangling id whose company was deleted (`CompaniesStorageService.get` 404s,
   * caught here and folded into the same `null` path; never rethrown, per the
   * Phase 68 cross-cutting "dangling companyId" decision).
   */
  private async findCompany(
    companyId: string | undefined,
  ): Promise<{ id: string; name: string; people?: ProjectPerson[]; budget?: ProjectBudget } | null> {
    if (!companyId) return null;
    return this.companies.get(companyId).catch(() => null);
  }

  /** Split the full integrations listing into this project's and its company's own. */
  private async integrationsByOwner(
    project: Project,
    companyId: string | undefined,
  ): Promise<{ companyIntegrations: Integration[]; projectIntegrations: Integration[] }> {
    const all = await this.integrations.list();
    return {
      companyIntegrations: companyId
        ? all.filter((integration) => integration.companyId === companyId)
        : [],
      projectIntegrations: all.filter((integration) => integration.projectId === project.id),
    };
  }
}
