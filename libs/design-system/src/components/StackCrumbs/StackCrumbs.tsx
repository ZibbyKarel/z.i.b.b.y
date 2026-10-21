import { cn } from "../../utils/cn";
import { type SheetTone, toneBorderLeft } from "../AnchoredSheet/sheetTone";

export enum StackCrumbsTestId {
  Root = "stack-crumbs-root",
  Label = "stack-crumbs-label",
  /** Suffixed with the crumb id. */
  Crumb = "stack-crumbs-crumb",
}

export interface StackCrumb {
  id: string;
  label: string;
  /** Colour of the crumb's 4px left border. */
  tone?: SheetTone;
  /** The open item: inverted (ink fill). */
  current?: boolean;
}

export interface StackCrumbsProps {
  /** Mono caption before the trail, e.g. `STACK`. */
  label: string;
  crumbs: readonly StackCrumb[];
}

/** `STACK  #1 → #2 → #3` breadcrumb with state-coloured left borders; the current crumb is inverted. */
export function StackCrumbs({ label, crumbs }: StackCrumbsProps) {
  return (
    <div
      className="mx-[20px] mt-[12px] flex flex-wrap items-center gap-[6px] font-mono text-[10px] tracking-[.1em]"
      data-testid={StackCrumbsTestId.Root}
    >
      <span className="mr-[4px] text-ink-3" data-testid={StackCrumbsTestId.Label}>
        {label}
      </span>
      {crumbs.map((c, i) => (
        <span className="contents" key={c.id}>
          <span
            className={cn(
              "border border-l-4 px-[8px] py-[3px]",
              c.current ? "border-ink bg-ink text-panel" : "border-line-2 bg-panel text-ink",
              toneBorderLeft[c.tone ?? "idle"],
            )}
            data-testid={`${StackCrumbsTestId.Crumb}-${c.id}`}
          >
            {c.label}
          </span>
          {i < crumbs.length - 1 ? <span className="text-ink-3">→</span> : null}
        </span>
      ))}
    </div>
  );
}
