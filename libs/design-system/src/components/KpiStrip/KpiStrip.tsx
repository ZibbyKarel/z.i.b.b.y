import type { ReactNode, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";

export enum KpiStripTestId {
  Root = "kpi-strip-root",
  Lead = "kpi-strip-lead",
  /** Suffixed with the KPI's `id`: `kpi-strip-kpi-needs`. */
  Kpi = "kpi-strip-kpi",
  Value = "kpi-strip-value",
}

export interface Kpi {
  id: string;
  label: string;
  value: string;
  /** Colour of the 7x7 square dot. */
  tone: StateTone;
}

const DOT: Record<StateTone, string> = {
  working: "bg-[var(--color-state-work)]",
  thinking: "bg-[var(--color-state-think)]",
  blocked: "bg-[var(--color-state-block)]",
  error: "bg-[var(--color-state-err)]",
  done: "bg-[var(--color-state-done)]",
  idle: "bg-[var(--color-state-idle)]",
};

export interface KpiStripProps {
  kpis: readonly Kpi[];
  /** Optional lead block (date kicker + paragraph) to the left of the KPIs. */
  lead?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/** The Briefing body: an optional lead block and a strip of KPIs, each behind a hairline. */
export function KpiStrip({ kpis, lead, ref }: KpiStripProps) {
  return (
    <div
      className="box-border flex h-full items-center gap-[32px] px-[var(--bridge-brief-px)] py-[var(--bridge-brief-py)]"
      data-testid={KpiStripTestId.Root}
      ref={ref}
    >
      {lead ? (
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]" data-testid={KpiStripTestId.Lead}>
          {lead}
        </div>
      ) : null}
      <div className={cn("flex flex-none flex-wrap gap-x-0 gap-y-[10px]", !lead && "flex-1")}>
        {kpis.map((k) => (
          <div
            className="flex flex-col gap-[4px] border-l border-line px-[var(--bridge-kpi-px)]"
            data-testid={`${KpiStripTestId.Kpi}-${k.id}`}
            key={k.id}
          >
            <span className="flex items-center gap-[6px] font-mono text-[10px] tracking-[.12em] whitespace-nowrap text-ink-3">
              <span className={cn("h-[7px] w-[7px]", DOT[k.tone])} />
              {k.label}
            </span>
            <span
              className="text-[length:var(--bridge-kpi-fs)] font-medium leading-[1.1] tabular-nums text-ink"
              data-testid={`${KpiStripTestId.Value}-${k.id}`}
            >
              {k.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
