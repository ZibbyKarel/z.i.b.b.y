import { cn } from "../../utils/cn";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
}

export function Divider({ orientation = "horizontal" }: DividerProps) {
  return (
    <span
      aria-hidden
      role="separator"
      className={cn(
        "bg-border",
        orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
      )}
    />
  );
}
