"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Divider,
  SelectField,
  Stack,
  TextInputField,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import type { ResearchConfig, ResearchSource, ResearchSourceKind } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useResearchConfigQuery } from "../../research/queries";
import { useSetResearchConfigMutation } from "../../research/mutations";

/** Testids for the research config editor (the screen + tests select via these). */
export enum ResearchSectionTestId {
  Interests = "research-interests",
  FinanceWatch = "research-finance-watch",
  AddSource = "research-add-source",
  Save = "research-save",
}

const SOURCE_KINDS: ResearchSourceKind[] = [
  "rss",
  "hn",
  "producthunt",
  "tech",
  "competitor",
  "finance",
];

/**
 * The operator research / intelligence config editor (M6). Sets the interests the
 * nightly digest ranks against, the watched sources (each fetched through a
 * pluggable adapter), and the overview-only finance watch. Local form state is
 * seeded from the loaded config and the whole document is PUT on Save (it is small
 * and operator-owned, like the mandate).
 */
export function ResearchSection() {
  const { data: config } = useResearchConfigQuery();
  if (!config) return null;
  // Remount the editor when the persisted config changes so local state reseeds.
  return <ResearchEditor config={config} key={JSON.stringify(config)} />;
}

function ResearchEditor({ config }: { config: ResearchConfig }) {
  const t = useTranslations("settings");
  const setConfig = useSetResearchConfigMutation();

  const [interests, setInterests] = useState(config.interests.join(", "));
  const [financeWatch, setFinanceWatch] = useState(config.financeWatch);
  const [sources, setSources] = useState<ResearchSource[]>(config.sources);

  const updateSource = (index: number, patch: Partial<ResearchSource>) =>
    setSources((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const removeSource = (index: number) =>
    setSources((prev) => prev.filter((_, i) => i !== index));

  const addSource = () =>
    setSources((prev) => [
      ...prev,
      { id: `source-${prev.length + 1}`, kind: "rss", label: "", enabled: true },
    ]);

  const save = () =>
    setConfig.mutate({
      body: {
        interests: interests
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean),
        financeWatch,
        sources: sources
          .filter((s) => s.label.trim().length > 0)
          .map((s) => ({
            id: s.id,
            kind: s.kind,
            label: s.label.trim(),
            enabled: s.enabled,
            ...(s.url?.trim() ? { url: s.url.trim() } : {}),
          })),
      },
    });

  return (
    <HudPanel padding="300" title={t("research.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("research.hint")}
        </Typography>

        <TextInputField
          data-testid={ResearchSectionTestId.Interests}
          hint={t("research.interestsHint")}
          label={t("research.interests")}
          onChange={(e) => setInterests(e.target.value)}
          placeholder="ai agents, devtools, llm"
          value={interests}
        />

        <ToggleField
          checked={financeWatch}
          data-testid={ResearchSectionTestId.FinanceWatch}
          hint={t("research.financeWatchHint")}
          label={t("research.financeWatch")}
          onChange={setFinanceWatch}
        />

        <Divider />

        <Typography type="text" weight="medium">
          {t("research.sources")}
        </Typography>

        {sources.map((source, index) => (
          <Stack align="end" direction="row" gap="100" key={source.id}>
            <TextInputField
              data-testid={`research-source-${index}-label`}
              label={t("research.sourceLabel")}
              onChange={(e) => updateSource(index, { label: e.target.value })}
              value={source.label}
            />
            <SelectField
              label={t("research.sourceKind")}
              onValueChange={(v) => updateSource(index, { kind: v as ResearchSourceKind })}
              options={SOURCE_KINDS.map((k) => ({ value: k, label: t(`research.kind.${k}`) }))}
              value={source.kind}
            />
            <TextInputField
              data-testid={`research-source-${index}-url`}
              label={t("research.sourceUrl")}
              onChange={(e) => updateSource(index, { url: e.target.value })}
              placeholder="https://…"
              value={source.url ?? ""}
            />
            <ToggleField
              checked={source.enabled}
              data-testid={`research-source-${index}-enabled`}
              label={t("research.sourceEnabled")}
              onChange={(v) => updateSource(index, { enabled: v })}
            />
            <Button
              data-testid={`research-source-${index}-remove`}
              icon="trash"
              intent="ghost"
              onClick={() => removeSource(index)}
            >
              {t("research.removeSource")}
            </Button>
          </Stack>
        ))}

        <Stack align="center" direction="row" gap="150" justify="between">
          <Button
            data-testid={ResearchSectionTestId.AddSource}
            icon="plus"
            intent="ghost"
            onClick={addSource}
          >
            {t("research.addSource")}
          </Button>
          <Button
            data-testid={ResearchSectionTestId.Save}
            disabled={setConfig.isPending}
            icon="check"
            intent="primary"
            onClick={save}
          >
            {t("research.save")}
          </Button>
        </Stack>
      </Stack>
    </HudPanel>
  );
}
