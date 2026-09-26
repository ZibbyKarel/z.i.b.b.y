"use client";

import type { TaskTarget } from "@zibby/contracts";
import { AgentGlyph, Button, ChatDock, Chip, Row, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import { useChat } from "../ChatContext";
import { useCooChat } from "../hooks/useCooChat";
import { ChatTranscript } from "./ChatTranscript";
import { VoiceStatusStrip } from "./VoiceStatusStrip";
import { VoiceToggleButton } from "./VoiceToggleButton";

export enum CooDockTestId {
  Send = "coo-dock-send",
  NewChat = "coo-dock-new-chat",
  Empty = "coo-dock-empty",
  TargetChip = "coo-dock-target-chip",
}

/** Composer auto-grows up to this many lines, then scrolls. */
const COMPOSER_MAX_ROWS = 4;

/** The one-line collapsed preview is cut here (the DS also truncates visually). */
const LATEST_LINE_MAX_CHARS = 160;

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
 *   then names it and can be cleared back to the COO. A per-turn `@`-mention in
 *   the composer still wins for that one turn.
 * - **Composer:** the existing `CommandLine` with `@`-mentions (targets + team
 *   tags). Attachments are **not** offered: the chat send contract has no
 *   attachment channel, and an attach control that silently drops files would be
 *   a lie (they stay on `/work/tasks/new`).
 * - **CREATE TASK** on a settled reply → `/work/tasks/new` prefilled with it.
 */
export function CooDock() {
  const t = useTranslations("chat");
  const router = useRouter();
  const { dockOpen, setDockOpen, dockTarget, setDockTarget, messages, newChat } = useChat();
  const { stream, thinking, send, setTeamId, voice } = useCooChat();

  const createTask = useCallback(
    (text: string) => {
      const params = new URLSearchParams({ text });
      if (dockTarget?.kind === "department") params.set("entry", dockTarget.id);
      router.push(`/work/tasks/new?${params.toString()}` as Route);
    },
    [dockTarget, router],
  );

  const last = messages.at(-1);
  const latestLine = last ? last.text.slice(0, LATEST_LINE_MAX_CHARS) : undefined;

  const avatar = <AgentGlyph seed="zibby" size={22} state={thinking ? "thinking" : "idle"} />;

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
  ) : (
    <Chip data-testid={CooDockTestId.TargetChip} tone="idle">
      {t("dock.targetCoo")}
    </Chip>
  );

  const transcript =
    messages.length === 0 && !stream.streaming ? (
      <Typography data-testid={CooDockTestId.Empty} type="note" variant="tertiary">
        {t("dock.empty")}
      </Typography>
    ) : (
      <Stack direction="col" gap="150">
        <Row justify="end">
          <Button
            data-testid={CooDockTestId.NewChat}
            icon="trash"
            intent="ghost"
            onClick={newChat}
            size="sm"
          >
            {t("newChat")}
          </Button>
        </Row>
        <ChatTranscript
          liveText={stream.text}
          liveToolEvents={stream.toolEvents}
          messages={messages}
          onCreateTask={createTask}
          streaming={stream.streaming}
        />
      </Stack>
    );

  const composer = (
    <Stack align="stretch" direction="col" gap="100">
      {voice.active && <VoiceStatusStrip interim={voice.interim} listening={voice.listening} />}
      <CommandLine
        allowTeamMentions
        frameless
        hideLabel
        chrome={false}
        disabled={thinking}
        label={t("composer.label")}
        leadingActions={
          voice.supported && <VoiceToggleButton active={voice.active} onToggle={voice.toggle} />
        }
        maxRows={COMPOSER_MAX_ROWS}
        onSubmit={(text, target) => send(text, target)}
        onTeamChange={setTeamId}
        placeholder={t("composer.placeholder")}
        renderTrailing={({ canSubmit, submit }) => (
          <Button
            aria-label={t("composer.send")}
            data-testid={CooDockTestId.Send}
            disabled={!canSubmit}
            icon="arrow"
            intent="primary"
            onClick={submit}
            size="sm"
          />
        )}
        showAttach={false}
      />
    </Stack>
  );

  return (
    <ChatDock
      avatar={avatar}
      closeLabel={t("close")}
      composer={composer}
      latestLine={latestLine}
      onOpenChange={setDockOpen}
      open={dockOpen}
      roleLabel={t("dock.role")}
      targetChip={targetChip}
      toggleLabel={t("dock.toggle")}
      transcript={transcript}
    />
  );
}
