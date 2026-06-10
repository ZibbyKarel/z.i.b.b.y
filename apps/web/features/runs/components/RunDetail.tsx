import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Container, type IconName, IconTile, Stack, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { relativeTime } from "../../../utils/time";
import type { RunView } from "../run";
import { RunStateBadge } from "./RunStateBadge";
import { RunLogStream } from "./RunLogStream";

export interface RunDetailProps {
  run: RunView;
  glyph: IconName;
  now: number;
  onStop: () => void;
  stopping: boolean;
  onDelete: () => void;
  deleting: boolean;
}

function MetaCell({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <Stack gap="25">
      <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
        {label}
      </Typography>
      <Typography mono size="sm" tone={tone} type="note" weight="semibold">
        {value}
      </Typography>
    </Stack>
  );
}

/** Run detail: header + meta strip + live log (or, for pipelines, a link out). */
export function RunDetail({ run, glyph, now, onStop, stopping, onDelete, deleting }: RunDetailProps) {
  const t = useTranslations("runs");
  const router = useRouter();
  const tone: "accent" | "ok" | "warn" | "bad" | undefined =
    run.status === "running"
      ? "accent"
      : run.status === "awaiting-approval"
        ? "warn"
        : run.status === "done"
          ? "ok"
          : run.status === "error"
            ? "bad"
            : undefined;
  const ago = (n: number, unit: string) => (n === 0 ? t("agoNow") : unit === "m" ? t("agoM", { n }) : t("agoH", { n }));

  return (
    <Stack gap="200">
      <HudPanel padding="300" tone={tone}>
        <Stack gap="200">
          <Stack wrap align="start" direction="row" gap="150" justify="between">
            <Stack align="start" direction="row" gap="150">
              <IconTile glyph={glyph} size="lg" />
              <Container minW0>
                <Stack gap="50">
                  <Stack wrap align="center" direction="row" gap="100">
                    <Typography type="subtitle" weight="semibold">
                      {run.owner}
                    </Typography>
                    <RunStateBadge canonTitle={run.status} label={t(`state.${run.status}`)} size="md" status={run.status} />
                  </Stack>
                  {run.prompt && (
                    <Typography leading="snug" size="sm" type="text" variant="secondary">
                      {run.prompt}
                    </Typography>
                  )}
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {run.runId} · {t(`kind.${run.kind}`)} · {run.status}
                  </Typography>
                </Stack>
              </Container>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              {run.status === "running" && (
                <Button disabled={stopping} icon="stop" intent="reject" onClick={onStop} size="sm">
                  {t("stop")}
                </Button>
              )}
              {run.status === "awaiting-approval" && (
                <Button icon="shield" intent="run" onClick={() => router.push("/approvals")} size="sm">
                  {t("decide")}
                </Button>
              )}
              <Button disabled={deleting} icon="x" intent="reject" onClick={onDelete} size="sm">
                {t("delete")}
              </Button>
            </Stack>
          </Stack>

          <Stack wrap direction="row" gap="300">
            {run.project && <MetaCell label={t("metaProject")} tone="accent" value={run.project} />}
            <MetaCell label={t("metaStarted")} value={relativeTime(run.startedAt, now, ago)} />
            <MetaCell label={t("metaKind")} value={t(`kind.${run.kind}`)} />
          </Stack>
        </Stack>
      </HudPanel>

      {run.logBase ? (
        <HudPanel padding="250" title={t("output")}>
          <RunLogStream
            linesLabel={(n) => t("lines", { n })}
            liveLabel={t("liveLog")}
            logLabel={t("log")}
            run={run}
          />
        </HudPanel>
      ) : (
        <HudPanel padding="300">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Typography mono size="sm" type="note" variant="secondary">
              {t("pipelineNote")}
            </Typography>
            <Button icon="flow" intent="ghost" onClick={() => router.push(`/pipelines/${run.owner}`)} size="sm">
              {t("openPipeline")}
            </Button>
          </Stack>
        </HudPanel>
      )}
    </Stack>
  );
}
