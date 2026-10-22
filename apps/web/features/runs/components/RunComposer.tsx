"use client";

import {
  AgentBadge,
  Button,
  Container,
  Stack,
  type StateTone,
  TextInputField,
  ToggleChip,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useAgentSymbol } from "../../agents";
import { useAnswerApprovalMutation, useReviseMutation } from "../../approvals";
import type { DashboardApproval } from "../../approvals/approval";
import { useNewTask } from "../../tasks";
import { useSendTaskRunMessageMutation } from "../mutations";
import type { RunView } from "../run";
import type { RunMode } from "../runDetailModel";
import type { RunActions } from "../useRunActions";
import { useContinueTaskContext } from "./RunOutputView";

export enum RunComposerTestId {
  Root = "run-composer",
  /** Suffixed with the recipient key, e.g. `run-composer-recipient-all`. */
  Recipient = "run-composer-recipient",
  Hint = "run-composer-hint",
  Input = "run-composer-input",
  Send = "run-composer-send",
}

export interface RunComposerCrewMember {
  /** The phase id a message is addressed to. */
  key: string;
  name: string;
  state?: StateTone;
}

export interface RunComposerProps {
  run: RunView;
  mode: RunMode;
  approval?: DashboardApproval;
  /** The workflow's phases — the TO chips after ALL. */
  crew: RunComposerCrewMember[];
  reviseOpen: boolean;
  /** Closes revise mode after a revision is sent. */
  onRevised: () => void;
  /** The parent switches the view to LIVE. */
  onSent: () => void;
  resume: RunActions["resume"];
  resuming: boolean;
}

type Action = "revise" | "message" | "answer" | "resume" | "rerun" | "newTask" | "none";

interface Row {
  action: Action;
  ph:
    | "revise"
    | "running"
    | "approval"
    | "agentRunning"
    | "question"
    | "parked"
    | "stopped"
    | "done"
    | null;
  send: "send" | "answer" | "resume" | "rerun" | "newTask" | "sendBack" | null;
  hint:
    | "running"
    | "paused"
    | "approval"
    | "question"
    | "parked"
    | "stopped"
    | "done"
    | "revise"
    | null;
  disabled?: boolean;
}

function composerRow(run: RunView, mode: RunMode, reviseOpen: boolean): Row {
  const workflow = run.kind === "workflow";
  if (mode === "approval" && reviseOpen)
    return { action: "revise", ph: "revise", send: "sendBack", hint: "revise" };
  switch (mode) {
    case "running":
    case "pausing":
    case "paused":
    case "approval":
      if (!workflow)
        return {
          action: "none",
          ph: "agentRunning",
          send: "send",
          hint: "running",
          disabled: true,
        };
      return {
        action: "message",
        ph: mode === "approval" ? "approval" : "running",
        send: "send",
        hint: mode === "paused" ? "paused" : mode === "approval" ? "approval" : "running",
      };
    case "question":
      return { action: "answer", ph: "question", send: "answer", hint: "question" };
    case "parked":
      return { action: "resume", ph: "parked", send: "resume", hint: "parked" };
    case "stopped":
    case "error":
      return { action: "rerun", ph: "stopped", send: "rerun", hint: "stopped" };
    case "done":
      return { action: "newTask", ph: "done", send: "newTask", hint: "done" };
    case "waiting":
    case "limit":
      return { action: "none", ph: null, send: null, hint: null, disabled: true };
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The run's one input: messages the crew, answers a question, revises a gate, resumes or follows up — by mode. */
export function RunComposer({
  run,
  mode,
  approval,
  crew,
  reviseOpen,
  onRevised,
  onSent,
  resume,
  resuming,
}: RunComposerProps) {
  const t = useTranslations("runs.detail.composer");
  const symbolOf = useAgentSymbol();
  const [text, setText] = useState("");
  const [to, setTo] = useState("all");
  // Two Enter presses can land before `isPending` re-renders — the ref closes that gap.
  const inFlight = useRef(false);

  const revise = useReviseMutation();
  const send = useSendTaskRunMessageMutation();
  const answer = useAnswerApprovalMutation();
  const { open: openNewTask } = useNewTask();
  const continueContext = useContinueTaskContext(run);

  const row = composerRow(run, mode, reviseOpen);
  const pending = revise.isPending || send.isPending || answer.isPending || resuming;
  const trimmed = text.trim();
  const canSend = !row.disabled && row.action !== "none" && !!trimmed && !pending;

  const done = () => {
    setText("");
    onSent();
  };
  const settled = () => {
    inFlight.current = false;
  };
  const callbacks = { onSuccess: done, onSettled: settled };

  const submit = () => {
    if (!canSend || inFlight.current) return;
    inFlight.current = true;
    switch (row.action) {
      case "revise":
        if (!approval) return settled();
        revise.mutate(
          { params: { id: approval.id }, body: { note: trimmed } },
          {
            onSuccess: () => {
              done();
              onRevised();
            },
            onSettled: settled,
          },
        );
        return;
      case "message":
        send.mutate({ params: { runId: run.runId }, body: { text: trimmed, to } }, callbacks);
        return;
      case "answer":
        if (!approval) return settled();
        answer.mutate({ params: { id: approval.id }, body: { answer: trimmed } }, callbacks);
        return;
      case "resume":
      case "rerun":
        resume(run, { mode: "continue", note: trimmed, ...callbacks });
        return;
      case "newTask":
        openNewTask(trimmed, undefined, continueContext);
        settled();
        done();
        return;
      default:
        settled();
    }
  };

  const placeholder = row.ph
    ? row.ph === "question"
      ? t("ph.question", { agent: approval?.skill ?? run.owner })
      : t(`ph.${row.ph}`)
    : undefined;

  return (
    <Stack data-testid={RunComposerTestId.Root} gap="100">
      <Stack wrap align="center" direction="row" gap="75">
        {row.action === "message" && (
          <>
            <Typography as="span" type="labelSm">
              {t("to")}
            </Typography>
            <ToggleChip
              data-testid={`${RunComposerTestId.Recipient}-all`}
              onClick={() => setTo("all")}
              pressed={to === "all"}
            >
              {t("all", { n: pad2(crew.length) })}
            </ToggleChip>
            {crew.map((c) => (
              <ToggleChip
                data-testid={`${RunComposerTestId.Recipient}-${c.key}`}
                key={c.key}
                leading={<AgentBadge {...symbolOf(c.name)} size="xs" state={c.state ?? "idle"} />}
                onClick={() => setTo(c.key)}
                pressed={to === c.key}
              >
                {c.name.toUpperCase()}
              </ToggleChip>
            ))}
          </>
        )}
        <Container grow />
        {row.hint && (
          <Typography as="span" data-testid={RunComposerTestId.Hint} type="labelSm">
            {t(`hint.${row.hint}`)}
          </Typography>
        )}
      </Stack>
      <Stack align="end" direction="row" gap="75">
        <Container grow minW0>
          <TextInputField
            hideLabel
            data-testid={RunComposerTestId.Input}
            disabled={row.disabled}
            label={t("inputLabel")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            value={text}
          />
        </Container>
        {row.send && (
          <Button
            data-testid={RunComposerTestId.Send}
            disabled={!canSend}
            intent="primary"
            onClick={submit}
          >
            {t(`send.${row.send}`)}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
