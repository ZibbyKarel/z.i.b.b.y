"use client";

import { PROPOSAL_TEXT_MAX, type Proposal } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  BoardText,
  Button,
  Container,
  Stack,
  TextAreaField,
  TextLink,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { useNow } from "../../../hooks/useNow";
import { useDecideProposalMutation } from "../../proposals/mutations";
import { useProposalsQuery } from "../../proposals/queries";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum ProposalsWidgetTestId {
  Row = "proposals-widget-row",
  Source = "proposals-widget-source",
  Confidence = "proposals-widget-confidence",
  Expiry = "proposals-widget-expiry",
  Provenance = "proposals-widget-provenance",
  Dismiss = "proposals-widget-dismiss",
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

/** The one provenance link a row shows: note, then agent, then approval. */
export function proposalProvenance(p: Proposal["provenance"]): Provenance | null {
  if (p.noteId) {
    return {
      kind: "note",
      href: `/knowledge/vault?note=${encodeURIComponent(p.noteId)}` as Route,
    };
  }
  if (p.agentId) {
    return { kind: "agent", href: `/workforce/agents/${encodeURIComponent(p.agentId)}` as Route };
  }
  if (p.approvalId) return { kind: "approval", href: "/governance/approvals" as Route };
  return null;
}

/**
 * Proposals: suggestions the automations produced (pattern extraction, automation ideas, agent
 * factory) for the operator to review — dismiss, or edit the wording (not agent-factory ones,
 * whose candidate is edited on the agent page). Collapses to the header when nothing is open.
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
  const shown = proposal.editedText ?? proposal.text;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shown);
  const provenance = proposalProvenance(proposal.provenance);
  const editable = proposal.source !== "agent-factory";
  const trimmed = draft.trim();

  const dismiss = () => decide.mutate({ params: { id: proposal.id }, body: { action: "dismiss" } });
  const save = () =>
    decide.mutate(
      { params: { id: proposal.id }, body: { action: "edit", text: trimmed } },
      { onSuccess: () => setEditing(false) },
    );
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
                onClick={() => setEditing(false)}
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
              linkComponent={Link}
            >
              <BoardText underline kind="meta" tone="ink">
                {t(`provenance.${provenance.kind}`)}
              </BoardText>
            </TextLink>
          ) : null}
        </BoardLine>
        {decide.isError ? (
          <Container padding={["50", "0"]}>
            <span data-testid={ProposalsWidgetTestId.RowError} role="alert">
              <BoardText kind="meta" tone="ink">
                {t("error")}
              </BoardText>
            </span>
          </Container>
        ) : null}
      </BoardRow>
    </div>
  );
}
