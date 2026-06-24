import { SelectField, Stack, TextInputField } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { FileDest, OutputType } from "../hooks/useTaskOutput";

export interface TaskOutputFieldProps {
  outputType: OutputType;
  onOutputTypeChange: (type: OutputType) => void;
  fileDest: FileDest;
  onFileDestChange: (dest: FileDest) => void;
  fileTo: string;
  onFileToChange: (to: string) => void;
}

/**
 * The terminal-output selector for a single dispatch: inherit / PR / file / void. The
 * "write to a file" choice reveals a destination (project vs vault) and a filename;
 * the filename is required (the submit guard blocks until it's filled).
 */
export function TaskOutputField({
  outputType,
  onOutputTypeChange,
  fileDest,
  onFileDestChange,
  fileTo,
  onFileToChange,
}: TaskOutputFieldProps) {
  const t = useTranslations("tasks.output");
  return (
    <Stack gap="100">
      <SelectField
        hint={t("hint")}
        label={t("label")}
        onValueChange={(v) => onOutputTypeChange(v as OutputType)}
        options={[
          { value: "", label: t("auto") },
          { value: "pr", label: t("pr") },
          { value: "file", label: t("file") },
          { value: "void", label: t("void") },
        ]}
        value={outputType}
      />
      {outputType === "file" && (
        <>
          <SelectField
            label={t("destLabel")}
            onValueChange={(v) => onFileDestChange(v as FileDest)}
            options={[
              { value: "project", label: t("destProject") },
              { value: "vault", label: t("destVault") },
            ]}
            value={fileDest}
          />
          <TextInputField
            label={t("toLabel")}
            onChange={(e) => onFileToChange(e.target.value)}
            placeholder={t("toPlaceholder")}
            value={fileTo}
          />
        </>
      )}
    </Stack>
  );
}
