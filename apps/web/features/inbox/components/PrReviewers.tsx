"use client";

import type { InboxPrReviewer } from "@zibby/contracts";
import {
  Button,
  Container,
  Icon,
  type IconName,
  type IconTone,
  IndentRail,
  Row,
  SheetBlock,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRequestInboxPrReviewMutation } from "../mutations";
import { useInboxPrReviewersQuery } from "../queries";

export enum PrReviewersTestId {
  Root = "pr-reviewers",
  Team = "pr-reviewers-team",
  CodeOwner = "pr-reviewers-code-owner",
  Person = "pr-reviewers-person",
  Commented = "pr-reviewers-commented",
  ReRequest = "pr-reviewers-re-request",
}

const STATE_ICON: Partial<Record<InboxPrReviewer["state"], { name: IconName; tone: IconTone }>> = {
  approved: { name: "check", tone: "ok" },
  changesRequested: { name: "edit", tone: "warn" },
  pending: { name: "clock", tone: "faint" },
};

export interface PrReviewersProps {
  projectId: string;
  number: number;
}

/**
 * GitHub-style Reviewers box: teams (shield = CODEOWNER of a changed file, clock = still
 * requested) with their reviewing members nested, then people outside any listed team. Names on
 * the left, state icons on the right; a changes-requested person gets a re-request button.
 * Hidden while loading, on error (e.g. a GitLab project) and when nobody is involved.
 */
export function PrReviewers({ projectId, number }: PrReviewersProps) {
  const t = useTranslations("inboxPage.prs.reviewers");
  const { data } = useInboxPrReviewersQuery(projectId, number);
  const request = useRequestInboxPrReviewMutation();
  if (!data || (data.teams.length === 0 && data.users.length === 0)) return null;

  const label = (name: IconName, tone: IconTone, text: string, testId?: PrReviewersTestId) => (
    <Icon
      aria-hidden={false}
      aria-label={text}
      data-testid={testId}
      name={name}
      role="img"
      size="sm"
      tone={tone}
    />
  );

  const person = (r: InboxPrReviewer) => {
    const icon = STATE_ICON[r.state];
    const pending = request.isPending && request.variables?.body.login === r.login;
    return (
      <Row
        data-state={r.state}
        data-testid={PrReviewersTestId.Person}
        gap="100"
        justify="between"
        key={r.login}
      >
        <Typography type="bodySm">{r.login}</Typography>
        <Row gap="75">
          {r.commented && label("chat", "dim", t("commented"), PrReviewersTestId.Commented)}
          {icon && label(icon.name, icon.tone, t(`state.${r.state}`))}
          {r.state === "changesRequested" && (
            <Button
              aria-label={t("reRequest", { login: r.login })}
              data-testid={PrReviewersTestId.ReRequest}
              icon="retry"
              intent="ghost"
              loading={pending}
              onClick={() =>
                request.mutate({ params: { projectId, number }, body: { login: r.login } })
              }
              size="sm"
            />
          )}
        </Row>
      </Row>
    );
  };

  return (
    <Stack data-testid={PrReviewersTestId.Root}>
      <SheetBlock label={t("title")}>
        <Stack gap="75">
          {data.teams.map((team) => (
            <Stack data-testid={PrReviewersTestId.Team} gap="50" key={team.slug}>
              <Row gap="100" justify="between">
                <Typography type="labelSm">{team.name}</Typography>
                <Row gap="75">
                  {team.codeOwner &&
                    label("shield", "accent", t("codeOwner"), PrReviewersTestId.CodeOwner)}
                  {team.requested && label("clock", "faint", t("requested"))}
                </Row>
              </Row>
              {team.members.length > 0 && (
                <IndentRail>
                  <Container padding={["0", "0", "0", "150"]}>
                    <Stack gap="50">{team.members.map(person)}</Stack>
                  </Container>
                </IndentRail>
              )}
            </Stack>
          ))}
          {data.users.map(person)}
        </Stack>
      </SheetBlock>
    </Stack>
  );
}
