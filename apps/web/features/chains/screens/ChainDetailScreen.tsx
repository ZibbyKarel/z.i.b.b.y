"use client";

import {
  Button,
  ChainRouteStrip,
  ConfirmDeleteButton,
  Container,
  EmptyState,
  Panel,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { chainRouteGates, chainRouteSteps } from "../chainRoute";
import { ChainEditor } from "../components/ChainEditor";
import { useDeleteChainMutation, usePutChainMutation } from "../mutations";
import { useChainQuery } from "../queries";

export interface ChainDetailScreenProps {
  chainId: string;
}

/**
 * `/work/chains/[id]` — ZB-05b: a read view with an Edit action top-right that
 * toggles edit mode ON THE SAME PAGE (not a separate route). Edit mode is the
 * shared `ChainEditor` (step cards, gates, label/description); Save calls
 * `PUT /api/handoff/chains/:id` and drops back to the read view. Delete is a
 * `ConfirmDeleteButton` — a 409 (a non-terminal parent task still walks this
 * chain) surfaces its server message inline instead of a generic failure.
 */
export function ChainDetailScreen({ chainId }: ChainDetailScreenProps) {
  const t = useTranslations("chainsWork");
  const router = useRouter();
  const { data: chain, isPending, isError, refetch } = useChainQuery(chainId);
  const putChain = usePutChainMutation();
  const deleteChain = useDeleteChainMutation();
  const [editing, setEditing] = useState(false);

  if (isPending) {
    return (
      <Container padding={["300", "350"]}>
        <QueryLoading />
      </Container>
    );
  }

  if (isError || !chain) {
    return (
      <Container padding={["300", "350"]}>
        <QueryError onRetry={() => void refetch()} />
      </Container>
    );
  }

  const deleteErrorMessage =
    deleteChain.isError && "status" in deleteChain.error && deleteChain.error.status === 409
      ? deleteChain.error.body.message
      : null;

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150" justify="between">
          <Stack gap="50">
            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {chain.id}
            </Typography>
            <Typography type="h1">{chain.label}</Typography>
          </Stack>
          {!editing && (
            <Stack direction="row" gap="100">
              <Button icon="edit" intent="ghost" onClick={() => setEditing(true)} size="sm">
                {t("detail.editAction")}
              </Button>
              <ConfirmDeleteButton
                confirmLabel={t("detail.deleteConfirmAction")}
                label={t("detail.deleteAction")}
                onConfirm={() =>
                  deleteChain.mutate(
                    { params: { id: chain.id } },
                    { onSuccess: () => router.push("/work/chains" as Route) },
                  )
                }
              />
            </Stack>
          )}
        </Stack>

        {deleteErrorMessage && (
          <Typography size="sm" tone="bad" type="note">
            {deleteErrorMessage}
          </Typography>
        )}

        {editing ? (
          <Panel padding="300">
            <ChainEditor
              initial={{
                label: chain.label,
                description: chain.description,
                entry: chain.entry,
                steps: chain.steps.map((s) => ({ department: s.department, gate: s.gate })),
                enabled: chain.enabled,
              }}
              onCancel={() => setEditing(false)}
              onSave={(input) =>
                putChain.mutate(
                  { params: { id: chain.id }, body: input },
                  { onSuccess: () => setEditing(false) },
                )
              }
              saveLabel={t("detail.saveAction")}
              saving={putChain.isPending}
            />
          </Panel>
        ) : (
          <Stack gap="200">
            <Panel padding="300">
              {chain.steps.length === 0 ? (
                <EmptyState body={t("detail.noRouteBody")} title={t("detail.noRouteTitle")} />
              ) : (
                <ChainRouteStrip
                  gates={chainRouteGates(chain)}
                  size="full"
                  steps={chainRouteSteps(chain)}
                />
              )}
            </Panel>

            <Panel header={t("detail.descriptionField")}>
              <Typography size="sm" type="text" variant="secondary">
                {chain.description || "—"}
              </Typography>
            </Panel>

            <Stack align="center" direction="row" gap="100">
              <Typography size="sm" type="note" variant="secondary">
                {t("detail.enabledField")}
              </Typography>
              <Tag tone={chain.enabled ? "done" : "neutral"}>
                {chain.enabled ? t("list.enabledYes") : t("list.enabledNo")}
              </Tag>
            </Stack>
          </Stack>
        )}

        <Button intent="ghost" onClick={() => router.push("/work/chains" as Route)} size="sm">
          {t("detail.back")}
        </Button>
      </Stack>
    </Container>
  );
}
