"use client";

import type { HandoffSignalKind, SubsystemId } from "@zibby/contracts";
import { Button, Stack, Typography } from "@zibby/design-system";
import {
  FormSelect,
  FormTextArea,
  FormTextInput,
  FormToggle,
  useFormControls,
  zodResolver,
} from "@zibby/forms";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { toastBus } from "../../../components/Toaster/toastBus";
import { useCreateSignalKindMutation, useUpdateSignalKindMutation } from "../../handoff/mutations";
import { useSubsystemsQuery } from "../../subsystems/queries";

export enum SignalCreateFormTestId {
  Root = "signal-create-form-root",
  Producer = "signal-create-form-producer",
  Label = "signal-create-form-label",
  Description = "signal-create-form-description",
  SeverityBearing = "signal-create-form-severity-bearing",
  SlugPreview = "signal-create-form-slug-preview",
  Submit = "signal-create-form-submit",
  Cancel = "signal-create-form-cancel",
}

const schema = z.object({
  from: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  severityBearing: z.boolean(),
});

type SignalCreateValues = z.infer<typeof schema>;

export interface SignalCreateFormProps {
  /** Prefills the producer picker — the drawer's "+ nový signál" link-out passes
   * its own `fromSubsystemId` through `/signals/new?from=`. */
  defaultFrom?: string;
  /**
   * When present, the form runs in EDIT mode (B3c): all fields prefill from this
   * kind, submit calls `useUpdateSignalKindMutation` with `params: { id: initial.id }`
   * instead of creating, and success calls `onDone` instead of navigating. Only ever
   * passed an operator kind (`!initial.system`) — `SignalDetailScreen` never offers
   * edit for a built-in.
   */
  initial?: HandoffSignalKind;
  /** EDIT mode's success callback (the detail screen toggles back to read-only). Ignored in create mode. */
  onDone?: () => void;
}

/**
 * Approximate the server's `uniqueSlug` (`handoff-signal-kind.store.ts`) for a
 * read-only preview — the server is authoritative and disambiguates a collision
 * with a numeric suffix, which this preview cannot know about.
 */
export function previewSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "signal"
  );
}

/**
 * `/signals/new` — the guided signal-kind creator (B3b design doc,
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`
 * §"Slot B → B3"). Mirrors `ProjectBasicsPanel`'s `@zibby/forms` shape
 * (`useFormControls` + `zodResolver` + DS `Form*` field wrappers). On success
 * navigates to `/signals` — the spawned Forge build task surfaces there via the
 * runs-feed invalidation in {@link useCreateSignalKindMutation}.
 *
 * B3c generalizes this same form for EDIT: passing `initial` (an operator kind)
 * prefills every field, runs {@link useUpdateSignalKindMutation} keyed by
 * `initial.id` instead of creating, and success calls `onDone` instead of
 * navigating — `SignalDetailScreen` renders it inline in place of the read
 * panels. The slug preview is only meaningful pre-creation, so edit mode shows
 * the fixed `initial.id` instead of the derived `previewSlug`.
 */
export function SignalCreateForm({ defaultFrom, initial, onDone }: SignalCreateFormProps) {
  const t = useTranslations("signals");
  const router = useRouter();
  const { data: subsystems = [] } = useSubsystemsQuery();
  const createMutation = useCreateSignalKindMutation();
  const updateMutation = useUpdateSignalKindMutation();
  const isEditMode = Boolean(initial);
  const activeMutation = isEditMode ? updateMutation : createMutation;

  const { renderForm, submit, form } = useFormControls<SignalCreateValues>({
    defaultValues: {
      from: initial?.from ?? defaultFrom ?? subsystems[0]?.id ?? "",
      label: initial?.label ?? "",
      description: initial?.description ?? "",
      severityBearing: initial?.severityBearing ?? false,
    },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      if (activeMutation.isPending) return;
      const body = {
        from: values.from as SubsystemId,
        label: values.label.trim(),
        description: values.description.trim(),
        severityBearing: values.severityBearing,
      };

      if (initial) {
        updateMutation.mutate(
          { params: { id: initial.id }, body },
          {
            onSuccess: () => {
              toastBus.emit({ message: t("create.editSuccessToast"), severity: "ok" });
              onDone?.();
            },
          },
        );
        return;
      }

      createMutation.mutate(
        { body },
        {
          onSuccess: (result) => {
            toastBus.emit({
              message: t("create.successToast", { buildTaskId: result.body.buildTaskId }),
              severity: "ok",
            });
            router.push("/signals");
          },
        },
      );
    },
  });

  const labelValue = form.watch("label");
  const descriptionValue = form.watch("description");
  // Mirrors `AddCommandModal`'s guard — `formState.isValid` isn't reliably
  // populated before the form's first interaction, so an explicit
  // non-empty check on the two required text fields backs it up.
  const canSubmit =
    form.formState.isValid &&
    labelValue.trim().length > 0 &&
    descriptionValue.trim().length > 0 &&
    !activeMutation.isPending;

  return renderForm(
    <div data-testid={SignalCreateFormTestId.Root}>
      <HudPanel
        action={
          <Stack direction="row" gap="100">
            <Button
              data-testid={SignalCreateFormTestId.Cancel}
              intent="ghost"
              onClick={() => (isEditMode ? onDone?.() : router.back())}
              size="sm"
            >
              {t("create.cancel")}
            </Button>
            <Button
              data-testid={SignalCreateFormTestId.Submit}
              disabled={!canSubmit}
              icon={isEditMode ? "check" : "plus"}
              intent="primary"
              onClick={() => void submit()}
              size="sm"
            >
              {isEditMode ? t("create.editSubmit") : t("create.submit")}
            </Button>
          </Stack>
        }
        title={isEditMode ? t("create.editPanelTitle") : t("create.panelTitle")}
      >
        <Stack gap="200">
          {activeMutation.isError && (
            <Typography size="sm" tone="bad" type="note">
              {isEditMode ? t("create.editError") : t("create.error")}
            </Typography>
          )}

          <div data-testid={SignalCreateFormTestId.Producer}>
            <FormSelect<string, SignalCreateValues>
              label={t("create.fields.producer")}
              name="from"
              options={subsystems.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>

          <div data-testid={SignalCreateFormTestId.Label}>
            <FormTextInput<SignalCreateValues>
              autoFocus
              label={t("create.fields.label")}
              name="label"
              placeholder={t("create.fields.labelPlaceholder")}
            />
          </div>

          <div data-testid={SignalCreateFormTestId.Description}>
            <FormTextArea<SignalCreateValues>
              hint={t("create.fields.descriptionHint")}
              label={t("create.fields.description")}
              name="description"
              placeholder={t("create.fields.descriptionPlaceholder")}
              rows={3}
            />
          </div>

          <div data-testid={SignalCreateFormTestId.SeverityBearing}>
            <FormToggle<SignalCreateValues>
              hint={t("create.fields.severityBearingHint")}
              label={t("create.fields.severityBearing")}
              name="severityBearing"
            />
          </div>

          <Stack gap="75">
            <Typography mono size="sm" type="note" variant="secondary">
              {isEditMode ? t("create.idFixedLabel") : t("create.fields.slugPreviewLabel")}
            </Typography>
            <Typography mono data-testid={SignalCreateFormTestId.SlugPreview} size="sm" type="text">
              {isEditMode ? (initial?.id ?? "") : previewSlug(labelValue ?? "")}
            </Typography>
          </Stack>
        </Stack>
      </HudPanel>
    </div>,
  );
}
