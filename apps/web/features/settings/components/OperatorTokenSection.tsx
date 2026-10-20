"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Panel, Stack, TextInputField, Typography } from "@zibby/design-system";
import { readOperatorToken, writeOperatorToken } from "../../../state/operatorToken";

export enum OperatorTokenSectionTestId {
  Input = "operator-token-input",
  Save = "operator-token-save",
  Status = "operator-token-status",
}

export interface OperatorTokenSectionProps {
  /** Called after the token is persisted (optional). */
  onSaved?: () => void;
}

/**
 * Lets the operator paste the API's operator token (env `ZIBBY_OPERATOR_TOKEN` or
 * `~/.config/zibby/operator-token`). It is stored in this browser's localStorage and sent
 * on approval decisions; without it approve/reject/revise/answer get a 401.
 */
export function OperatorTokenSection({ onSaved }: OperatorTokenSectionProps) {
  const t = useTranslations("settings");
  const [value, setValue] = useState(readOperatorToken);
  const [saved, setSaved] = useState(() => readOperatorToken() !== "");

  const save = () => {
    writeOperatorToken(value);
    setValue(value.trim());
    setSaved(readOperatorToken() !== "");
    onSaved?.();
  };

  return (
    <Panel header={t("operatorToken")} padding="300">
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("operatorTokenHint")}
        </Typography>
        <TextInputField
          hideLabel
          autoComplete="off"
          data-testid={OperatorTokenSectionTestId.Input}
          label={t("operatorToken")}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          value={value}
        />
        <Button data-testid={OperatorTokenSectionTestId.Save} intent="primary" onClick={save}>
          {t("operatorTokenSave")}
        </Button>
        <Typography
          data-testid={OperatorTokenSectionTestId.Status}
          size="sm"
          tone={saved ? undefined : "bad"}
          type="text"
        >
          {saved ? t("operatorTokenSaved") : t("operatorTokenMissing")}
        </Typography>
      </Stack>
    </Panel>
  );
}
