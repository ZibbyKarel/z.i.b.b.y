"use client";

import type { TaskTarget } from "@zibby/contracts";
import { Button, ChatBubble, ChatDock, Chip, Stack } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { CommandLine, type ScopeKind } from "../../tasks/components/CommandLine/CommandLine";
import { useChat } from "../ChatContext";
import { useCooChat } from "../hooks/useCooChat";
import { ChatTranscript } from "./ChatTranscript";
import { VoiceStatusStrip } from "./VoiceStatusStrip";
import { VoiceToggleButton } from "./VoiceToggleButton";

export enum CooDockTestId {
  Send = "coo-dock-send",
  Empty = "coo-dock-empty",
  TargetChip = "coo-dock-target-chip",
}

/** Composer auto-grows up to this many lines, then scrolls. */
const COMPOSER_MAX_ROWS = 6;

/** `#` offers every scope kind the chat send body carries. */
const CHAT_SCOPE_KINDS: readonly ScopeKind[] = ["project", "team", "company"];

function targetLabel(target: TaskTarget): string {
  if (target.name) return target.name;
  return "id" in target ? target.id : target.kind;
}

/**
 * ZB-12 — the shell-global COO dock: the DS {@link ChatDock} (positioned by
 * `AppFrame`'s `dock` slot on every route) wired to the chat engine
 * ({@link useCooChat}). It replaces the retired `/chat` page.
 *
 * - **Target chip (O-20):** "→ COO" by default (the classifier routes). A
 *   department page opens the dock with an explicit department target; the chip
 *   then names it and can be cleared back to the COO. D-020: this scope is the
 *   turn's SOLE mention when the composer's own `@`-mention row is empty
 *   (`useCooChat.send`'s fallback — mirrors the old single-target fallback,
 *   generalised to a list); a per-turn `@`-mention picked in the composer still
 *   wins outright, exactly as before.
 * - **Composer (D-020):** the existing `CommandLine`, with `multipleTargets` on —
 *   each `@`-picked agent/workflow/department becomes its own removable chip
 *   IN THE COMPOSER (independent of the dock-level target chip above), and the
 *   attach control is back (the same upload hook/drag-and-drop as New task): the
 *   chat send contract now carries `mentions` + `attachmentSetId`, so there's no
 *   longer anything to silently drop. `#` tags a company/team/project and `/`
 *   picks a skill for the turn (`setScope`/`setSkillId`, one-turn).
 * - **CREATE TASK** on a settled reply → `/work/tasks/new` prefilled with it.
 */
export function CooDock() {
  const t = useTranslations("chat");
  const router = useRouter();
  const { dockOpen, setDockOpen, dockTarget, setDockTarget, messages, newChat } = useChat();
  const { stream, thinking, send, setScope, setSkillId, voice, dictated, consumeDictated } =
    useCooChat();

  // Closing the dock (CLOSE, Esc) switches the mic off.
  const voiceOff = voice.off;
  useEffect(() => {
    if (!dockOpen) voiceOff();
  }, [dockOpen, voiceOff]);

  const createTask = useCallback(
    (text: string) => {
      const params = new URLSearchParams({ text });
      if (dockTarget?.kind === "department") params.set("entry", dockTarget.id);
      router.push(`/work/tasks/new?${params.toString()}` as Route);
    },
    [dockTarget, router],
  );

  // No chip for the COO default (O-20) — it's the obvious fallback with
  // nothing to disambiguate; only an explicit non-COO target earns the chip.
  const targetChip = dockTarget ? (
    <Chip
      closable
      closeLabel={t("dock.clearTarget")}
      data-testid={CooDockTestId.TargetChip}
      onClose={() => setDockTarget(null)}
      tone="thinking"
    >
      {t("dock.targetExplicit", { name: targetLabel(dockTarget) })}
    </Chip>
  ) : undefined;

  const transcript =
    messages.length === 0 && !stream.streaming ? (
      <ChatBubble author="coo" data-testid={CooDockTestId.Empty}>
        {t("dock.empty")}
      </ChatBubble>
    ) : (
      <ChatTranscript
        liveText={stream.text}
        liveToolEvents={stream.toolEvents}
        messages={messages}
        onCreateTask={createTask}
        streaming={stream.streaming}
        thinking={thinking}
      />
    );

  const composer = (
    <Stack align="stretch" direction="col" gap="100">
      {voice.active && voice.interim && (
        <VoiceStatusStrip interim={voice.interim} listening={voice.listening} />
      )}
      <CommandLine
        allowSkillMentions
        frameless
        hideLabel
        inline
        multipleTargets
        showAttach
        attachIcon="paperclip"
        chrome={false}
        injectedText={dictated}
        label={t("composer.label")}
        leadingActions={
          voice.supported && <VoiceToggleButton active={voice.active} onToggle={voice.toggle} />
        }
        maxRows={COMPOSER_MAX_ROWS}
        onInjectedTextConsumed={consumeDictated}
        onScopeChange={setScope}
        onSkillChange={setSkillId}
        onSubmit={(text, _target, submittedAttachments, mentions) => {
          setDockOpen(true);
          send(text, mentions, submittedAttachments);
        }}
        placeholder={voice.listening ? t("composer.listening") : t("composer.placeholder")}
        renderTrailing={({ submit }) => (
          // Always filled per the design — an empty draft is ignored by `submit`
          // itself, so the button only greys out while a turn is in flight.
          <Button
            data-testid={CooDockTestId.Send}
            disabled={thinking}
            intent="primary"
            onClick={submit}
            size="sm"
          >
            {t("composer.send")}
          </Button>
        )}
        scopeKinds={CHAT_SCOPE_KINDS}
        submitDisabled={thinking}
      />
    </Stack>
  );

  return (
    <ChatDock
      closeLabel={t("close")}
      composer={composer}
      newChatLabel={t("newChat")}
      onNewChat={newChat}
      onOpenChange={setDockOpen}
      open={dockOpen}
      scrollKey={`${messages.length}:${stream.text.length}:${thinking}`}
      targetChip={targetChip}
      transcript={transcript}
    />
  );
}
