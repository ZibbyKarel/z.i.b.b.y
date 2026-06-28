"use client";

// TODO: split this file into correct module

/**
 * Field schemas + file-path previews for each "+ Add …" form. Each entity type
 * reuses the single EntityFormModal; the schema is all that differs. All display
 * strings come from the `forms.*` message catalog via `useEntityForm` — no UI
 * text lives in this module.
 */
import { useTranslations } from "next-intl";
import type { EntityFormValues, FieldSchema } from "../components/EntityFormModal/EntityFormModal";
import { MODEL_OPTIONS, THINKING_OPTIONS } from "./config";
import { slug } from "../utils/slug";

/**
 * Preview the filesystem id a "+ Add …" form will produce. Delegates to the
 * shared {@link slug} so the preview matches the id the API actually persists
 * (including diacritic stripping, e.g. "Nový" → "novy").
 */
const slugPreview = (name: string | undefined, fallback: string) => slug(name ?? "", fallback);

export type EntityKind = "skill" | "agent";

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
        filePreview: (v) => `~/zibby/agents/${slugPreview(v.name, fallbackName)}.agent.md`,
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
        filePreview: (v) => `~/zibby/skills/${slugPreview(v.name, fallbackName)}/SKILL.md`,
      };
  }
}
