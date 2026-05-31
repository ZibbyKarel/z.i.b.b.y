/**
 * Field schemas + file-path previews for each "+ Přidat …" form. Each entity
 * type reuses the single EntityFormModal; the schema is all that differs.
 */
import type { EntityFormValues, FieldSchema } from "@zibby/design-system"
import { CONTEXT_OPTIONS, MODEL_OPTIONS, THINKING_OPTIONS } from "./config"

const slugPreview = (name: string | undefined, fallback = "<název>") =>
  (name ?? "").trim()
    ? (name as string)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    : fallback

const contextField: FieldSchema = {
  name: "ctx",
  label: "Kontext",
  kind: "segmented",
  defaultValue: "home",
  options: CONTEXT_OPTIONS,
}

export interface EntityForm {
  title: string
  subtitle: string
  glyph: "spark" | "plug" | "bot" | "flow"
  submitLabel: string
  fields: FieldSchema[]
  filePreview: (values: EntityFormValues) => string
}

export const SKILL_FORM: EntityForm = {
  title: "Nový skill",
  subtitle: "vytvoří SKILL.md na disku",
  glyph: "spark",
  submitLabel: "Vytvořit skill",
  fields: [
    { name: "name", label: "Název skillu", kind: "text", placeholder: "např. rohlik", required: true },
    { name: "desc", label: "Popis", kind: "textarea", hint: "uloží se jako description v SKILL.md", placeholder: "Co skill dělá…" },
    contextField,
  ],
  filePreview: (v) => `~/zibby/skills/${slugPreview(v.name)}/SKILL.md`,
}

export const INTEGRATION_FORM: EntityForm = {
  title: "Nová integrace",
  subtitle: "vytvoří config soubor · secrets žijí v .env, ne tady",
  glyph: "plug",
  submitLabel: "Vytvořit integraci",
  fields: [
    { name: "name", label: "Název integrace", kind: "text", placeholder: "např. GitHub", required: true },
    { name: "desc", label: "Popis", kind: "textarea", placeholder: "Co systém touhle integrací osahá…" },
    contextField,
  ],
  filePreview: (v) => `~/zibby/integrations/${slugPreview(v.name)}.json`,
}

export const AGENT_FORM: EntityForm = {
  title: "Nový agent",
  subtitle: "vytvoří .agent.md s definicí (model, thinking, nástroje)",
  glyph: "bot",
  submitLabel: "Vytvořit agenta",
  fields: [
    { name: "name", label: "Název agenta", kind: "text", placeholder: "např. Reviewer", required: true },
    { name: "role", label: "Role", kind: "textarea", hint: "co agent dělá", placeholder: "Pre-review diffu před push…" },
    { name: "model", label: "Model", kind: "select", defaultValue: "sonnet", options: MODEL_OPTIONS },
    { name: "thinking", label: "Thinking", kind: "select", defaultValue: "medium", options: THINKING_OPTIONS },
    contextField,
  ],
  filePreview: (v) => `~/zibby/agents/${slugPreview(v.name)}.agent.md`,
}

export const PIPELINE_FORM: EntityForm = {
  title: "Nová pipeline",
  subtitle: "vytvoří .pipeline.md · fáze doplníš v editoru",
  glyph: "flow",
  submitLabel: "Vytvořit pipeline",
  fields: [
    { name: "name", label: "Název pipeline", kind: "text", placeholder: "např. Build Feature", required: true },
    { name: "desc", label: "Popis", kind: "textarea", placeholder: "Co pipeline dělá…" },
    { name: "budget", label: "Rozpočet (strop $)", kind: "segmented", defaultValue: "25", options: [
      { value: "10", label: "$10" },
      { value: "25", label: "$25" },
      { value: "50", label: "$50" },
    ] },
    contextField,
  ],
  filePreview: (v) => `~/zibby/pipelines/${slugPreview(v.name)}.pipeline.md`,
}
