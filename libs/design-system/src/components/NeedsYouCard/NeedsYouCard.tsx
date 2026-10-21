import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export enum NeedsYouCardTestId {
  Root = "needs-you-card-root",
  Heading = "needs-you-card-heading",
  Wait = "needs-you-card-wait",
  Text = "needs-you-card-text",
  Rule = "needs-you-card-rule",
  Diff = "needs-you-card-diff",
  Approve = "needs-you-card-approve",
  Deny = "needs-you-card-deny",
}

export interface NeedsYouCardProps {
  /** Mono heading, e.g. `NEEDS YOU · PUSH`. */
  heading: string;
  /** Right-aligned wait, e.g. `WAITING 2H`. */
  wait?: string;
  text?: string;
  /** Mono policy line, e.g. `RULE · no-force-push`. */
  rule?: string;
  /** Mono diff block; `+` lines are ink, `-` / `@@` lines faint, the rest dim. */
  diff?: readonly string[];
  /** Fixed action pair: APPROVE (filled, 2/3) + DENY (outlined, 1/3). */
  onApprove?: () => void;
  onDeny?: () => void;
  approveLabel?: string;
  denyLabel?: string;
  /** Disables both actions (a decision is in flight). */
  pending?: boolean;
  /** Extra slot below (textarea + send, …). */
  children?: ReactNode;
}

const diffTone = (l: string) =>
  l.startsWith("+") ? "text-ink" : /^(-|@@)/.test(l) ? "text-ink-3" : "text-ink-2";

/**
 * "Needs you" card: 1px ink border, 4px blocked-tone left border, `--bg` fill. Heading + wait,
 * body text, optional rule + diff, then APPROVE / DENY (or any `children`). Sits in the sheet
 * gutter (margin 16px 20px 0).
 */
export function NeedsYouCard({
  heading,
  wait,
  text,
  rule,
  diff,
  onApprove,
  onDeny,
  approveLabel,
  denyLabel,
  pending = false,
  children,
}: NeedsYouCardProps) {
  return (
    <div
      className="mx-[20px] mt-[16px] flex flex-col gap-[8px] border border-l-4 border-ink border-l-state-block bg-bg p-[12px]"
      data-testid={NeedsYouCardTestId.Root}
    >
      <div className="flex items-center gap-[8px] font-mono text-[10px] tracking-[.14em]">
        <span className="font-semibold" data-testid={NeedsYouCardTestId.Heading}>
          {heading}
        </span>
        <span className="flex-1" />
        {wait ? (
          <span className="text-ink-2" data-testid={NeedsYouCardTestId.Wait}>
            {wait}
          </span>
        ) : null}
      </div>
      {text ? (
        <div
          className="text-[14px] leading-[1.4] [text-wrap:pretty]"
          data-testid={NeedsYouCardTestId.Text}
        >
          {text}
        </div>
      ) : null}
      {rule ? (
        <div
          className="font-mono text-[10px] tracking-[.1em] text-ink-3"
          data-testid={NeedsYouCardTestId.Rule}
        >
          {rule}
        </div>
      ) : null}
      {diff && diff.length > 0 ? (
        <div
          className="overflow-x-auto border border-line bg-panel px-[10px] py-[8px] font-mono text-[11px] leading-[1.5]"
          data-testid={NeedsYouCardTestId.Diff}
        >
          {diff.map((l, i) => (
            <div className={cn("whitespace-pre", diffTone(l))} key={i}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
      {children}
      {onApprove || onDeny ? (
        <div className="flex gap-[6px] font-mono text-[10px] tracking-[.12em]">
          {onApprove ? (
            <button
              className="flex-[2] cursor-pointer bg-ink p-[8px] text-center text-panel disabled:cursor-not-allowed disabled:opacity-35"
              data-testid={NeedsYouCardTestId.Approve}
              disabled={pending}
              onClick={onApprove}
              type="button"
            >
              {approveLabel}
            </button>
          ) : null}
          {onDeny ? (
            <button
              className="flex-1 cursor-pointer border border-line-2 p-[8px] text-center text-ink-2 hover:bg-panel-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
              data-testid={NeedsYouCardTestId.Deny}
              disabled={pending}
              onClick={onDeny}
              type="button"
            >
              {denyLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
