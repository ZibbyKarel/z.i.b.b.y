"use client";

import { Button, SegmentedControl, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSyncTeamKbMutation } from "../mutations";
import { TEAM_SOURCE_PREFIX, VAULT_SOURCE, useKnowledgeSource } from "../context";

export enum KnowledgeSourceBarTestId {
  Sync = "knowledge-sync",
  SyncResult = "knowledge-sync-result",
}

/**
 * The Knowledge pages' source bar, top-right of every page header: the switcher
 * (ZibbyCorp / team KBs), and for a team source the "Sync KB" button with its
 * result line underneath. Selection lives in `KnowledgeSourceProvider`.
 */
export function KnowledgeSourceBar() {
  const t = useTranslations("knowledge.source");
  const { source, teamId, kbTeams, setSource } = useKnowledgeSource();
  const sync = useSyncTeamKbMutation();

  const syncText = (() => {
    if (sync.isError) {
      const err = sync.error;
      return "status" in err && err.status === 409 ? err.body.message : t("syncFailed");
    }
    const r = sync.data?.status === 200 ? sync.data.body : null;
    if (!r) return null;
    return r.updated
      ? t("syncPulled", { before: r.before, after: r.after })
      : t("syncCurrent", { sha: r.after });
  })();

  const items = [
    { value: VAULT_SOURCE, label: t("vault") },
    ...kbTeams.map((team) => ({ value: `${TEAM_SOURCE_PREFIX}${team.id}`, label: team.name })),
  ];

  return (
    <Stack align="end" gap="75">
      <Stack wrap align="center" direction="row" gap="150">
        <SegmentedControl
          ariaLabel={t("label")}
          items={items}
          onChange={(value) => {
            sync.reset();
            setSource(value);
          }}
          value={source}
        />
        {teamId !== null && (
          <Button
            data-testid={KnowledgeSourceBarTestId.Sync}
            disabled={sync.isPending}
            icon="retry"
            intent="secondary"
            loading={sync.isPending}
            onClick={() => sync.mutate({ params: { id: teamId }, body: undefined })}
            size="sm"
          >
            {sync.isPending ? t("syncing") : t("sync")}
          </Button>
        )}
      </Stack>
      {teamId !== null && syncText && (
        <Typography
          mono
          data-testid={KnowledgeSourceBarTestId.SyncResult}
          role="status"
          size="sm"
          type="note"
          variant="tertiary"
        >
          {syncText}
        </Typography>
      )}
    </Stack>
  );
}
