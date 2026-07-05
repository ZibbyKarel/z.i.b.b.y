"use client";

import { Chip, Markdown, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useSelfKnowledgeQuery } from "../../self-knowledge";

/** Testids for the read-only self-knowledge panel. */
export enum SelfKnowledgeSectionTestId {
  DriftChip = "self-knowledge-drift-chip",
  GeneratedAt = "self-knowledge-generated-at",
  Sections = "self-knowledge-sections",
  Markdown = "self-knowledge-markdown",
}

/** "HH:MM" in the operator's locale, for the generatedAt caption. */
function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/**
 * Read-only settings panel for the Fáze 1 self-knowledge note (agents, pipelines,
 * gate rules, channels). ZIBBY generates and stores this note itself
 * (`pnpm self-knowledge:generate`) — this panel only ever displays it, the same
 * "files are source of truth, UI is a view" posture as the rest of the app. The
 * same note is also visible as an ordinary vault note in the `memory` segment.
 */
export function SelfKnowledgeSection() {
  const t = useTranslations("settings");
  const query = useSelfKnowledgeQuery();

  if (query.isPending) {
    return (
      <HudPanel padding="300" title={t("selfKnowledge.title")}>
        <QueryLoading />
      </HudPanel>
    );
  }

  if (query.isError || !query.data) {
    return (
      <HudPanel padding="300" title={t("selfKnowledge.title")}>
        <QueryError onRetry={() => query.refetch()} />
      </HudPanel>
    );
  }

  const { markdown, generatedAt, drift, sections } = query.data;

  return (
    <HudPanel padding="300" title={t("selfKnowledge.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("selfKnowledge.hint")}
        </Typography>

        <Stack wrap align="center" direction="row" gap="150">
          <Chip
            dot
            data-testid={SelfKnowledgeSectionTestId.DriftChip}
            tone={drift ? "wait" : "ok"}
          >
            {drift ? t("selfKnowledge.drift") : t("selfKnowledge.upToDate")}
          </Chip>
          <Typography
            mono
            data-testid={SelfKnowledgeSectionTestId.GeneratedAt}
            size="2xs"
            type="note"
            variant="tertiary"
          >
            {t("selfKnowledge.generatedAt", { time: formatGeneratedAt(generatedAt) })}
          </Typography>
        </Stack>

        <Typography
          mono
          data-testid={SelfKnowledgeSectionTestId.Sections}
          size="2xs"
          type="note"
          variant="tertiary"
        >
          {t("selfKnowledge.sections", {
            agents: sections.agents,
            pipelines: sections.pipelines,
            gateRules: sections.gateRules,
            channels: sections.channels,
          })}
        </Typography>

        <div data-testid={SelfKnowledgeSectionTestId.Markdown}>
          <Markdown source={markdown} />
        </div>
      </Stack>
    </HudPanel>
  );
}
