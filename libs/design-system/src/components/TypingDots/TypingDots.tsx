import { cn } from "../../utils/cn";

export enum TypingDotsTestId {
  Root = "typing-dots-root",
  Dot = "typing-dots-dot",
}

export interface TypingDotsProps {
  /** Accessible label announced while the indicator shows (e.g. "ZIBBY píše…"). */
  label: string;
}

/** Per-dot stagger via a Tailwind arbitrary property, not inline `style` — the
 *  three delays are fixed, so there is nothing genuinely dynamic to pass through. */
const DOT_DELAYS = ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"];

/**
 * Three bouncing dots — the reply is being composed, before any text has
 * streamed in. Square and matte per DS.md §7 (no glow — that's `StatusDot`'s
 * living-tone behaviour, not a general-purpose loading mark).
 */
export function TypingDots({ label }: TypingDotsProps) {
  return (
    <span
      aria-label={label}
      className="inline-flex items-center gap-1"
      data-testid={TypingDotsTestId.Root}
      role="status"
    >
      {DOT_DELAYS.map((delay) => (
        <span
          className={cn(
            "h-[5px] w-[5px] animate-bounce bg-foreground-dim motion-reduce:animate-none",
            delay,
          )}
          data-testid={TypingDotsTestId.Dot}
          key={delay}
        />
      ))}
    </span>
  );
}
