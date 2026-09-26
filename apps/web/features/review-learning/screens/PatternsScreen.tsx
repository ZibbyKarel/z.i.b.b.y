"use client";

import type { StateTone } from "@zibby/design-system";
import { Container, EmptyState, PatternCard, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useProjectsQuery } from "../../projects";
import { usePromoteReviewRuleMutation } from "../mutations";
import { type ScopedReviewRule, useReviewRulesAllScopesQuery } from "../queries";

const GLOBAL_SCOPE = "_global";

/** One promote-mutation instance per row — `promote` needs the rule's OWN
 *  scope key (its project id, never `_global`), so this can't be hoisted to a
 *  single hook call in the parent without breaking the rules of hooks. */
function PatternRow({
  rule,
  t,
}: {
  rule: ScopedReviewRule;
  // Loosely typed (not `ReturnType<typeof useTranslations>`) — passing that
  // generic overload through a prop blows up `tsc`'s type-instantiation depth
  // on the `evidenceCount` call below.
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const promote = usePromoteReviewRuleMutation(rule.scopeKey);
  const evidence: StateTone[] = rule.occurrences.map(() => "done");
  const canPromote = rule.scope === "project" && rule.status === "active";
  return (
    <PatternCard
      evidence={evidence}
      evidenceLabel={
        rule.scope === "global"
          ? t("accepted")
          : t("evidenceCount", { n: rule.occurrences.length, of: rule.occurrences.length })
      }
      onAccept={
        canPromote
          ? () =>
              promote.mutate({ params: { projectId: rule.scopeKey, ruleId: rule.id }, body: {} })
          : undefined
      }
      rule={rule.rule}
      scope={`${rule.scope.toUpperCase()} · ${rule.status.toUpperCase()}`}
    />
  );
}

/**
 * `/policy/patterns` — learned review rules (`libs/contracts/src/review-learning`,
 * O-10: "the same thing as review-learning rules") as `PatternCard`s: every
 * project's scope plus `_global`, flattened. "Accept as rule" calls the one
 * mutation the contract has — `promote` — which widens an already-`active`
 * project rule to global. There is no dismiss/retire endpoint (a rule is born
 * from the nightly pass and only ever activated by the `review-rule` approval,
 * never deleted by a client), so `PatternCard`'s dismiss action is omitted
 * rather than invented against a non-existent route.
 */
export function PatternsScreen() {
  const t = useTranslations("policy.patterns");
  const { data: projects = [] } = useProjectsQuery();
  const scopes = [GLOBAL_SCOPE, ...projects.map((p) => p.id)];
  const rulesQuery = useReviewRulesAllScopesQuery(scopes);

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack gap="50">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("title")}
          </Typography>
          <Typography type="note" variant="secondary">
            {t("subtitle")}
          </Typography>
        </Stack>

        {rulesQuery.isPending ? (
          <QueryLoading />
        ) : rulesQuery.isError ? (
          <QueryError onRetry={rulesQuery.refetch} />
        ) : rulesQuery.data.length === 0 ? (
          <EmptyState body={t("empty")} title={t("title")} />
        ) : (
          <Stack gap="150">
            {rulesQuery.data.map((rule) => (
              <PatternRow
                key={`${rule.scopeKey}-${rule.id}`}
                rule={rule}
                t={t as (key: string, values?: Record<string, string | number>) => string}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
