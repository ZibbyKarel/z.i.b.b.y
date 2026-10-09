import type { ReactNode, Ref } from "react";

export enum InputFrameTestId {
  Root = "input-frame-root",
  Start = "input-frame-start",
  Body = "input-frame-body",
  End = "input-frame-end",
}

export interface InputFrameProps {
  /** Leading control (e.g. attach button). */
  start?: ReactNode;
  /** Trailing control (e.g. mic button). */
  end?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/** The framed one-line composer box: `start | input | end`, hairline border, square corners. */
export function InputFrame({ start, end, children, ref }: InputFrameProps) {
  return (
    <div
      className="flex min-h-[34px] min-w-0 flex-1 items-center border border-line-2 bg-background"
      data-testid={InputFrameTestId.Root}
      ref={ref}
    >
      {start && (
        <div className="flex shrink-0 items-center" data-testid={InputFrameTestId.Start}>
          {start}
        </div>
      )}
      <div className="min-w-0 flex-1 px-1" data-testid={InputFrameTestId.Body}>
        {children}
      </div>
      {end && (
        <div className="flex shrink-0 items-center" data-testid={InputFrameTestId.End}>
          {end}
        </div>
      )}
    </div>
  );
}
