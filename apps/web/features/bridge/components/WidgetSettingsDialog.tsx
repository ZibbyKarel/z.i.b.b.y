"use client";

import {
  Button,
  ConfirmDeleteButton,
  Dialog,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { BridgeWidget } from "../grid/layout";
import { WIDGETS } from "../widgets/registry";
import { compactPick } from "../widgets/widgetFilters";

export enum WidgetSettingsDialogTestId {
  Name = "widget-settings-name",
  Cancel = "widget-settings-cancel",
  Save = "widget-settings-save",
}

export interface WidgetSettingsDialogProps {
  widget: BridgeWidget;
  /** Save the edited widget into the layout. */
  onSave: (next: BridgeWidget) => void;
  /** Remove the widget from the dashboard. */
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Settings of one board widget: its name (empty = the type's default label) and removal, plus
 * the type's default filters (its `Filters` controls) and its own `Settings` section. Edits stay a
 * local draft until Save.
 */
export function WidgetSettingsDialog({
  widget,
  onSave,
  onRemove,
  onClose,
}: WidgetSettingsDialogProps) {
  const t = useTranslations("bridge.settings");
  const tr = useTranslations();
  const tc = useTranslations("common");
  const def = WIDGETS[widget.type];
  const [draft, setDraft] = useState(widget);
  const [name, setName] = useState(widget.title ?? "");

  const save = () => {
    const title = name.trim() || undefined;
    onSave({ ...draft, title });
    onClose();
  };

  return (
    <Dialog
      open
      actions={
        <>
          <Button data-testid={WidgetSettingsDialogTestId.Cancel} intent="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button data-testid={WidgetSettingsDialogTestId.Save} intent="primary" onClick={save}>
            {tc("save")}
          </Button>
        </>
      }
      closeLabel={tc("close")}
      onClose={onClose}
      title={t("title")}
      width="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Stack gap="150">
          <TextInputField
            data-testid={WidgetSettingsDialogTestId.Name}
            label={t("name")}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr(def.labelKey)}
            value={name}
          />
          {def.Filters ? (
            <Stack gap="75">
              <Typography size="sm" type="note" variant="secondary">
                {t("filters")}
              </Typography>
              <Stack wrap direction="row" gap="100">
                <def.Filters
                  onChange={(next) => {
                    const filters = compactPick(next);
                    setDraft({
                      ...draft,
                      filters: Object.keys(filters).length > 0 ? filters : undefined,
                    });
                  }}
                  pick={draft.filters ?? {}}
                />
              </Stack>
            </Stack>
          ) : null}
          {def.Settings ? <def.Settings draft={draft} onChange={setDraft} /> : null}
          <ConfirmDeleteButton
            confirmLabel={t("removeConfirm")}
            label={t("remove")}
            onConfirm={() => {
              onRemove();
              onClose();
            }}
          />
        </Stack>
      </form>
    </Dialog>
  );
}
