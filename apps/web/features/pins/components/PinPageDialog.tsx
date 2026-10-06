"use client";

import { z } from "zod";
import { useTranslations } from "next-intl";
import { Button, Dialog } from "@zibby/design-system";
import { FormTextInput, useFormControls, zodResolver } from "@zibby/forms";
import { defaultPinLabelFor } from "../defaultPinLabelFor";
import { usePagePins } from "../usePagePins";

export enum PinPageDialogTestId {
  Name = "pin-page-dialog-name",
  Submit = "pin-page-dialog-submit",
  Cancel = "pin-page-dialog-cancel",
}

// Mirrors `PagePinSchema`'s own `label` constraint (trimmed, 1..80) — kept as
// its own schema (not an import of the contract's label field in isolation)
// since the form only ever edits this one field.
const FormSchema = z.object({ label: z.string().trim().min(1).max(80) });
type FormValues = z.infer<typeof FormSchema>;

export interface PinPageDialogProps {
  /** The page href being pinned (`pinHrefFor`'s identity — pathname + search,
   *  minus the transient `?approval=` param). */
  href: string;
  /** Prefilled name — the entity name/crumb when the caller has one
   *  (`SubnavPinButton`); omit to fall back to a humanized path segment. */
  defaultName?: string;
  onClose: () => void;
}

/**
 * The one-field "Name" dialog every pin flow confirms through (spec decision
 * 1): the ⋮ menu's PIN PAGE action and the subnav `+ PIN` button both open
 * this, prefilled with a sensible default, before the pin actually lands in
 * the sidebar. Enter submits (native form behaviour); Cancel/✕ just close.
 */
export function PinPageDialog({ href, defaultName, onClose }: PinPageDialogProps) {
  const t = useTranslations("pins.dialog");
  const tc = useTranslations("common");
  const { pinPage, isPending } = usePagePins();
  const { renderForm, submit } = useFormControls<FormValues>({
    defaultValues: { label: defaultName ?? defaultPinLabelFor(href) },
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    onSubmit: ({ label }) => {
      if (isPending) return;
      pinPage(href, label);
      onClose();
    },
  });

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button data-testid={PinPageDialogTestId.Cancel} intent="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            data-testid={PinPageDialogTestId.Submit}
            icon="pin"
            intent="primary"
            loading={isPending}
            onClick={() => void submit()}
          >
            {t("submit")}
          </Button>
        </>
      }
      ariaLabel={t("title")}
      closeLabel={tc("close")}
      onClose={onClose}
      title={t("title")}
      width="sm"
    >
      <FormTextInput<FormValues>
        autoFocus
        data-testid={PinPageDialogTestId.Name}
        label={t("nameLabel")}
        name="label"
      />
    </Dialog>,
  );
}
