"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Dialog, Stack, TextInputField, Typography } from "@zibby/design-system";
import { toastBus } from "../../../components/Toaster/toastBus";
import { useImportMutation } from "../mutations";

export enum ImportDialogTestId {
  Root = "import-dialog",
  SourcePath = "import-dialog-source-path",
  DistillNow = "import-dialog-distill-now",
  Submit = "import-dialog-submit",
}

export interface ImportDialogProps {
  onClose: () => void;
}

/**
 * Phase 112c — bulk-import external `.md`/`.txt` files into the halda queue
 * (`POST /api/memory/import`). ZIBBY is self-hosted/single-operator, so the
 * source lives on the same machine: the operator supplies a server-side folder
 * path (no browser upload) and chooses whether to distill it immediately
 * (a detached background run) or leave the queue for the nightly
 * `memory-distill` cron. On success the dialog closes and a toast reports how
 * many files were staged/skipped, with copy that reflects the chosen timing.
 */
export function ImportDialog({ onClose }: ImportDialogProps) {
  const t = useTranslations("memory");
  const tk = useTranslations();

  const importMut = useImportMutation();

  const [sourcePath, setSourcePath] = useState("");
  const [distillNow, setDistillNow] = useState(false);

  const canSubmit = sourcePath.trim().length > 0;

  const submit = () => {
    const path = sourcePath.trim();
    importMut.mutate(
      { body: { sourcePath: path, distillNow } },
      {
        onSuccess: (result) => {
          const { staged, skipped } = result.body;
          toastBus.emit({
            message: t(distillNow ? "import.toastNow" : "import.toastLater", { staged, skipped }),
            severity: "ok",
          });
          onClose();
        },
      },
    );
  };

  const actions = (
    <Stack align="center" direction="row" gap="100" justify="end">
      <Button intent="ghost" onClick={onClose}>
        {tk("common.cancel")}
      </Button>
      <Button
        data-testid={ImportDialogTestId.Submit}
        disabled={!canSubmit}
        icon="file"
        loading={importMut.isPending}
        onClick={submit}
      >
        {t("import.submit")}
      </Button>
    </Stack>
  );

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={t("import.title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={t("import.title")}
      width="lg"
    >
      <Stack data-testid={ImportDialogTestId.Root} gap="200">
        <TextInputField
          autoFocus
          data-testid={ImportDialogTestId.SourcePath}
          hint={t("import.sourcePathHint")}
          label={t("import.sourcePathLabel")}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder={t("import.sourcePathPlaceholder")}
          value={sourcePath}
        />

        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("import.distillNowLabel")}
          </Typography>
          <Checkbox
            checked={distillNow}
            data-testid={ImportDialogTestId.DistillNow}
            label={t("import.distillNowLabel")}
            onChange={setDistillNow}
          />
        </Stack>
      </Stack>
    </Dialog>
  );
}
