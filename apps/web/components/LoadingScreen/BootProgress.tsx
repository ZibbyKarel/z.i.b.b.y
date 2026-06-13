/* eslint-disable react/forbid-dom-props -- Leading-edge node and tick marks use dynamic computed inline styles with no DS prop equivalent. */
import { Progress } from "@zibby/design-system";
import { TICKS } from "./constants";

interface BootProgressProps {
  pct: number;
  status?: string;
  testId: string;
}

export function BootProgress({ pct, status, testId }: BootProgressProps) {
  return (
    <div className="animate-fade-up mb-4 w-[260px] opacity-0" style={{ animationDelay: "1.8s" }}>
      <div className="relative" data-testid={testId}>
        <Progress height="25" label={status ?? "Loading"} value={pct} />
        <div
          aria-hidden="true"
          className="absolute top-1/2 rounded-full"
          style={{
            left: `${pct}%`,
            height: 8,
            width: 8,
            marginLeft: -4,
            marginTop: -4,
            background: "#7eb0ff",
            boxShadow: "0 0 10px 3px rgba(91,141,239,0.9)",
            transition: "left 0.12s linear",
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between">
        {Array.from({ length: TICKS }, (_, i) => (
          <span
            className="block h-1 w-px"
            key={`tick-${i}`}
            style={{ background: "rgba(255,255,255,0.1)" }}
          />
        ))}
      </div>
    </div>
  );
}
