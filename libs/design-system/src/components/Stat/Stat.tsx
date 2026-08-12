import type { HTMLAttributes } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { Row, Stack } from "../Stack/Stack";
import { Icon, type IconName } from "../Icon/Icon";

/** The canonical {@link StateTone} palette, plus `neutral` for a non-live metric. */
export type StatTone = StateTone | "neutral";

export enum StatTestId {
  Root = "stat-root",
  Icon = "stat-icon",
  Value = "stat-value",
  Label = "stat-label",
}

const toneText: Record<StatTone, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  run: "text-run",
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
  return (
    <Row data-testid={StatTestId.Root} gap="150" ref={ref} {...props}>
      {icon && (
        <span className={cn("flex", toneText[tone])} data-testid={StatTestId.Icon}>
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
