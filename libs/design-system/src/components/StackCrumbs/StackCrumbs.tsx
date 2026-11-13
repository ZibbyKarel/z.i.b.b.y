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
  /** Makes the crumb a button (e.g. open that item). */
  onSelect?: () => void;
}

export interface StackCrumbsProps {
  /** Mono caption before the trail, e.g. `STACK`. */
  label: string;
  crumbs: readonly StackCrumb[];
}

const crumbClass = (c: StackCrumb) =>
  cn(
    "border border-l-4 px-[8px] py-[3px]",
    c.current ? "border-ink bg-ink text-panel" : "border-line-2 bg-panel text-ink",
    toneBorderLeft[c.tone ?? "idle"],
  );

/** `STACK  #1 → #2 → #3` breadcrumb with state-coloured left borders; the current crumb is inverted. */
export function StackCrumbs({ label, crumbs }: StackCrumbsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-[6px] font-sans uppercase tracking-wider text-[10px]"
      data-testid={StackCrumbsTestId.Root}
    >
      <span className="mr-[4px] text-ink-3" data-testid={StackCrumbsTestId.Label}>
        {label}
      </span>
      {crumbs.map((c, i) => (
        <span className="contents" key={c.id}>
          {c.onSelect ? (
            <button
              className={cn(crumbClass(c), "cursor-pointer hover:underline")}
              data-testid={`${StackCrumbsTestId.Crumb}-${c.id}`}
              onClick={c.onSelect}
              type="button"
            >
              {c.label}
            </button>
          ) : (
            <span className={crumbClass(c)} data-testid={`${StackCrumbsTestId.Crumb}-${c.id}`}>
              {c.label}
            </span>
          )}
          {i < crumbs.length - 1 ? <span className="text-ink-3">→</span> : null}
        </span>
      ))}
    </div>
  );
}
