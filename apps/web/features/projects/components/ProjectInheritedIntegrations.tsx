"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import { Button, Divider, Stack, Tag, Typography } from "@zibby/design-system";
import {
  type Integration,
  type IntegrationKind,
  type IntegrationRoutingRule,
  type RoutingMatch,
  repoFromGitRemote,
} from "@zibby/contracts";
import { useUpdateProjectMutation } from "../mutations";
import { useResolvedProjectQuery } from "../queries";
import { IntegrationRoutingEditor } from "./IntegrationRoutingEditor";

export enum ProjectInheritedIntegrationsTestId {
  Root = "project-inherited-integrations",
  Row = "project-inherited-integration",
  FromCompanyBadge = "project-inherited-from-company",
  CompanyLink = "project-inherited-company-link",
  Override = "project-inherited-override",
  GithubRemote = "project-inherited-github-remote",
}

export interface ProjectInheritedIntegrationsProps {
  projectId: string;
  /** The project's own routing rules (`Project.integrationRouting`). */
  routing: IntegrationRoutingRule[];
  /** The project's `gitRemote` — GitHub routing is implicit from it. */
  gitRemote?: string | undefined;
  /** Open the create flow prefilled with `kind`, owned by this project. */
  onOverride: (kind: IntegrationKind) => void;
}

/**
 * Company-owned integrations this project inherits (Phase 128, D12): read-only,
 * badged "from company" with a link to the company, plus the routing rule that
 * says which of the shared integration's items belong to THIS project and an
 * "Override with own integration" action (D1 — the project then owns an
 * integration of that kind and the company's one drops out of the merge).
 * Project-owned integrations are not shown here; they keep the card grid.
 */
export function ProjectInheritedIntegrations({
  projectId,
  routing,
  gitRemote,
  onOverride,
}: ProjectInheritedIntegrationsProps) {
  const t = useTranslations("projects.integrations.inherited");
  const tk = useTranslations();
  const resolvedQ = useResolvedProjectQuery(projectId);
  const updateProject = useUpdateProjectMutation();

  const inherited = (resolvedQ.data?.integrations ?? []).filter(
    (i): i is Integration & { companyId: string } => Boolean(i.companyId),
  );
  if (inherited.length === 0) return null;
  const companyName = resolvedQ.data?.companyName;

  // ponytail: one rule per integration in the UI; saving replaces all of that integration's rules.
  function saveRule(integrationId: string, match: RoutingMatch | null) {
    const others = routing.filter((r) => r.integrationId !== integrationId);
    updateProject.mutate({
      params: { id: projectId },
      body: { integrationRouting: match ? [...others, { integrationId, match }] : others },
    });
  }

  return (
    <Stack data-testid={ProjectInheritedIntegrationsTestId.Root} gap="150">
      <Divider />
      <Typography mono size="sm" type="note" variant="secondary">
        {t("title")}
      </Typography>
      {inherited.map((integration) => {
        const rule = routing.find((r) => r.integrationId === integration.id);
        const repo = repoFromGitRemote(gitRemote);
        return (
          <Stack
            data-testid={`${ProjectInheritedIntegrationsTestId.Row}-${integration.id}`}
            gap="100"
            key={integration.id}
          >
            <Stack wrap align="center" direction="row" gap="100">
              <Tag>{tk(KIND_LABEL_KEY[integration.kind])}</Tag>
              <Typography size="sm" type="text">
                {integration.name ?? integration.id}
              </Typography>
              <Tag data-testid={ProjectInheritedIntegrationsTestId.FromCompanyBadge} tone="accent">
                {t("fromCompany", { name: companyName ?? integration.companyId })}
              </Tag>
              <Link
                data-testid={ProjectInheritedIntegrationsTestId.CompanyLink}
                href={`/companies/${integration.companyId}?tab=integrations` as Route}
              >
                <Typography size="xs" type="note" variant="secondary">
                  {t("openCompany")}
                </Typography>
              </Link>
              <Button
                data-testid={`${ProjectInheritedIntegrationsTestId.Override}-${integration.id}`}
                icon="plus"
                intent="ghost"
                onClick={() => onOverride(integration.kind)}
                size="sm"
              >
                {t("override")}
              </Button>
            </Stack>

            {(integration.kind === "jira" || integration.kind === "slack") && (
              <IntegrationRoutingEditor
                key={JSON.stringify(rule ?? null)}
                kind={integration.kind}
                onSave={(match) => saveRule(integration.id, match)}
                rule={rule}
                saving={updateProject.isPending}
              />
            )}

            {integration.kind === "github" && (
              <Typography
                data-testid={ProjectInheritedIntegrationsTestId.GithubRemote}
                size="xs"
                type="note"
                variant="tertiary"
              >
                {repo ? t("githubRoutedBy", { repo }) : t("githubNoRemote")}
              </Typography>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

/** Root-namespace i18n key per `Integration.kind`. */
const KIND_LABEL_KEY = {
  slack: "integrations.kindSlack",
  email: "integrations.kindEmail",
  jira: "integrations.kindJira",
  github: "integrations.kindGithub",
  calendar: "integrations.kindCalendar",
  sentry: "integrations.kindSentry",
} as const satisfies Record<IntegrationKind, string>;
