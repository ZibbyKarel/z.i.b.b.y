"use client";

import { useTranslations } from "next-intl";
import { Button, Panel, Stack, ToggleField, Typography } from "@zibby/design-system";
import {
  type OperatorChannelSettings,
  type OperatorEventKind,
  OperatorEventKindSchema,
} from "@zibby/contracts";
import {
  useOperatorChannelSettingsQuery,
  useOperatorChannelStatusQuery,
  useSetOperatorChannelSettingsMutation,
  useTestOperatorChannelMutation,
} from "../../operator-channel";
import { InfoRow } from "./InfoRow";

/** Testids for the operator-channel card (the screen + tests select via these). */
export enum OperatorChannelSectionTestId {
  Test = "operator-channel-test",
  Enabled = "operator-channel-enabled",
  Event = "operator-channel-event",
  TestResult = "operator-channel-test-result",
}

/**
 * The Slack operator channel (Phase 1): connection status, a test send (top-right),
 * the master switch and one toggle per event kind. Tokens are never entered here —
 * they go to `PUT /api/operator-channel/credentials/:kind` (see the operator-channel doc).
 */
export function OperatorChannelSection() {
  const t = useTranslations("settings");
  const { data: settings } = useOperatorChannelSettingsQuery();
  const { data: status } = useOperatorChannelStatusQuery();
  const save = useSetOperatorChannelSettingsMutation();
  const test = useTestOperatorChannelMutation();
  if (!settings) return null;

  const put = (next: OperatorChannelSettings) => {
    // dmChannelId is server-owned; the PUT body must not carry it.
    const body = { ...next };
    delete body.dmChannelId;
    save.mutate({ body });
  };
  const toggleEvent = (kind: OperatorEventKind, on: boolean) => {
    const events = on
      ? [...settings.notify.events, kind]
      : settings.notify.events.filter((k) => k !== kind);
    put({ ...settings, notify: { ...settings.notify, events } });
  };
  const result = test.data?.body;

  return (
    <Panel
      header={t("operatorChannel.title")}
      headerEnd={
        <Button
          data-testid={OperatorChannelSectionTestId.Test}
          disabled={test.isPending || !settings.enabled}
          icon="play"
          onClick={() => test.mutate({})}
          size="sm"
        >
          {t("operatorChannel.test")}
        </Button>
      }
      padding="300"
    >
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("operatorChannel.hint")}
        </Typography>

        {status && (
          <Stack gap="75">
            <InfoRow label={t("operatorChannel.mode")} value={status.mode} />
            <InfoRow
              label={t("operatorChannel.connection")}
              tone={status.connected ? "ok" : undefined}
              value={
                status.connected
                  ? (status.workspace ?? t("operatorChannel.connected"))
                  : t("operatorChannel.notConnected")
              }
            />
            <InfoRow
              label={t("operatorChannel.credentials")}
              value={`bot ${status.credentials.bot ? "✓" : "–"} · app ${status.credentials.app ? "✓" : "–"}`}
            />
            {status.lastDelivery && (
              <InfoRow
                label={t("operatorChannel.lastDelivery")}
                value={`${status.lastDelivery.kind} · ${status.lastDelivery.status}`}
              />
            )}
            {status.lastError && (
              <InfoRow label={t("operatorChannel.lastError")} value={status.lastError} />
            )}
          </Stack>
        )}

        {result && (
          <Typography
            mono
            data-testid={OperatorChannelSectionTestId.TestResult}
            size="2xs"
            type="note"
            variant="tertiary"
          >
            {result.ok ? t("operatorChannel.testOk") : t("operatorChannel.testFailed")}:{" "}
            {result.detail}
          </Typography>
        )}

        <ToggleField
          checked={settings.enabled}
          data-testid={OperatorChannelSectionTestId.Enabled}
          label={t("operatorChannel.enabled")}
          onChange={(on) => put({ ...settings, enabled: on })}
        />

        <Stack gap="100">
          <Typography size="sm" type="note" variant="secondary" weight="semibold">
            {t("operatorChannel.events")}
          </Typography>
          {OperatorEventKindSchema.options.map((kind) => (
            <ToggleField
              checked={settings.notify.events.includes(kind)}
              data-testid={`${OperatorChannelSectionTestId.Event}-${kind}`}
              disabled={!settings.enabled}
              key={kind}
              label={t(`operatorChannel.event.${kind}`)}
              onChange={(on) => toggleEvent(kind, on)}
            />
          ))}
        </Stack>
      </Stack>
    </Panel>
  );
}
