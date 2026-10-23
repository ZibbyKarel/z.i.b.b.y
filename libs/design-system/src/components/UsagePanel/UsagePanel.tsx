import type { Ref } from "react";
import { cn } from "../../utils/cn";

export enum UsagePanelTestId {
  Root = "usage-panel-root",
  /** Suffixed with the item index, e.g. `usage-panel-item-0`. */
  Item = "usage-panel-item",
  Ring = "usage-panel-ring",
  Fill = "usage-panel-fill",
  Value = "usage-panel-value",
  Label = "usage-panel-label",
  Reset = "usage-panel-reset",
  Divider = "usage-panel-divider",
}

export interface UsagePanelItem {
  /** Short window label, e.g. `"5H"` or `"WEEK"` (rendered uppercase). */
  label: string;
  /** Used share of the window, 0–100. */
  value: number;
  /** Pre-formatted time until the window resets, e.g. `"2h 22m"`; omitted → no line. */
  resetsIn?: string;
}

export interface UsagePanelProps {
  items: readonly UsagePanelItem[];
  ref?: Ref<HTMLDivElement>;
}

const RING_SIZE = 34;
const RING_STROKE = 3;

/** Ring colour per usage band — the design's thresholds (≥90 rose, ≥75 amber, else emerald). */
function ringTone(pct: number): string {
  if (pct >= 90) return "stroke-bad";
  if (pct >= 75) return "stroke-warn";
  return "stroke-ok";
}

/**
 * The top bar's usage readout (Zibby 2.0 design `UsagePanel`): a rounded panel of
 * ring gauges — percentage inside the ring, the window label and its reset
 * countdown beside it — split by a hairline. Purely presentational: the caller
 * formats `resetsIn` (the DS is i18n-agnostic).
 */
export function UsagePanel({ items, ref }: UsagePanelProps) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      className="flex items-center gap-[14px] rounded-lg border border-line bg-panel px-[12px] py-[6px]"
      data-testid={UsagePanelTestId.Root}
      ref={ref}
    >
      {items.map((item, index) => {
        const pct = Math.max(0, Math.min(100, item.value));
        return (
          <div className="contents" key={item.label}>
            {index > 0 ? (
              <span
                aria-hidden
                className="h-[28px] w-px bg-line"
                data-testid={UsagePanelTestId.Divider}
              />
            ) : null}
            <div
              className="flex items-center gap-2"
              data-testid={`${UsagePanelTestId.Item}-${index}`}
            >
              <span
                aria-label={item.label}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(pct)}
                className="relative inline-flex size-[34px] shrink-0 items-center justify-center"
                data-testid={UsagePanelTestId.Ring}
                role="meter"
              >
                <svg
                  aria-hidden
                  className="absolute inset-0 -rotate-90"
                  height={RING_SIZE}
                  viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                  width={RING_SIZE}
                >
                  <circle
                    className="stroke-line-2"
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    fill="none"
                    r={r}
                    strokeWidth={RING_STROKE}
                  />
                  <circle
                    className={cn(
                      "transition-[stroke-dasharray] duration-400 ease-out",
                      ringTone(pct),
                    )}
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    data-testid={UsagePanelTestId.Fill}
                    fill="none"
                    r={r}
                    strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
                    strokeLinecap="round"
                    strokeWidth={RING_STROKE}
                  />
                </svg>
                <span
                  className="relative font-mono text-[10px] font-semibold tabular-nums text-ink"
                  data-testid={UsagePanelTestId.Value}
                >
                  {Math.round(pct)}%
                </span>
              </span>
              <span className="flex flex-col gap-px">
                <span
                  className="font-sans text-[9px] font-semibold uppercase tracking-[.14em] text-ink-3"
                  data-testid={UsagePanelTestId.Label}
                >
                  {item.label}
                </span>
                {item.resetsIn ? (
                  <span
                    className="font-mono text-[10px] tabular-nums text-ink-2"
                    data-testid={UsagePanelTestId.Reset}
                  >
                    −{item.resetsIn}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
