"use client";

import { useTranslations } from "next-intl";
import { SelectField, Stack, StatusDot, ToggleField, Typography } from "@zibby/design-system";
import type { DotTone } from "@zibby/design-system";
import type { SpeechDaemonState, SystemConfig } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { LoadError } from "../../../components/LoadError/LoadError";
import { useSpeechStatusQuery, useSpeechVoicesQuery } from "../../speech";
import { useSetSystemConfigMutation, useSystemConfigQuery } from "../../system";

export enum ChatUiSectionTestId {
  Root = "chat-ui-section",
  PowerSaverToggle = "chat-ui-section-power-saver-toggle",
  VoiceStatus = "chat-ui-section-voice-status",
}

/** `SelectField` sentinel for "no override" — `ttsVoice: null` (daemon default). A
 * real voice id from `speakd` is never empty, so this can't collide. */
const TTS_VOICE_AUTO = "";

/** `StatusDot` tone per `speakd` daemon state, once reachable. `ready` reads as
 * healthy; `loading`/`degraded` read as a caution, not a hard failure — the daemon
 * is still there, just not fully up. */
const STATE_TONE: Record<SpeechDaemonState, DotTone> = {
  ready: "ok",
  loading: "wait",
  degraded: "wait",
};

/**
 * Chat UI settings — the „Úsporný mód" (power-saver) toggle for the chat's 3D
 * scene, the `speakd` voice picker, and a compact daemon status line (Phase
 * 119c). `powerSaver`/`ttsVoice` persist on the file-backed {@link SystemConfig},
 * instant-apply (no Save button), same posture as `ChatSection`.
 */
export function ChatUiSection() {
  const { data: config } = useSystemConfigQuery();
  if (!config) return null;
  return <ChatUiEditor config={config} />;
}

function ChatUiEditor({ config }: { config: SystemConfig }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const setConfig = useSetSystemConfigMutation();
  const voices = useSpeechVoicesQuery();
  const status = useSpeechStatusQuery();

  const voiceOptions = [
    { value: TTS_VOICE_AUTO, label: t("chatUi.voiceAuto") },
    ...(voices.data ?? []).map((voice) => ({
      value: voice.id,
      label: voice.label,
      code: voice.language,
    })),
  ];

  return (
    <HudPanel padding="300" title={t("chatUi.title")}>
      <Stack data-testid={ChatUiSectionTestId.Root} gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("chatUi.hint")}
        </Typography>

        <ToggleField
          checked={config.powerSaver ?? false}
          data-testid={ChatUiSectionTestId.PowerSaverToggle}
          hint={t("chatUi.powerSaverHint")}
          label={t("chatUi.powerSaver")}
          onChange={(next) => setConfig.mutate({ body: { ...config, powerSaver: next } })}
        />

        {/* A `listVoices` 503 (daemon down) is an honest "couldn't load" state, not
            a broken picker offering only "Auto". */}
        {voices.isError ? (
          <LoadError
            description={t("chatUi.voiceErrorDesc")}
            onRetry={() => voices.refetch()}
            retryLabel={tCommon("retry")}
            title={t("chatUi.voiceErrorTitle")}
          />
        ) : (
          <SelectField
            hint={t("chatUi.voiceHint")}
            label={t("chatUi.voiceLabel")}
            onValueChange={(next) =>
              setConfig.mutate({
                body: { ...config, ttsVoice: next === TTS_VOICE_AUTO ? null : next },
              })
            }
            options={voiceOptions}
            value={config.ttsVoice ?? TTS_VOICE_AUTO}
          />
        )}

        {/* Daemon status line — `getStatus` always answers 200, `reachable: false`
            reports a down daemon rather than the query erroring, so this renders
            straight from the body once it lands. */}
        {status.data && (
          <Stack
            align="center"
            data-testid={ChatUiSectionTestId.VoiceStatus}
            direction="row"
            gap="75"
          >
            <StatusDot tone={status.data.reachable ? STATE_TONE[status.data.state] : "bad"} />
            <Typography mono size="2xs" type="note" variant="tertiary">
              {status.data.reachable
                ? t("chatUi.statusLine", {
                    state: t(`chatUi.statusState.${status.data.state}`),
                    voice: status.data.defaultVoice ?? t("chatUi.statusVoiceUnknown"),
                  })
                : t("chatUi.statusUnreachable")}
            </Typography>
          </Stack>
        )}
      </Stack>
    </HudPanel>
  );
}
