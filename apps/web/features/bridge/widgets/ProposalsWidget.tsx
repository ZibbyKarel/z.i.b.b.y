"use client";

import { PROPOSAL_TEXT_MAX, type Proposal } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  BoardText,
  Button,
  Container,
  HoldButton,
  Stack,
  type SubNavLinkComponent,
  TextAreaField,
  TextLink,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { useNow } from "../../../hooks/useNow";
import {
  AutomationFormDialog,
  type AutomationFormDialogProps,
} from "../../automations/components/AutomationFormDialog";
import { useCreateAutomationMutation } from "../../automations/mutations";
import { useDecideProposalMutation } from "../../proposals/mutations";
import { useProposalsQuery } from "../../proposals/queries";
import { toClientTarget } from "../../tasks/task";
import { useTaskQuery } from "../../tasks/queries";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum ProposalsWidgetTestId {
  Row = "proposals-widget-row",
  Source = "proposals-widget-source",
  Confidence = "proposals-widget-confidence",
  Expiry = "proposals-widget-expiry",
  Provenance = "proposals-widget-provenance",
  Dismiss = "proposals-widget-dismiss",
  Approve = "proposals-widget-approve",
  Edit = "proposals-widget-edit",
  Editor = "proposals-widget-editor",
  Save = "proposals-widget-save",
  Cancel = "proposals-widget-cancel",
  RowError = "proposals-widget-row-error",
  Empty = "proposals-widget-empty",
}

const DAY_MS = 86_400_000;

/** Whole days until `expiresAt` (rounded up, never negative). */
export const proposalExpiryDays = (expiresAt: string, now: number): number =>
  Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY_MS));

type Provenance = { kind: "note" | "agent" | "approval"; href: Route };

/**
 * The one provenance link a row shows: note, then agent, then approval. An agent-factory
 * candidate with an approval links to the approvals page instead — that is where it is decided.
 */
export function proposalProvenance(
  p: Proposal["provenance"],
  source?: Proposal["source"],
): Provenance | null {
  if (source === "agent-factory" && p.approvalId) {
    return { kind: "approval", href: "/activity/approvals" as Route };
  }
  if (p.noteId) {
    return {
      kind: "note",
      href: `/knowledge/vault?note=${encodeURIComponent(p.noteId)}` as Route,
    };
  }
  if (p.agentId) {
    return { kind: "agent", href: `/workforce/agents/${encodeURIComponent(p.agentId)}` as Route };
  }
  if (p.approvalId) return { kind: "approval", href: "/activity/approvals" as Route };
  return null;
}

/**
 * Proposals: suggestions the automations produced (pattern extraction, automation ideas, agent
 * factory) for the operator to review — dismiss, approve an automation idea (opens the create
 * automation dialog prefilled from its sample task), or edit a pattern's wording (agent-factory
 * candidates are edited on the agent page). Collapses to the header when nothing is open.
 */
export function ProposalsWidget({ onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.proposals");
  const now = useNow(60_000);
  const query = useProposalsQuery();
  const proposals = useMemo(() => query.data ?? [], [query.data]);
  const loading = query.isPending;
  const failed = query.isError;

  useWidgetReport(
    { loading, count: loading ? undefined : proposals.length, you: 0, failed },
    { onEmptyChange, onCountChange },
  );

  if (failed) return <QueryError onRetry={() => void query.refetch()} />;
  if (!loading && proposals.length === 0) {
    return (
      <BoardRow tone="neutral">
        <span data-testid={ProposalsWidgetTestId.Empty}>
          <BoardText kind="meta" tone="ink3">
            {t("empty")}
          </BoardText>
        </span>
      </BoardRow>
    );
  }
  return (
    <>
      {proposals.map((p) => (
        <ProposalRow key={p.id} now={now} proposal={p} />
      ))}
    </>
  );
}

interface ProposalRowProps {
  proposal: Proposal;
  now: number;
}

function ProposalRow({ proposal, now }: ProposalRowProps) {
  const t = useTranslations("bridge.widgets.proposals");
  const decide = useDecideProposalMutation();
  // Lives on the row, not the dialog: the dialog closes on submit, and a mutate-level
  // `onSuccess` never fires once its component has unmounted.
  const createAutomation = useCreateAutomationMutation();
  const shown = proposal.editedText ?? proposal.text;
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [draft, setDraft] = useState(shown);
  const provenance = proposalProvenance(proposal.provenance, proposal.source);
  const approvable = proposal.source === "gap-detect";
  const editable = proposal.source === "pattern-extract";
  const dismissable = proposal.source !== "agent-factory";
  const trimmed = draft.trim();

  const dismiss = () => decide.mutate({ params: { id: proposal.id }, body: { action: "dismiss" } });
  const save = () =>
    decide.mutate(
      { params: { id: proposal.id }, body: { action: "edit", text: trimmed } },
      { onSuccess: () => setEditing(false) },
    );
  const cancelEdit = () => {
    decide.reset();
    setEditing(false);
  };
  const startEdit = () => {
    setDraft(shown);
    setEditing(true);
  };

  return (
    <div data-testid={ProposalsWidgetTestId.Row}>
      <BoardRow
        action={
          editing ? undefined : (
            <Stack align="center" direction="row" gap="50">
              {approvable ? (
                <Button
                  aria-label={t("approveLabel", { text: shown })}
                  data-testid={ProposalsWidgetTestId.Approve}
                  disabled={decide.isPending}
                  intent="ghost"
                  onClick={() => setApproving(true)}
                  size="sm"
                >
                  {t("approve")}
                </Button>
              ) : null}
              {editable ? (
                <Button
                  aria-label={t("editLabel", { text: shown })}
                  data-testid={ProposalsWidgetTestId.Edit}
                  intent="ghost"
                  onClick={startEdit}
                  size="sm"
                >
                  {t("edit")}
                </Button>
              ) : null}
              {dismissable ? (
                <Button
                  aria-label={t("dismissLabel", { text: shown })}
                  data-testid={ProposalsWidgetTestId.Dismiss}
                  disabled={decide.isPending}
                  intent="ghost"
                  onClick={dismiss}
                  size="sm"
                >
                  {t("dismiss")}
                </Button>
              ) : (
                <HoldButton
                  aria-label={t("dismissLabel", { text: shown })}
                  armedLabel={t("dismissArmed")}
                  data-testid={ProposalsWidgetTestId.Dismiss}
                  disabled={decide.isPending}
                  doneLabel={t("dismissDone")}
                  label={t("dismiss")}
                  onConfirm={dismiss}
                  size="sm"
                />
              )}
            </Stack>
          )
        }
        tone="neutral"
      >
        {editing ? (
          <Stack gap="100">
            <Stack data-testid={ProposalsWidgetTestId.Editor}>
              <TextAreaField
                label={t("editor")}
                maxLength={PROPOSAL_TEXT_MAX}
                onChange={(e) => setDraft(e.target.value)}
                value={draft}
              />
            </Stack>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={ProposalsWidgetTestId.Save}
                disabled={trimmed === "" || trimmed === shown}
                intent="secondary"
                loading={decide.isPending}
                onClick={save}
                size="sm"
              >
                {t("save")}
              </Button>
              <Button
                data-testid={ProposalsWidgetTestId.Cancel}
                intent="ghost"
                onClick={cancelEdit}
                size="sm"
              >
                {t("cancel")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <BoardText kind="title">{shown}</BoardText>
        )}
        <BoardLine gap="6" indent={false}>
          <BoardText data-testid={ProposalsWidgetTestId.Source} kind="meta" tone="ink">
            {t(`source.${proposal.source}`)}
          </BoardText>
          <BoardText data-testid={ProposalsWidgetTestId.Confidence} kind="meta" tone="ink3">
            {t(`confidence.${proposal.confidence}`)}
          </BoardText>
          <BoardText data-testid={ProposalsWidgetTestId.Expiry} kind="meta" tone="ink3">
            {t("expires", { days: proposalExpiryDays(proposal.expiresAt, now) })}
          </BoardText>
          {provenance ? (
            <TextLink
              data-testid={ProposalsWidgetTestId.Provenance}
              href={provenance.href}
              linkComponent={Link as SubNavLinkComponent}
            >
              <BoardText underline kind="meta" tone="ink">
                {t(`provenance.${provenance.kind}`)}
              </BoardText>
            </TextLink>
          ) : null}
        </BoardLine>
        {decide.isError || createAutomation.isError ? (
          <Container padding={["50", "0"]}>
            <span data-testid={ProposalsWidgetTestId.RowError} role="alert">
              <BoardText kind="meta" tone="ink">
                {!createAutomation.isError && decide.variables?.body.action === "edit"
                  ? t("error")
                  : t("actionError")}
              </BoardText>
            </span>
          </Container>
        ) : null}
      </BoardRow>
      {approving ? (
        <ApproveProposalDialog
          onClose={() => setApproving(false)}
          onCreate={(body) =>
            createAutomation.mutate(
              { body },
              {
                onSuccess: () =>
                  decide.mutate({ params: { id: proposal.id }, body: { action: "approve" } }),
              },
            )
          }
          taskId={proposal.provenance.taskId}
        />
      ) : null}
    </div>
  );
}

interface ApproveProposalDialogProps {
  /** The proposal's sample task — prefills what to run; absent → an empty dialog. */
  taskId?: string;
  onClose: () => void;
  onCreate: AutomationFormDialogProps["onCreate"];
}

/** The create-automation dialog, prefilled from the recurring task once it has loaded. */
function ApproveProposalDialog({ taskId, onClose, onCreate }: ApproveProposalDialogProps) {
  const task = useTaskQuery(taskId);
  // Wait for the sample task so CommandLine mounts with its text (it only reads it once);
  // a missing/failed task still opens the dialog, just empty.
  if (taskId && task.isPending) return null;
  const sample = task.data;
  return (
    <AutomationFormDialog
      initialTarget={sample?.target ? toClientTarget(sample.target) : undefined}
      initialText={sample?.text}
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}
