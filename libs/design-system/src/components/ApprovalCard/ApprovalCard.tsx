import { useState } from "react"
import { cn } from "../../lib/cn"
import type { Approval } from "../../domain"
import { Corners } from "../HudPanel/HudPanel"
import { Icon } from "../Icon/Icon"
import { StatusDot } from "../StatusDot/StatusDot"

export interface ApprovalCardProps {
  approval: Approval
  onApprove?: (approval: Approval) => void
  onReject?: (approval: Approval) => void
  className?: string
}

/**
 * Guardrail card: ZIBBY never clicks "order / pay" itself. Shows what the agent
 * wants to do with explicit Approve / Reject actions.
 */
export function ApprovalCard({
  approval,
  onApprove,
  onReject,
  className,
}: ApprovalCardProps) {
  const [done, setDone] = useState<"ok" | "no" | null>(null)

  return (
    <div
      className={cn(
        "relative rounded-sm border border-bad/30 bg-panel p-4 shadow-[0_0_0_1px_rgba(255,107,107,0.12),0_6px_24px_rgba(0,0,0,0.3)]",
        className,
      )}
    >
      <Corners inset={5} className="border-bad" />
      <div className="mb-3 flex items-center gap-2.5">
        <StatusDot tone="bad" pulse />
        <span className="font-mono text-sm font-semibold uppercase tracking-widest text-bad">
          Čeká na tvé schválení
        </span>
        <span className="ml-auto rounded-md border border-border px-2 py-0.5 font-mono text-xs text-foreground-faint">
          {approval.risk}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-accent/20 bg-accent-dim text-accent">
          <Icon name="cart" size={16} />
        </div>
        <div>
          <div className="text-md font-semibold text-foreground">
            <span className="font-mono text-accent">{approval.skill}</span>{" "}
            <span className="font-normal text-foreground-dim">chce</span> {approval.action}
          </div>
          <div className="mt-0.5 text-base text-foreground-dim">{approval.detail}</div>
        </div>
      </div>

      {done ? (
        <div
          className={cn(
            "mt-3 rounded-lg px-3 py-2.5 font-mono text-caption",
            done === "ok" ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad",
          )}
        >
          {done === "ok" ? "✓ Schváleno — agent pokračuje" : "✕ Zamítnuto — akce zrušena"}
        </div>
      ) : (
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              setDone("ok")
              onApprove?.(approval)
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-sm border-none bg-ok px-3 py-2.5 font-mono text-base font-semibold text-surface-0 shadow-[0_0_14px_rgba(57,217,138,0.27)] outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ok"
          >
            <Icon name="check" size={14} stroke={2.4} /> Schválit
          </button>
          <button
            type="button"
            onClick={() => {
              setDone("no")
              onReject?.(approval)
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-bad/40 bg-transparent px-3 py-2.5 font-mono text-base font-semibold text-bad outline-none hover:bg-bad/10 focus-visible:ring-2 focus-visible:ring-bad"
          >
            <Icon name="x" size={14} stroke={2.4} /> Zamítnout
          </button>
        </div>
      )}
    </div>
  )
}
