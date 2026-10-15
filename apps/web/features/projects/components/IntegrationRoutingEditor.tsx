"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stack, TextInputField } from "@zibby/design-system";
import {
  type IntegrationRoutingRule,
  type RoutingMatch,
  RoutingMatchSchema,
} from "@zibby/contracts";

export enum IntegrationRoutingEditorTestId {
  Root = "integration-routing-editor",
  ProjectKey = "integration-routing-project-key",
  Components = "integration-routing-components",
  Labels = "integration-routing-labels",
  Jql = "integration-routing-jql",
  Channels = "integration-routing-channels",
  Save = "integration-routing-save",
  Clear = "integration-routing-clear",
}

export interface IntegrationRoutingEditorProps {
  /** Which kind of rule to edit — only Jira and Slack carry configuration. */
  kind: "jira" | "slack";
  /** The project's current rule for this integration, if any. */
  rule?: IntegrationRoutingRule | undefined;
  saving?: boolean;
  /** `null` removes the project's rule for this integration. */
  onSave: (match: RoutingMatch | null) => void;
}

const join = (list: string[] | undefined) => (list ?? []).join(", ");
const split = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The per-project routing rule for ONE inherited company integration (Phase 128, D3):
 * "items of this integration that look like THIS are mine". Jira matches by project
 * key (+ optional components / labels) or raw JQL; Slack by channel list. The draft
 * is validated against the contract's `RoutingMatchSchema`, so Save is only enabled
 * for a rule the backend would accept.
 */
export function IntegrationRoutingEditor({
  kind,
  rule,
  saving = false,
  onSave,
}: IntegrationRoutingEditorProps) {
  const t = useTranslations("projects.integrations.routing");
  const current = rule?.match;
  const jira = current?.kind === "jira" ? current : undefined;
  const slack = current?.kind === "slack" ? current : undefined;

  const [projectKey, setProjectKey] = useState(jira?.projectKey ?? "");
  const [components, setComponents] = useState(join(jira?.components));
  const [labels, setLabels] = useState(join(jira?.labels));
  const [jql, setJql] = useState(jira?.jql ?? "");
  const [channels, setChannels] = useState(join(slack?.channels));

  const draft: unknown =
    kind === "jira"
      ? {
          kind,
          ...(projectKey.trim() ? { projectKey: projectKey.trim() } : {}),
          ...(split(components).length > 0 ? { components: split(components) } : {}),
          ...(split(labels).length > 0 ? { labels: split(labels) } : {}),
          ...(jql.trim() ? { jql: jql.trim() } : {}),
        }
      : { kind, channels: split(channels) };
  const parsed = RoutingMatchSchema.safeParse(draft);

  return (
    <Stack data-testid={IntegrationRoutingEditorTestId.Root} gap="100">
      {kind === "jira" ? (
        <>
          <TextInputField
            data-testid={IntegrationRoutingEditorTestId.ProjectKey}
            hint={t("projectKeyHint")}
            label={t("projectKey")}
            onChange={(e) => setProjectKey(e.target.value)}
            value={projectKey}
          />
          <TextInputField
            data-testid={IntegrationRoutingEditorTestId.Components}
            hint={t("listHint")}
            label={t("components")}
            onChange={(e) => setComponents(e.target.value)}
            value={components}
          />
          <TextInputField
            data-testid={IntegrationRoutingEditorTestId.Labels}
            hint={t("listHint")}
            label={t("labels")}
            onChange={(e) => setLabels(e.target.value)}
            value={labels}
          />
          <TextInputField
            data-testid={IntegrationRoutingEditorTestId.Jql}
            hint={t("jqlHint")}
            label={t("jql")}
            onChange={(e) => setJql(e.target.value)}
            value={jql}
          />
        </>
      ) : (
        <TextInputField
          data-testid={IntegrationRoutingEditorTestId.Channels}
          hint={t("channelsHint")}
          label={t("channels")}
          onChange={(e) => setChannels(e.target.value)}
          value={channels}
        />
      )}
      <Stack align="center" direction="row" gap="100">
        <Button
          data-testid={IntegrationRoutingEditorTestId.Save}
          disabled={!parsed.success || saving}
          icon="check"
          intent="primary"
          onClick={() => parsed.success && onSave(parsed.data)}
          size="sm"
        >
          {t("save")}
        </Button>
        {rule && (
          <Button
            data-testid={IntegrationRoutingEditorTestId.Clear}
            disabled={saving}
            intent="ghost"
            onClick={() => onSave(null)}
            size="sm"
          >
            {t("clear")}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
