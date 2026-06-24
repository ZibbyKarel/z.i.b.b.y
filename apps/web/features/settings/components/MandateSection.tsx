"use client";

import type { Mandate } from "@zibby/contracts";
import { Divider, Stack, Toggle, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useIntegrationsQuery } from "../../integrations";
import { useSetMandateMutation } from "../mutations";
import { useMandateQuery } from "../queries";

type MandateKey = "dispatch" | "reply";

/**
 * The autonomy mandate editor (Phase 5.3): a defaults row plus a per-integration
 * row of dispatch/reply toggles. Conservative by default (dispatch on, reply off);
 * flipping a per-channel toggle writes an explicit override. Each toggle PUTs the
 * whole mandate (the document is small and operator-owned).
 */
export function MandateSection() {
  const t = useTranslations("settings");
  const { data: mandate } = useMandateQuery();
  const { data: integrations = [] } = useIntegrationsQuery();
  const setMandate = useSetMandateMutation();

  if (!mandate) return null;

  const effective = (integrationId: string | null, key: MandateKey): boolean =>
    integrationId === null
      ? mandate.defaults[key]
      : (mandate.channels[integrationId]?.[key] ?? mandate.defaults[key]);

  const put = (next: Mandate) => setMandate.mutate({ body: next });

  const setDefault = (key: MandateKey, value: boolean) =>
    put({ ...mandate, defaults: { ...mandate.defaults, [key]: value } });

  const setChannel = (integrationId: string, key: MandateKey, value: boolean) =>
    put({
      ...mandate,
      channels: {
        ...mandate.channels,
        [integrationId]: { ...mandate.channels[integrationId], [key]: value },
      },
    });

  const renderRow = (
    key: string,
    label: string,
    idPrefix: string,
    integrationId: string | null,
    onToggle: (k: MandateKey, value: boolean) => void,
  ) => (
    <Stack align="center" direction="row" gap="250" justify="between" key={key}>
      <Typography type="text" weight="medium">
        {label}
      </Typography>
      <Stack align="center" direction="row" gap="200">
        <Toggle
          checked={effective(integrationId, "dispatch")}
          data-testid={`${idPrefix}-dispatch`}
          label={t("mandate.dispatch")}
          onChange={(v) => onToggle("dispatch", v)}
        />
        <Toggle
          checked={effective(integrationId, "reply")}
          data-testid={`${idPrefix}-reply`}
          label={t("mandate.reply")}
          onChange={(v) => onToggle("reply", v)}
        />
      </Stack>
    </Stack>
  );

  return (
    <HudPanel padding="300" title={t("mandate.title")}>
      <Stack gap="200">
        <Stack direction="row" justify="between">
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("mandate.hint")}
          </Typography>
          <Stack direction="row" gap="400">
            <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
              dispatch
            </Typography>
            <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
              reply
            </Typography>
          </Stack>
        </Stack>
        {renderRow("default", t("mandate.defaults"), "settings-mandate-default", null, setDefault)}
        {integrations.length > 0 && <Divider />}
        {integrations.map((i) =>
          renderRow(i.id, i.name ?? i.id, `settings-mandate-${i.id}`, i.id, (key, value) =>
            setChannel(i.id, key, value),
          ),
        )}
      </Stack>
    </HudPanel>
  );
}
