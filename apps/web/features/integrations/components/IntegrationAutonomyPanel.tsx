"use client";

import { useTranslations } from "next-intl";
import type { Mandate } from "@zibby/contracts";
import { Stack, Toggle, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useSetMandateMutation } from "../../settings/mutations";
import { useMandateQuery } from "../../settings/queries";

type MandateKey = "dispatch" | "reply";

/** Testids for the per-integration autonomy toggles (screens + tests select via these). */
export enum IntegrationAutonomyTestId {
  Dispatch = "integration-autonomy-dispatch",
  Reply = "integration-autonomy-reply",
}

export interface IntegrationAutonomyPanelProps {
  /** The integration whose per-channel mandate override this panel edits. */
  integrationId: string;
}

/**
 * Per-integration autonomy on the integration detail page — the same
 * `mandate.channels[id]` the global Settings → Mandate editor writes, surfaced
 * where the operator configures this one channel. Puls listens to every
 * integration regardless (structural); these two toggles are the autonomy
 * levers: `dispatch` (act on inbound, Tier 1) and `reply` (auto-reply, Tier 2 —
 * the reply-enabled set is what herald's roster derives from). A channel with no
 * override follows `mandate.defaults`; flipping a toggle writes an explicit one.
 */
export function IntegrationAutonomyPanel({ integrationId }: IntegrationAutonomyPanelProps) {
  const t = useTranslations();
  const { data: mandate } = useMandateQuery();
  const setMandate = useSetMandateMutation();

  if (!mandate) return null;

  const effective = (key: MandateKey): boolean =>
    mandate.channels[integrationId]?.[key] ?? mandate.defaults[key];

  const setChannel = (key: MandateKey, value: boolean) => {
    const next: Mandate = {
      ...mandate,
      channels: {
        ...mandate.channels,
        [integrationId]: { ...mandate.channels[integrationId], [key]: value },
      },
    };
    setMandate.mutate({ body: next });
  };

  return (
    <HudPanel surface="glass" title={t("integrations.autonomyPanel")}>
      <Stack gap="150">
        <Typography leading="snug" size="xs" type="note" variant="tertiary">
          {t("integrations.autonomyHint")}
        </Typography>
        <Toggle
          checked={effective("dispatch")}
          data-testid={IntegrationAutonomyTestId.Dispatch}
          disabled={setMandate.isPending}
          label={t("integrations.autonomyDispatch")}
          onChange={(v) => setChannel("dispatch", v)}
        />
        <Toggle
          checked={effective("reply")}
          data-testid={IntegrationAutonomyTestId.Reply}
          disabled={setMandate.isPending}
          label={t("integrations.autonomyReply")}
          onChange={(v) => setChannel("reply", v)}
        />
      </Stack>
    </HudPanel>
  );
}
