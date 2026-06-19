/* eslint-disable react/forbid-dom-props -- Letter spans use dynamic animation-delay and brand accent colour with no DS prop equivalent. */
import { ACCENT } from "./constants";

interface WordmarkProps {
  wordmark: string;
  testId: string;
}

export function Wordmark({ wordmark, testId }: WordmarkProps) {
  const chars = [...wordmark];
  return (
    <div className="mb-2 text-center text-[28px] font-bold tracking-[0.32em]" data-testid={testId}>
      {chars.map((ch, i) => {
        const isDot = ch === ".";
        return (
          <span
            className="animate-letter-in inline-block opacity-0"
            key={`${ch}-${i}`}
            style={{
              transform: "translateY(6px)",
              animationDelay: `${0.1 + i * 0.09}s`,
              ...(isDot ? { color: ACCENT, letterSpacing: 0 } : null),
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
}
