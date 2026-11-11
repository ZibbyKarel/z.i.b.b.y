import type { ReactNode, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import type { SubNavLinkComponent } from "../SubNav/SubNav";

export enum KpiStripTestId {
  Root = "kpi-strip-root",
  Lead = "kpi-strip-lead",
  Kpis = "kpi-strip-kpis",
  /** Suffixed with the KPI's `id`: `kpi-strip-kpi-needs`. */
  Kpi = "kpi-strip-kpi",
  Value = "kpi-strip-value",
  /** A KPI with an `href`, suffixed with its `id`: `kpi-strip-link-needs`. */
  Link = "kpi-strip-link",
}

export interface Kpi {
  id: string;
  label: string;
  value: string;
  /** Colour of the 7x7 square dot. */
  tone: StateTone;
  /** Where the number leads ("more detail"); the whole KPI becomes a link. */
  href?: string;
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
  /** Router-aware anchor for KPI links (e.g. next/link); defaults to `<a>`. */
  linkComponent?: SubNavLinkComponent;
  ref?: Ref<HTMLDivElement>;
}

/** The Briefing body: an optional lead block and a strip of KPIs, each behind a hairline. */
export function KpiStrip({ kpis, lead, linkComponent, ref }: KpiStripProps) {
  const Link = linkComponent ?? "a";
  return (
    <div
      className="box-border flex h-full flex-wrap content-center items-center gap-x-[32px] gap-y-[12px] px-[var(--bridge-brief-px)] py-[var(--bridge-brief-py)]"
      data-testid={KpiStripTestId.Root}
      ref={ref}
    >
      {lead ? (
        <div
          className="flex min-w-[240px] flex-1 flex-col gap-[4px]"
          data-testid={KpiStripTestId.Lead}
        >
          {lead}
        </div>
      ) : null}
      <div
        className={cn(
          "flex max-w-full min-w-0 flex-none flex-wrap gap-x-0 gap-y-[10px]",
          !lead && "flex-1",
        )}
        data-testid={KpiStripTestId.Kpis}
      >
        {kpis.map((k) => {
          const body = (
            <>
              <span className="flex items-center gap-[6px] font-sans font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap text-ink-3">
                <span className={cn("h-[7px] w-[7px]", DOT[k.tone])} />
                {k.label}
              </span>
              <span
                className="text-[length:var(--bridge-kpi-fs)] font-medium leading-[1.1] tabular-nums text-ink"
                data-testid={`${KpiStripTestId.Value}-${k.id}`}
              >
                {k.value}
              </span>
            </>
          );
          return (
            <div
              className="flex flex-col gap-[4px] border-l border-line px-[var(--bridge-kpi-px)]"
              data-testid={`${KpiStripTestId.Kpi}-${k.id}`}
              key={k.id}
            >
              {k.href ? (
                <Link
                  className={cn(
                    "flex flex-col gap-[4px] rounded-sm no-underline hover:[&>span:last-child]:underline",
                    focusRing,
                  )}
                  data-testid={`${KpiStripTestId.Link}-${k.id}`}
                  href={k.href}
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
