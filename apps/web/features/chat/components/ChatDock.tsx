"use client";

import type { TaskTarget } from "@zibby/contracts";
import { Button, ChatBubble, Chip, ChatDock as DockFrame, Row, Stack } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { CommandLine, type ScopeKind } from "../../tasks/components/CommandLine/CommandLine";
import { useChat } from "../ChatContext";
import { useChatDock } from "../hooks/useChatDock";
import { useCreateChatHandoffMutation } from "../mutations";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { ChatTranscript } from "./ChatTranscript";
import { VoiceStatusStrip } from "./VoiceStatusStrip";
import { VoiceToggleButton } from "./VoiceToggleButton";

export enum ChatDockTestId {
  Send = "app-chat-dock-send",
  Empty = "app-chat-dock-empty",
  TargetChip = "app-chat-dock-target-chip",
  AboutChip = "app-chat-dock-about-chip",
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
 * ZB-12 — the shell-global chat dock: the DS {@link DockFrame} (positioned by
 * `AppFrame`'s `dock` slot on every route) wired to the chat engine
 * ({@link useChatDock}). It replaces the retired `/chat` page.
 *
 * - **Target chip (O-20):** no chip by default (the classifier routes). A
 *   department page opens the dock with an explicit department target; the chip
 *   then names it and can be cleared back to automatic routing. D-020: this scope is the
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
 * - **CREATE TASK** on a settled reply → `/work/tasks/new` prefilled with a
 *   hand-off of the conversation up to that reply (the server compacts a long
 *   thread and references the full transcript), never just the reply's text.
 */
export function ChatDock() {
  const t = useTranslations("chat");
  const router = useRouter();
  const {
    dockOpen,
    setDockOpen,
    dockTarget,
    setDockTarget,
    about,
    setAbout,
    messages,
    newChat,
    conversationId,
  } = useChat();
  const { stream, thinking, send, setScope, setSkillId, voice, dictated, consumeDictated } =
    useChatDock();

  // Closing the dock (CLOSE, Esc) switches the mic off.
  const voiceOff = voice.off;
  useEffect(() => {
    if (!dockOpen) voiceOff();
  }, [dockOpen, voiceOff]);

  const handoff = useCreateChatHandoffMutation();
  const handoffMutate = handoff.mutate;
  const createTask = useCallback(
    (messageId: string) => {
      if (!conversationId) return;
      const goToNewTask = (text: string) => {
        const params = new URLSearchParams({ text });
        if (dockTarget?.kind === "department") params.set("entry", dockTarget.id);
        router.push(`/work/tasks/new?${params.toString()}` as Route);
      };
      handoffMutate(
        { body: { conversationId, upToMessageId: messageId } },
        {
          onSuccess: (res) => {
            if (res.status === 200) goToNewTask(res.body.text);
          },
          // The hand-off couldn't be built — still open the form with the reply and a
          // pointer to the conversation, so the context isn't silently dropped.
          onError: () => {
            const reply = messages.find((m) => m.id === messageId)?.text ?? "";
            goToNewTask(`${reply}\n\nContext: ZIBBY chat conversation ${conversationId}.`);
          },
        },
      );
    },
    [conversationId, dockTarget, handoffMutate, messages, router],
  );

  // No chip for the automatic default (O-20) — it's the obvious fallback with
  // nothing to disambiguate; only an explicit target earns the chip.
  const targetChipEl = dockTarget ? (
    <Chip
      closable
      closeLabel={t("dock.clearTarget")}
      data-testid={ChatDockTestId.TargetChip}
      onClose={() => setDockTarget(null)}
      tone="thinking"
    >
      {t("dock.targetExplicit", { name: targetLabel(dockTarget) })}
    </Chip>
  ) : undefined;

  const aboutChipEl = about ? (
    <Chip
      closable
      closeLabel={t("dock.clearAbout")}
      data-testid={ChatDockTestId.AboutChip}
      onClose={() => setAbout(null)}
      tone="working"
    >
      {t("dock.aboutChip", { label: about.label })}
    </Chip>
  ) : undefined;

  const targetChip =
    aboutChipEl || targetChipEl ? (
      <Row wrap gap="75">
        {aboutChipEl}
        {targetChipEl}
      </Row>
    ) : undefined;

  const transcript =
    messages.length === 0 && !stream.streaming ? (
      <ChatBubble author="assistant" data-testid={ChatDockTestId.Empty}>
        {t("dock.empty")}
      </ChatBubble>
    ) : (
      <ChatTranscript
        creatingTaskFor={handoff.isPending ? handoff.variables?.body.upToMessageId : undefined}
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
            data-testid={ChatDockTestId.Send}
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
    <DockFrame
      closeLabel={t("close")}
      composer={composer}
      newChatLabel={t("newChat")}
      onNewChat={newChat}
      onOpenChange={setDockOpen}
      open={dockOpen}
      scrollKey={`${messages.length}:${stream.text.length}:${thinking}`}
      sidebar={<ChatHistorySidebar />}
      sidebarLabel={t("history.toggle")}
      targetChip={targetChip}
      transcript={transcript}
    />
  );
}
