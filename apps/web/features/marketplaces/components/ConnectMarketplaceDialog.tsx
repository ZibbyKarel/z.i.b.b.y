"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog, Stack, TextInputField, ToggleField } from "@zibby/design-system";
import { apiErrorMessage } from "../../../state/apiErrorMessage";
import { useAddMarketplaceMutation } from "../mutations";

export enum ConnectMarketplaceDialogTestId {
  Source = "connect-marketplace-source",
  DevMode = "connect-marketplace-dev-mode",
  Submit = "connect-marketplace-submit",
  Error = "connect-marketplace-error",
}

export interface ConnectMarketplaceDialogProps {
  onClose: () => void;
  /** Fired with the new marketplace id once it is connected. */
  onConnected: (id: string) => void;
}

/** Create dialog: connect a marketplace by source, optionally in dev mode. */
export function ConnectMarketplaceDialog({ onClose, onConnected }: ConnectMarketplaceDialogProps) {
  const t = useTranslations("marketplaces");
  const tc = useTranslations("common");
  const add = useAddMarketplaceMutation();
  const [source, setSource] = useState("");
  const [devMode, setDevMode] = useState(false);

  const connect = () =>
    add.mutate(
      { body: { source: source.trim(), devMode } },
      {
        onSuccess: (res) => {
          if (res.status === 201) onConnected(res.body.id);
        },
      },
    );

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            data-testid={ConnectMarketplaceDialogTestId.Submit}
            disabled={!source.trim()}
            icon="plus"
            intent="primary"
            loading={add.isPending}
            onClick={connect}
          >
            {t("connectAction")}
          </Button>
        </>
      }
      ariaLabel={t("connectTitle")}
      closeLabel={tc("close")}
      onClose={onClose}
      title={t("connectTitle")}
      width="md"
    >
      <Stack gap="150">
        <TextInputField
          data-testid={ConnectMarketplaceDialogTestId.Source}
          label={t("sourceLabel")}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t("sourcePlaceholder")}
          value={source}
        />
        <ToggleField
          checked={devMode}
          data-testid={ConnectMarketplaceDialogTestId.DevMode}
          hint={t("devModeHint")}
          label={t("devModeLabel")}
          onChange={setDevMode}
        />
        {add.isError && (
          <Alert data-testid={ConnectMarketplaceDialogTestId.Error} severity="error">
            {apiErrorMessage(add.error) ?? t("connectFailed")}
          </Alert>
        )}
      </Stack>
    </Dialog>
  );
}
