"use client";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  GraphIconButton,
  GraphInlineInput,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";
import { BAD, BG0, LINE, mix } from "./canvas-tokens";

/** Shared floating-control wrapper centred on a canvas point. */
function FloatingControl({
  left,
  top,
  borderColor = LINE,
  testId,
  children,
}: {
  left: number;
  top: number;
  borderColor?: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Container
      data-testid={testId}
      left={`${left}px`}
      position="absolute"
      style={{
        transform: "translate(-50%,-50%)",
        background: BG0,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: "3px 5px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
      }}
      top={`${top}px`}
      zIndex={6}
    >
      {children}
    </Container>
  );
}

export interface FlowFileControlProps {
  left: number;
  top: number;
  value: string;
  onChange: (value: string) => void;
  onDelete: () => void;
  /** Detail view: render the filename as static text (no edit input, no disconnect). */
  readOnly?: boolean;
}

/** The hand-off filename floating on a flow edge (output → input); editable unless readOnly. */
export function FlowFileControl({
  left,
  top,
  value,
  onChange,
  onDelete,
  readOnly = false,
}: FlowFileControlProps) {
  const t = useTranslations("forms.pipeline");
  return (
    <FloatingControl left={left} testId="flow-file-control" top={top}>
      <Stack align="center" direction="row" gap="50">
        <Icon name="file" size="xs" tone="faint" />
        {readOnly ? (
          <Typography mono size="2xs" tone="accent" type="note">
            {value}
          </Typography>
        ) : (
          <>
            <GraphInlineInput
              aria-label={t("handoffFileAria")}
              onChange={(e) => onChange(e.target.value)}
              // Auto-width to the filename (monospace `size` = char count) so the pill grows
              // with the name instead of clipping at a fixed width; floored so it stays usable.
              size={Math.max(value.length, 6)}
              title={t("handoffHint")}
              value={value}
            />
            <GraphIconButton aria-label={t("disconnectAria")} onClick={onDelete}>
              <Icon name="x" size="xs" />
            </GraphIconButton>
          </>
        )}
      </Stack>
    </FloatingControl>
  );
}

export interface ReworkControlProps {
  left: number;
  top: number;
  maxRetries: number;
  escalate: boolean;
  onMaxRetries: (n: number) => void;
  onEscalate: (on: boolean) => void;
  onDelete: () => void;
  /** Detail view: render retries/escalate as static text (no steppers/toggle/remove). */
  readOnly?: boolean;
}

/** Max-retries stepper + escalate-effort toggle floating on a rework arc. */
export function ReworkControl({
  left,
  top,
  maxRetries,
  escalate,
  onMaxRetries,
  onEscalate,
  onDelete,
  readOnly = false,
}: ReworkControlProps) {
  const t = useTranslations("forms.pipeline");
  if (readOnly) {
    return (
      <FloatingControl borderColor={mix(BAD, 33)} left={left} testId="rework-control" top={top}>
        <Stack align="center" direction="row" gap="75">
          <Icon name="retry" size="sm" tone="bad" />
          <Typography mono size="2xs" tone="bad" type="note">
            {t("loopMax")} {maxRetries}
          </Typography>
          {escalate && (
            <Typography mono size="2xs" tone="warn" type="note">
              ↑ {t("escalateEffort")}
            </Typography>
          )}
        </Stack>
      </FloatingControl>
    );
  }
  return (
    <FloatingControl borderColor={mix(BAD, 33)} left={left} testId="rework-control" top={top}>
      <Stack align="center" direction="row" gap="75">
        <Icon name="retry" size="sm" tone="bad" />
        <Typography mono size="2xs" tone="bad" type="note">
          {t("loopMax")}
        </Typography>
        <Stack align="center" direction="row" gap="25">
          <GraphIconButton
            aria-label={t("retriesDownAria")}
            onClick={() => onMaxRetries(Math.max(0, maxRetries - 1))}
            variant="step"
          >
            −
          </GraphIconButton>
          <Typography
            mono
            size="xs"
            style={{ width: 14, textAlign: "center" }}
            type="note"
            weight="bold"
          >
            {maxRetries}
          </Typography>
          <GraphIconButton
            aria-label={t("retriesUpAria")}
            onClick={() => onMaxRetries(Math.min(9, maxRetries + 1))}
            variant="step"
          >
            +
          </GraphIconButton>
        </Stack>
        <Button
          intent={escalate ? "primary" : "ghost"}
          onClick={() => onEscalate(!escalate)}
          size="sm"
          tone="warn"
          type="button"
        >
          ↑ {t("escalateEffort")}
        </Button>
        <GraphIconButton aria-label={t("removeReworkAria")} onClick={onDelete}>
          <Icon name="x" size="xs" />
        </GraphIconButton>
      </Stack>
    </FloatingControl>
  );
}
