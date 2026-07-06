import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Stack } from "../Stack/Stack";
import { Pressable } from "../Pressable/Pressable";

export type AlertSeverity = "info" | "ok" | "warn" | "error";

export enum AlertTestId {
  Root = "alert-root",
  Title = "alert-title",
  CloseButton = "alert-close-button",
}

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "className"> {
  severity?: AlertSeverity;
  title?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}

const severityClasses: Record<AlertSeverity, string> = {
  info: "text-work bg-work/10 border-work/25",
  ok: "text-ok bg-ok/10 border-ok/25",
  warn: "text-warn bg-warn/10 border-warn/25",
  error: "text-bad bg-bad/10 border-bad/25",
};

/** Severities that interrupt/warn get the assertive `alert` role; informational
 *  ones get the polite `status` role — screen readers announce `alert` content
 *  immediately, which would be noisy for routine info/ok messages. */
const roleBySeverity: Record<AlertSeverity, "alert" | "status"> = {
  info: "status",
  ok: "status",
  warn: "alert",
  error: "alert",
};

export function Alert({ severity = "info", title, onClose, children, ...rest }: AlertProps) {
  return (
    <div
      data-testid={AlertTestId.Root}
      {...rest}
      className={cn("px-[14px] py-[10px] rounded border", severityClasses[severity])}
      role={roleBySeverity[severity]}
    >
      <Stack direction="row" gap="150">
        <div className="flex-1 text-base leading-relaxed">
          {title && (
            <div className="font-semibold mb-0.5" data-testid={AlertTestId.Title}>
              {title}
            </div>
          )}
          {children}
        </div>
        {onClose && (
          <Pressable aria-label="Dismiss" data-testid={AlertTestId.CloseButton} onClick={onClose}>
            ✕
          </Pressable>
        )}
      </Stack>
    </div>
  );
}
