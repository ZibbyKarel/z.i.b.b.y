"use client";
import { Button, SelectField, Stack, TextInputField } from "@zibby/design-system";
import type { WorkflowOutput } from "@zibby/contracts";
import { useTranslations } from "next-intl";

export interface OutputsEditorProps {
  outputs: WorkflowOutput[];
  onChange: (outputs: WorkflowOutput[]) => void;
  /** Artifact names the phases produce — the choices for a `pr`/`file` source. */
  produces: string[];
}

type OutputType = WorkflowOutput["type"];

/** Run-relative folder: not absolute, no `..` segment (mirrors the contract). */
const folderFromOk = (v: string) =>
  v.length > 0 && !v.startsWith("/") && !v.split(/[\\/]/).includes("..");
const folderToOk = (v: string) => v.startsWith("/") || v.startsWith("~/");

/** Client-side mirror of the contract's per-sink rules; true when every sink is saveable. */
export function outputsValid(outputs: WorkflowOutput[]): boolean {
  return outputs.every((o) =>
    o.type === "folder"
      ? folderFromOk(o.from) && folderToOk(o.to)
      : o.type === "file"
        ? o.from.length > 0 && o.to.length > 0
        : o.from.length > 0,
  );
}

/** Switching type keeps `from` where it still means something and resets the rest. */
function retype(o: WorkflowOutput, type: OutputType, produces: string[]): WorkflowOutput {
  const artifact = o.type === "folder" ? (produces[0] ?? "") : o.from;
  if (type === "folder") return { type, from: o.type === "folder" ? o.from : "book", to: "" };
  if (type === "file")
    return { type, from: artifact, dest: o.type === "file" ? o.dest : "project", to: "" };
  return { type, from: artifact };
}

/** Editable list of a workflow's delivery sinks (pr / file / folder). */
export function OutputsEditor({ outputs, onChange, produces }: OutputsEditorProps) {
  const t = useTranslations("workflows");
  const set = (i: number, next: WorkflowOutput) =>
    onChange(outputs.map((o, j) => (j === i ? next : o)));
  const fromOptions = (cur: string) =>
    [...new Set([...produces, cur].filter(Boolean))].map((v) => ({ value: v, label: v }));

  return (
    <Stack data-testid="outputs-editor" gap="150">
      {outputs.map((o, i) => (
        <Stack wrap align="end" data-testid={`output-row-${i}`} direction="row" gap="100" key={i}>
          <SelectField<OutputType>
            label={t("outputType")}
            onValueChange={(type) => set(i, retype(o, type, produces))}
            options={(["pr", "file", "folder"] as const).map((v) => ({
              value: v,
              label: t(`outputTypeOption.${v}`),
            }))}
            value={o.type}
          />
          {o.type === "folder" ? (
            <TextInputField
              data-testid={`output-from-${i}`}
              error={folderFromOk(o.from) ? undefined : t("outputFolderFromError")}
              label={t("outputFolderFrom")}
              onChange={(e) => set(i, { ...o, from: e.target.value })}
              placeholder="book"
              value={o.from}
            />
          ) : (
            <SelectField
              label={t("outputFrom")}
              onValueChange={(from) => set(i, { ...o, from })}
              options={fromOptions(o.from)}
              value={o.from}
            />
          )}
          {o.type === "file" && (
            <SelectField<"project" | "vault">
              label={t("outputDest")}
              onValueChange={(dest) => set(i, { ...o, dest })}
              options={(["project", "vault"] as const).map((v) => ({
                value: v,
                label: t(`outputDestOption.${v}`),
              }))}
              value={o.dest}
            />
          )}
          {o.type !== "pr" && (
            <TextInputField
              data-testid={`output-to-${i}`}
              error={
                o.type === "folder" && o.to && !folderToOk(o.to)
                  ? t("outputFolderToError")
                  : undefined
              }
              label={t("outputTo")}
              onChange={(e) => set(i, { ...o, to: e.target.value })}
              placeholder={o.type === "folder" ? "~/Workspace/…" : undefined}
              value={o.to}
            />
          )}
          <Button
            data-testid={`output-remove-${i}`}
            icon="x"
            intent="ghost"
            onClick={() => onChange(outputs.filter((_, j) => j !== i))}
            size="sm"
          >
            {t("outputRemove")}
          </Button>
        </Stack>
      ))}
      <Stack align="start">
        <Button
          data-testid="output-add"
          icon="plus"
          intent="ghost"
          onClick={() => onChange([...outputs, { type: "folder", from: "book", to: "" }])}
          size="sm"
        >
          {t("outputAdd")}
        </Button>
      </Stack>
    </Stack>
  );
}
