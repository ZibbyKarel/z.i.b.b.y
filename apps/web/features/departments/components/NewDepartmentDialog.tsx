"use client";

import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  type CreateDepartmentInput,
  CreateDepartmentInputSchema,
  type Division,
} from "@zibby/contracts";
import { Button, Dialog, type IconName, Stack, iconNames } from "@zibby/design-system";
import {
  FormSelect,
  FormTextArea,
  FormTextInput,
  useFormControls,
  zodResolver,
} from "@zibby/forms";

export enum NewDepartmentDialogTestId {
  Id = "new-department-id",
  Code = "new-department-code",
  Name = "new-department-name",
  Tagline = "new-department-tagline",
  Mandate = "new-department-mandate",
  Color = "new-department-color",
  Submit = "new-department-submit",
  Cancel = "new-department-cancel",
}

/** The form edits `tierDefault` as a string ("none" = null); mapped on submit. */
const TIERS = ["none", "ask", "deny", "allow", "notify"] as const;
const FormSchema = CreateDepartmentInputSchema.extend({ tierDefault: z.enum(TIERS) });
type FormValues = z.infer<typeof FormSchema>;

export interface NewDepartmentDialogProps {
  divisions: readonly Division[];
  onClose: () => void;
  /** Persist the parsed department; the caller owns the mutation. */
  onCreate: (input: CreateDepartmentInput) => void;
  pending?: boolean;
}

/**
 * The CREATE-ONLY department dialog (D-022) — departments are data now, so the
 * operator can add one. Fields mirror the contract; `tierDefault` "none" maps to
 * `null`.
 */
export function NewDepartmentDialog({
  divisions,
  onClose,
  onCreate,
  pending,
}: NewDepartmentDialogProps) {
  const t = useTranslations("departments.create");
  const tc = useTranslations("common");
  const { renderForm, submit } = useFormControls<FormValues>({
    defaultValues: {
      id: "",
      code: "",
      name: "",
      tagline: "",
      mandate: "",
      color: "#5b8def",
      division: divisions[0]?.id ?? "",
      icon: "grid",
      fallback: "primary",
      tierDefault: "none",
    },
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    onSubmit: ({ tierDefault, ...values }) => {
      if (pending) return;
      onCreate({ ...values, tierDefault: tierDefault === "none" ? null : tierDefault });
    },
  });

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button data-testid={NewDepartmentDialogTestId.Cancel} intent="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            data-testid={NewDepartmentDialogTestId.Submit}
            icon="plus"
            intent="primary"
            loading={pending}
            onClick={() => void submit()}
          >
            {t("submit")}
          </Button>
        </>
      }
      ariaLabel={t("title")}
      closeLabel={tc("close")}
      description={t("subtitle")}
      onClose={onClose}
      title={t("title")}
      width="2xl"
    >
      <Stack gap="150">
        <FormTextInput<FormValues>
          data-testid={NewDepartmentDialogTestId.Id}
          hint={t("idHint")}
          label={t("idLabel")}
          name="id"
        />
        <Stack direction="row" gap="150">
          <FormTextInput<FormValues>
            data-testid={NewDepartmentDialogTestId.Code}
            label={t("codeLabel")}
            name="code"
          />
          <FormTextInput<FormValues>
            data-testid={NewDepartmentDialogTestId.Name}
            label={t("nameLabel")}
            name="name"
          />
        </Stack>
        <FormTextInput<FormValues>
          data-testid={NewDepartmentDialogTestId.Tagline}
          label={t("taglineLabel")}
          name="tagline"
        />
        <FormTextArea<FormValues>
          data-testid={NewDepartmentDialogTestId.Mandate}
          label={t("mandateLabel")}
          name="mandate"
        />
        <Stack direction="row" gap="150">
          <FormTextInput<FormValues>
            data-testid={NewDepartmentDialogTestId.Color}
            hint={t("colorHint")}
            label={t("colorLabel")}
            name="color"
          />
          <FormSelect<string, FormValues>
            label={t("divisionLabel")}
            name="division"
            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Stack>
        <Stack direction="row" gap="150">
          <FormSelect<string, FormValues>
            label={t("iconLabel")}
            name="icon"
            options={(iconNames as readonly IconName[]).map((n) => ({ value: n, label: n }))}
          />
          <FormSelect<string, FormValues>
            label={t("fallbackLabel")}
            name="fallback"
            options={[
              { value: "primary", label: t("fallbackPrimary") },
              { value: "orchestrator", label: t("fallbackOrchestrator") },
            ]}
          />
          <FormSelect<string, FormValues>
            label={t("tierLabel")}
            name="tierDefault"
            options={TIERS.map((v) => ({ value: v, label: t(`tier.${v}`) }))}
          />
        </Stack>
      </Stack>
    </Dialog>,
  );
}
