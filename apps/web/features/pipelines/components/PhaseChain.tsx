"use client";

import {
  type Agent,
  DEFAULT_VERIFY_CHECKS,
} from "@zibby/contracts";
import {
  Card,
  Container,
  Divider,
  Icon,
  IconTile,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ModelBadge, ThinkBadge } from "../../../components/RuntimeBadges/RuntimeBadges";
import {
  type Pipeline,
  type PipelinePhase,
  glyphForPhase,
} from "../../../domain";

function IoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Stack align="center" direction="row" gap="75">
      <Container shrink={false} width="30px">
        <Typography mono size="2xs" type="note" variant="tertiary">
          {label}
        </Typography>
      </Container>
      <Container grow minW0>
        <Typography
          mono
          truncate
          size="xs"
          tone={accent ? "accent" : undefined}
          type="note"
          variant={accent ? undefined : "secondary"}
        >
          {value}
        </Typography>
      </Container>
    </Stack>
  );
}

/** Stage-run tally per phase id (escalation markers excluded) for "attempt n/m". */
export function attemptsFromStageRuns(
  stageRuns: ReadonlyArray<{ phaseId: string; runId: string }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of stageRuns) {
    if (s.runId.endsWith(".escalated")) continue;
    out[s.phaseId] = (out[s.phaseId] ?? 0) + 1;
  }
  return out;
}

function PhaseNode({
  phase,
  agents,
  idx,
  active,
  attempt,
}: {
  phase: PipelinePhase;
  agents: Agent[];
  idx: number;
  active: boolean;
  /** Current attempt count from a live run, when one is supplied. */
  attempt?: number;
}) {
  const t = useTranslations("phase");
  const isVerify = phase.type === "verify";
  return (
    <Card
      radius="default"
      selected={active}
      // Grow to fill when the chain fits; never shrink below a readable width —
      // long chains overflow into the horizontal scroller instead of squishing.
      style={{ flex: "1 0 158px", minWidth: "158px" }}
    >
      <Container padding="150">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100">
            <IconTile glyph={glyphForPhase(phase, agents)} size="sm" />
            <Container minW0>
              <Typography
                mono
                size="2xs"
                tracking="wider"
                type="note"
                variant="tertiary"
              >
                {t("phaseLabel", { n: idx + 1 })}
              </Typography>
              <Typography mono nowrap size="base" type="note" weight="semibold">
                {isVerify ? t("verifyLabel") : phase.agent}
              </Typography>
            </Container>
            {phase.loop && attempt !== undefined && (
              <Tag title={t("attemptTitle")} tone="warn">
                {t("attempt", { n: attempt, max: phase.loop.maxRetries + 1 })}
              </Tag>
            )}
          </Stack>
          {isVerify ? (
            <>
              <Stack wrap direction="row" gap="75">
                <Tag title={t("checksTitle")} tone="neutral">
                  {t("checksLabel")}
                </Tag>
              </Stack>
              <Divider />
              <Stack data-testid="phase-verify-checks" gap="75">
                {(phase.commands ?? [...DEFAULT_VERIFY_CHECKS]).map((cmd) => (
                  <IoRow key={cmd} label="$" value={cmd} />
                ))}
              </Stack>
            </>
          ) : (
            <>
              <Stack wrap direction="row" gap="75">
                <ModelBadge model={phase.model} />
                <ThinkBadge level={phase.thinking} />
              </Stack>
              <Divider />
              <Stack gap="75">
                <IoRow label={t("input")} value={phase.consumes ?? ""} />
                <IoRow
                  accent
                  label={t("output")}
                  value={phase.produces ?? ""}
                />
              </Stack>
            </>
          )}
        </Stack>
      </Container>
    </Card>
  );
}

export interface PhaseChainProps {
  pipeline: Pipeline;
  agents: Agent[];
  /** Per-phase attempt counts from a current run (phase id → count). */
  attempts?: Record<string, number>;
}

export function PhaseChain({ pipeline, agents, attempts }: PhaseChainProps) {
  const t = useTranslations("phase");
  const { phases } = pipeline;
  const n = phases.length;

  // Back-edge geometry, generalised so the loop arc tracks the real node centres
  // (node i centre ≈ ((i + 0.5) / n) of the chain width) for any phase count.
  const loopIdx = phases.findIndex((p) => p.loop);
  const loopPhase = loopIdx >= 0 ? phases[loopIdx] : undefined;
  const cx = (i: number) => ((i + 0.5) / Math.max(n, 1)) * 100;
  let targetIdx = loopPhase?.loop
    ? phases.findIndex((p) => p.id === loopPhase.loop!.to)
    : -1;
  if (loopPhase && targetIdx < 0) targetIdx = Math.max(loopIdx - 1, 0);
  const x1 = cx(loopIdx);
  const x2 = cx(targetIdx);

  // Hidden-content affordance: detect clipped chain on either side of the
  // horizontal scroller and fade that edge in/out as it scrolls or resizes.
  const scrollRef = useRef<HTMLElement | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const checkEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < max - 2;
    setEdge((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);
  useEffect(() => {
    checkEdges();
    const el = scrollRef.current;
    if (!el) return;
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(checkEdges);
      ro.observe(el);
    }
    window.addEventListener("resize", checkEdges);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", checkEdges);
    };
  }, [checkEdges, n]);

  return (
    <Container position="relative">
      <Container
        data-testid="phase-chain-scroll"
        onScroll={checkEdges}
        overflowX="auto"
        overflowY="hidden"
        ref={scrollRef}
        style={{ paddingBottom: 2 }}
      >
        <Container minWidth="fit-content">
          {loopPhase?.loop && (
            <Container height="34px" position="relative">
              <svg
                aria-hidden
                preserveAspectRatio="none"
                // eslint-disable-next-line react/forbid-dom-props
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                }}
                viewBox="0 0 100 34"
              >
                <path
                  d={`M${x1} 30 C ${x1} 6, ${x2} 6, ${x2} 30`}
                  fill="none"
                  stroke="var(--color-bad)"
                  strokeDasharray="3 3"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <path d={`M${x2} 30 l 2.6 -5 l -5.2 0 z`} fill="var(--color-bad)" />
              </svg>
              <Container
                left={`${(x1 + x2) / 2}%`}
                position="absolute"
                style={{ transform: "translateX(-50%)" }}
                top="0"
              >
                <Stack align="center" direction="row" gap="75">
                  <Icon name="retry" size="xs" tone="bad" />
                  <Typography mono nowrap size="xs" tone="bad" type="note">
                    {t("retry", { n: loopPhase.loop.maxRetries })}
                  </Typography>
                </Stack>
              </Container>
            </Container>
          )}
          <Stack align="stretch" direction="row" gap="25">
            {phases.map((ph, i) => (
              <Fragment key={`${ph.agent ?? ph.type}-${i}`}>
                <PhaseNode
                  active={Boolean(ph.loop)}
                  agents={agents}
                  attempt={ph.id ? attempts?.[ph.id] : undefined}
                  idx={i}
                  phase={ph}
                />
                {i < phases.length - 1 && (
                  <Stack
                    align="center"
                    justify="center"
                    shrink={false}
                    style={{ alignSelf: "center" }}
                  >
                    <Container padding={["0", "50"]}>
                      <Stack align="center" gap="50">
                        <Typography
                          mono
                          nowrap
                          size="2xs"
                          type="note"
                          variant="tertiary"
                        >
                          {phases[i + 1]!.consumes ?? ""}
                        </Typography>
                        <Icon name="arrow" size="md" tone="faint" />
                      </Stack>
                    </Container>
                  </Stack>
                )}
              </Fragment>
            ))}
          </Stack>
        </Container>
      </Container>

      {/* left fade — appears once the chain is scrolled off its start */}
      <Container
        bottom="0"
        left="0"
        pointerEvents="none"
        position="absolute"
        style={{
          opacity: edge.left ? 1 : 0,
          transition: "opacity .15s",
          background:
            "linear-gradient(to right, var(--color-surface), transparent)",
        }}
        top="0"
        width="56px"
        zIndex={3}
      />
      {/* right fade + chevron — signals more phases beyond the right edge */}
      <Container
        bottom="0"
        pointerEvents="none"
        position="absolute"
        right="0"
        style={{
          opacity: edge.right ? 1 : 0,
          transition: "opacity .15s",
          background:
            "linear-gradient(to left, var(--color-surface), transparent)",
        }}
        top="0"
        width="56px"
        zIndex={3}
      >
        <Stack
          align="center"
          justify="end"
          style={{ height: "100%", paddingRight: 4 }}
        >
          <Container
            height="22px"
            style={{
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "var(--color-accent-dim)",
              border: "1px solid var(--color-accent-glow)",
            }}
            width="22px"
          >
            <Icon name="arrow" size="sm" tone="accent" />
          </Container>
        </Stack>
      </Container>
    </Container>
  );
}
