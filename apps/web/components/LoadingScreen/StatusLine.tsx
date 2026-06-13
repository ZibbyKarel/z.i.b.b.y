/* eslint-disable react/forbid-dom-props -- Outer wrapper uses animation-delay inline style with no DS prop equivalent. */
interface StatusLineProps {
  status?: string;
  testId: string;
}

export function StatusLine({ status, testId }: StatusLineProps) {
  return (
    <div
      className="animate-fade-up h-4 min-w-[260px] overflow-hidden text-center text-[10px] tracking-[0.12em] text-accent opacity-0"
      style={{ animationDelay: "2s" }}
    >
      {status && (
        <span
          className="animate-status-in inline-block"
          data-testid={testId}
          key={status}
        >
          {status}
        </span>
      )}
    </div>
  );
}
