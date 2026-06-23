"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonGroup, Stack, Typography } from "@zibby/design-system";
import type { ChatPersona, SystemConfig } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useSystemConfigQuery } from "../../system/queries";
import { useSetSystemConfigMutation } from "../../system/mutations";

/** The personas offered, in display order. Labels/descriptions come from i18n. */
const PERSONAS: ChatPersona[] = ["jarvis", "concise", "formal"];

/**
 * The chat personality picker. ZIBBY's conversational *tone* is operator-selectable
 * (JARVIS-like butler by default); only the tone changes — the answer/ask/act
 * governor is constant. Persisted on the file-backed {@link SystemConfig}
 * (`chatPersona`) and read live by the chat engine, so a change applies to the next
 * conversation without a restart. The whole config document is PUT (spreading the
 * runtime knobs so they aren't clobbered), same posture as the runtime section.
 */
export function ChatSection() {
  const { data: config } = useSystemConfigQuery();
  if (!config) return null;
  return <ChatEditor config={config} key={config.chatPersona} />;
}

function ChatEditor({ config }: { config: SystemConfig }) {
  const t = useTranslations("settings");
  const setConfig = useSetSystemConfigMutation();
  const [persona, setPersona] = useState<ChatPersona>(config.chatPersona);

  const choose = (next: ChatPersona) => {
    setPersona(next);
    setConfig.mutate({ body: { ...config, chatPersona: next } });
  };

  return (
    <HudPanel padding="300" title={t("chat.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("chat.hint")}
        </Typography>

        <ButtonGroup
          ariaLabel={t("chat.title")}
          onChange={(v) => choose(v as ChatPersona)}
          options={PERSONAS.map((p) => ({ id: p, label: t(`chat.persona.${p}`) }))}
          value={persona}
        />

        <Typography leading="snug" type="note" variant="secondary">
          {t(`chat.personaDesc.${persona}`)}
        </Typography>
      </Stack>
    </HudPanel>
  );
}
