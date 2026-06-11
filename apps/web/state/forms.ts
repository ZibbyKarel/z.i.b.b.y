"use client";

// TODO: split this file into correct module

/**
 * Field schemas + file-path previews for each "+ Add …" form. Each entity type
 * reuses the single EntityFormModal; the schema is all that differs. All display
 * strings come from the `forms.*` message catalog via `useEntityForm` — no UI
 * text lives in this module.
 */
import { useTranslations } from "next-intl";
import type {
  EntityFormValues,
  FieldSchema,
} from "../components/EntityFormModal/EntityFormModal";
import { MODEL_OPTIONS, THINKING_OPTIONS } from "./config";

const slugPreview = (name: string | undefined, fallback: string) =>
  (name ?? "").trim()
    ? (name as string)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    : fallback;

export type EntityKind = "skill" | "integration" | "agent" | "pipeline";

export interface EntityForm {
  title: string;
  subtitle: string;
  glyph: "spark" | "plug" | "bot" | "flow";
  submitLabel: string;
  fields: FieldSchema[];
  filePreview: (values: EntityFormValues) => string;
}

/** Build the translated form schema for an entity kind. */
export function useEntityForm(kind: EntityKind): EntityForm {
  const t = useTranslations();
  const fallbackName = t("forms.namePlaceholder");

  switch (kind) {
    case "integration":
      return {
        title: t("forms.integration.title"),
        subtitle: t("forms.integration.subtitle"),
        glyph: "plug",
        submitLabel: t("forms.integration.submitLabel"),
        fields: [
          {
            name: "name",
            label: t("forms.integration.nameLabel"),
            kind: "text",
            placeholder: t("forms.integration.namePlaceholder"),
            required: true,
          },
          {
            name: "desc",
            label: t("forms.integration.descLabel"),
            kind: "textarea",
            placeholder: t("forms.integration.descPlaceholder"),
          },
        ],
        filePreview: (v) =>
          `~/zibby/integrations/${slugPreview(v.name, fallbackName)}.json`,
      };
    case "agent":
      return {
        title: t("forms.agent.title"),
        subtitle: t("forms.agent.subtitle"),
        glyph: "bot",
        submitLabel: t("forms.agent.submitLabel"),
        fields: [
          {
            name: "name",
            label: t("forms.agent.nameLabel"),
            kind: "text",
            placeholder: t("forms.agent.namePlaceholder"),
            required: true,
          },
          {
            name: "role",
            label: t("forms.agent.roleLabel"),
            kind: "textarea",
            hint: t("forms.agent.roleHint"),
            placeholder: t("forms.agent.rolePlaceholder"),
          },
          {
            name: "model",
            label: t("forms.agent.modelLabel"),
            kind: "select",
            defaultValue: "sonnet",
            options: MODEL_OPTIONS,
          },
          {
            name: "thinking",
            label: t("forms.agent.thinkingLabel"),
            kind: "select",
            defaultValue: "medium",
            options: THINKING_OPTIONS,
          },
        ],
        filePreview: (v) =>
          `~/zibby/agents/${slugPreview(v.name, fallbackName)}.agent.md`,
      };
    case "pipeline":
      return {
        title: t("forms.pipeline.title"),
        subtitle: t("forms.pipeline.subtitle"),
        glyph: "flow",
        submitLabel: t("forms.pipeline.submitLabel"),
        fields: [
          {
            name: "name",
            label: t("forms.pipeline.nameLabel"),
            kind: "text",
            placeholder: t("forms.pipeline.namePlaceholder"),
            required: true,
          },
          {
            name: "desc",
            label: t("forms.pipeline.descLabel"),
            kind: "textarea",
            placeholder: t("forms.pipeline.descPlaceholder"),
          },
        ],
        filePreview: (v) =>
          `~/zibby/pipelines/${slugPreview(v.name, fallbackName)}.pipeline.md`,
      };
    case "skill":
    default:
      return {
        title: t("forms.skill.title"),
        subtitle: t("forms.skill.subtitle"),
        glyph: "spark",
        submitLabel: t("forms.skill.submitLabel"),
        fields: [
          {
            name: "name",
            label: t("forms.skill.nameLabel"),
            kind: "text",
            placeholder: t("forms.skill.namePlaceholder"),
            required: true,
          },
          {
            name: "desc",
            label: t("forms.skill.descLabel"),
            kind: "textarea",
            hint: t("forms.skill.descHint"),
            placeholder: t("forms.skill.descPlaceholder"),
          },
        ],
        filePreview: (v) =>
          `~/zibby/skills/${slugPreview(v.name, fallbackName)}/SKILL.md`,
      };
  }
}
