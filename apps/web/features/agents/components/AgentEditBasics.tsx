"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Chip,
  Container,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Category } from "@zibby/contracts";
import {
  type Control,
  Controller,
  FormMarkdownEditor,
  FormSegmentPicker,
  FormTextInput,
} from "@zibby/forms";
import { AGENT_GLYPHS, AGENT_TOOLS, MODEL_OPTIONS, THINKING_OPTIONS } from "../../../state/config";
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
      <Chip tone={active ? "accent" : "neutral"}>{children}</Chip>
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
              label={t("fields.whenToUse")}
              name="description"
              placeholder={t("fields.whenToUsePlaceholder")}
            />

            <Controller<AgentEditValues, "category">
              control={control}
              name="category"
              render={({ field }) => (
                <Stack gap="75">
                  <Typography mono size="sm" type="note" variant="secondary">
                    {t("fields.category")}
                  </Typography>
                  <Stack wrap direction="row" gap="75">
                    {categories.map((c) => (
                      <ChipToggle
                        active={field.value === c.name}
                        key={c.name}
                        onClick={() => field.onChange(c.name)}
                      >
                        {c.name}
                      </ChipToggle>
                    ))}
                  </Stack>
                </Stack>
              )}
            />

            <Stack direction="row" gap="150">
              <Container grow minW0>
                <FormSegmentPicker<AgentEditValues>
                  label={t("fields.model")}
                  name="model"
                  options={MODEL_OPTIONS}
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
