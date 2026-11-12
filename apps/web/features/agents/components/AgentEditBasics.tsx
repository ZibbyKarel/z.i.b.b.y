"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ButtonGroup,
  Container,
  IconTile,
  Pressable,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { type Category, MODEL_TIERS, type ModelTier } from "@zibby/contracts";
import {
  type Control,
  Controller,
  FormMarkdownEditor,
  FormSegmentPicker,
  FormSelect,
  FormTextInput,
  useWatch,
} from "@zibby/forms";
import {
  AiEngineModelPicker,
  useAiEnginesQuery,
  useThinkingHint,
  useTierLabel,
} from "../../ai-providers";
import { useSystemConfigQuery } from "../../system";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { AGENT_GLYPHS, AGENT_TOOLS, THINKING_OPTIONS } from "../../../state/config";
import type { AgentEditValues } from "./agentEditValues";

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable onClick={onClick}>
      <Tag tone={active ? "accent" : "neutral"}>{children}</Tag>
    </Pressable>
  );
}

export interface AgentEditBasicsProps {
  /** The modal's form control — the fields render against the shared form. */
  control: Control<AgentEditValues>;
  categories: Category[];
}

/**
 * The "basics" tab of the agent editor: identity (name, when-to-use, category),
 * runtime (model, thinking, glyph, tools) and the Markdown body, side by side.
 * Presentational — the form instance and save flow live in the modal.
 */
export function AgentEditBasics({ control, categories }: AgentEditBasicsProps) {
  const t = useTranslations("agents");
  const departments = useDepartmentLookup();
  const engine = useWatch({ control, name: "engine" });
  const [tier, thinking, engineModelValue] = useWatch({
    control,
    name: ["model", "thinking", "engineModel"],
  });
  const tEngine = useTranslations("aiEngine");
  const tierLabel = useTierLabel();
  const globalEngine = useSystemConfigQuery().data?.aiEngine ?? "claude";
  // Levels read as the concrete model of the agent's effective engine (override ?? global).
  const modelOptions = MODEL_TIERS.map((tier) => ({
    value: tier,
    label: tierLabel(tier, engine || globalEngine),
  }));
  const { data: engines } = useAiEnginesQuery();
  const thinkingHint = useThinkingHint({
    engine,
    engineModel: engineModelValue,
    tier: tier as ModelTier,
    thinking,
  });
  const opencodeModels = engines?.engines.find((e) => e.id === "opencode")?.models ?? [];

  return (
    <Container padding={["200", "0", "0", "0"]}>
      <Stack align="start" direction="row" gap="300">
        <Container grow minW0>
          <Stack gap="200">
            <FormTextInput<AgentEditValues>
              autoFocus
              label={t("fields.name")}
              name="name"
              placeholder={t("fields.namePlaceholder")}
            />

            <FormTextInput<AgentEditValues>
              label={t("fields.displayName")}
              name="displayName"
              placeholder={t("fields.displayNamePlaceholder")}
            />

            <FormTextInput<AgentEditValues>
              label={t("fields.jobTitle")}
              name="title"
              placeholder={t("fields.jobTitlePlaceholder")}
            />

            <FormTextInput<AgentEditValues>
              label={t("fields.whenToUse")}
              name="description"
              placeholder={t("fields.whenToUsePlaceholder")}
            />

            <FormSelect<string, AgentEditValues>
              label={t("fields.category")}
              name="category"
              options={categories.map((c) => ({ value: c.name, label: c.name }))}
            />

            <FormSelect<string, AgentEditValues>
              label={t("fields.department")}
              name="department"
              options={departments.list.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("departmentPlaceholder")}
            />

            <Stack direction="row" gap="150">
              <Container grow minW0>
                <FormSelect<string, AgentEditValues>
                  label={t("fields.model")}
                  name="model"
                  options={modelOptions}
                />
              </Container>
              <Container grow minW0>
                <FormSegmentPicker<AgentEditValues>
                  label={t("fields.thinking")}
                  name="thinking"
                  options={THINKING_OPTIONS}
                />
              </Container>
            </Stack>
            {thinkingHint && (
              <Typography
                data-testid="agent-thinking-hint"
                leading="snug"
                size="2xs"
                type="note"
                variant="tertiary"
              >
                {thinkingHint}
              </Typography>
            )}

            <Controller<AgentEditValues, "engine">
              control={control}
              name="engine"
              render={({ field }) => (
                <Stack gap="75">
                  <Typography mono size="sm" type="note" variant="secondary">
                    {tEngine("agentField")}
                  </Typography>
                  <ButtonGroup
                    ariaLabel={tEngine("agentField")}
                    onChange={(v) => field.onChange(v === "global" ? "" : v)}
                    options={[
                      { id: "global", label: tEngine("useGlobal") },
                      { id: "claude", label: tEngine("engine.claude") },
                      { id: "opencode", label: tEngine("engine.opencode") },
                    ]}
                    value={field.value || "global"}
                  />
                </Stack>
              )}
            />
            {engine === "opencode" && (
              <Controller<AgentEditValues, "engineModel">
                control={control}
                name="engineModel"
                render={({ field }) => (
                  <AiEngineModelPicker
                    clearable
                    label={tEngine("exactModel")}
                    loaded={engines !== undefined}
                    models={opencodeModels}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            )}

            <Controller<AgentEditValues, "glyph">
              control={control}
              name="glyph"
              render={({ field }) => (
                <Stack gap="75">
                  <Typography mono size="sm" type="note" variant="secondary">
                    {t("fields.icon")}
                  </Typography>
                  <Stack wrap direction="row" gap="75">
                    {AGENT_GLYPHS.map((g) => (
                      <IconTile
                        interactive
                        aria-label={g}
                        aria-pressed={field.value === g}
                        as="button"
                        glyph={g}
                        key={g}
                        onClick={() => field.onChange(g)}
                        radius="default"
                        size="sm"
                        tone={field.value === g ? "accent" : "neutral"}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}
            />

            <Controller<AgentEditValues, "tools">
              control={control}
              name="tools"
              render={({ field }) => {
                const tools = field.value ?? [];
                return (
                  <Stack gap="75">
                    <Typography mono size="sm" type="note" variant="secondary">
                      {t("allowedTools")}
                    </Typography>
                    <Stack wrap direction="row" gap="75">
                      {AGENT_TOOLS.map((tool) => (
                        <ChipToggle
                          active={tools.includes(tool)}
                          key={tool}
                          onClick={() =>
                            field.onChange(
                              tools.includes(tool)
                                ? tools.filter((x) => x !== tool)
                                : [...tools, tool],
                            )
                          }
                        >
                          {tool}
                        </ChipToggle>
                      ))}
                    </Stack>
                  </Stack>
                );
              }}
            />
          </Stack>
        </Container>

        <Container grow minW0>
          <FormMarkdownEditor<AgentEditValues>
            hint={t("fields.bodyHint")}
            label={t("fields.body")}
            name="instructions"
            placeholder={t("fields.bodyPlaceholder")}
          />
        </Container>
      </Stack>
    </Container>
  );
}
