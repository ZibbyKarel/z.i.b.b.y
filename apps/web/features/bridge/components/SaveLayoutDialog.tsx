"use client";

import { Button, Dialog, Stack, TextInputField } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { layoutNameError } from "../grid/presets";

export enum SaveLayoutDialogTestId {
  Input = "save-layout-input",
  Submit = "save-layout-submit",
}

export interface SaveLayoutDialogProps {
  open: boolean;
  /** Prefilled name (the next free `MY LAYOUT NN`). */
  initialName: string;
  /** Saved layout names (for the duplicate check). */
  saved: Readonly<Record<string, unknown>>;
  onSave: (name: string) => void;
  onClose: () => void;
}

/** Name prompt for "Save as". The form is only mounted while open, so each open starts fresh. */
export function SaveLayoutDialog({ open, ...rest }: SaveLayoutDialogProps) {
  return open ? <SaveLayoutForm {...rest} /> : null;
}

function SaveLayoutForm({
  initialName,
  saved,
  onSave,
  onClose,
}: Omit<SaveLayoutDialogProps, "open">) {
  const t = useTranslations("bridge");
  const [name, setName] = useState(initialName);
  const [submitted, setSubmitted] = useState(false);
  const formId = useId();
  const tc = useTranslations("common");
  const err = layoutNameError(name, saved);

  return (
    <Dialog
      open
      actions={
        <Button
          data-testid={SaveLayoutDialogTestId.Submit}
          form={formId}
          intent="primary"
          size="sm"
          type="submit"
        >
          {t("save")}
        </Button>
      }
      closeLabel={tc("close")}
      onClose={onClose}
      title={t("saveAsTitle")}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!err) onSave(name.trim());
        }}
      >
        <Stack gap="100">
          <TextInputField
            autoFocus
            data-testid={SaveLayoutDialogTestId.Input}
            error={submitted && err ? t(`layoutNameError.${err}`) : undefined}
            label={t("layoutName")}
            onChange={(e) => {
              setName(e.target.value);
              setSubmitted(false);
            }}
            value={name}
          />
        </Stack>
      </form>
    </Dialog>
  );
}
