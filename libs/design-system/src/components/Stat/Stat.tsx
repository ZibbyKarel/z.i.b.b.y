import type { HTMLAttributes } from "react";
import { type AnyStateTone, type StateTone, normalizeToneLike } from "../../stateTone";
import { cn } from "../../utils/cn";
import { Row, Stack } from "../Stack/Stack";
import { Icon, type IconName } from "../Icon/Icon";

/** The canonical {@link StateTone} palette (or the legacy vocabulary — see
 *  {@link AnyStateTone}), plus `neutral` for a non-live metric. */
export type StatTone = AnyStateTone | "neutral";

export enum StatTestId {
  Root = "stat-root",
  Icon = "stat-icon",
  Value = "stat-value",
  Label = "stat-label",
}

// Keyed by the canonical `StateTone` (+ `neutral`) — legacy classes reused where the
// color is identical (LEGACY_TONE_MAP). See `Stat()` for the resolve step.
const toneText: Record<StateTone | "neutral", string> = {
  thinking: "text-accent",
  done: "text-ok",
  blocked: "text-warn",
  error: "text-bad",
  working: "text-run",
  idle: "text-state-idle",
  neutral: "text-foreground-dim",
};

export interface StatProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  value: string | number;
  label: string;
  icon?: IconName;
  tone?: StatTone;
  ref?: React.Ref<HTMLDivElement>;
}

/** A single headline metric: glyph + big mono number + caption. */
export function Stat({ value, label, icon, tone = "neutral", ref, ...props }: StatProps) {
  const resolvedTone = normalizeToneLike(tone);
  return (
    <Row data-testid={StatTestId.Root} gap="150" ref={ref} {...props}>
      {icon && (
        <span className={cn("flex", toneText[resolvedTone])} data-testid={StatTestId.Icon}>
          <Icon name={icon} size="md" />
        </span>
      )}
      <Stack gap="50">
        <div
          className="whitespace-nowrap font-mono text-4xl font-bold leading-none text-foreground"
          data-testid={StatTestId.Value}
        >
          {value}
        </div>
        <div
          className="whitespace-nowrap text-sm tracking-wide text-foreground-faint"
          data-testid={StatTestId.Label}
        >
          {label}
        </div>
      </Stack>
    </Row>
  );
}
