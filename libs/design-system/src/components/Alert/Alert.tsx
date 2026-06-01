import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type AlertSeverity = "info" | "ok" | "warn" | "error";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "className"> {
  severity?: AlertSeverity;
  title?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}

const severityClasses: Record<AlertSeverity, string> = {
  info:  "text-work bg-work/10 border-work/25",
  ok:    "text-ok bg-ok/10 border-ok/25",
  warn:  "text-warn bg-warn/10 border-warn/25",
  error: "text-bad bg-bad/10 border-bad/25",
};

export function Alert({ severity = "info", title, onClose, children, ...rest }: AlertProps) {
  return (
    <div
      {...rest}
      role="alert"
      className={cn(
        "flex gap-[10px] px-[14px] py-[10px] rounded border",
        severityClasses[severity],
      )}
    >
      <div className="flex-1 text-base leading-relaxed">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        {children}
      </div>
      {onClose && (
        <button
          aria-label="Dismiss"
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer text-current p-0 leading-none"
        >
          ✕
        </button>
      )}
    </div>
  );
}
