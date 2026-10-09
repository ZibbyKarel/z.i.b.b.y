import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";

export enum ChatBubbleTestId {
  Root = "chat-bubble-root",
  Body = "chat-bubble-body",
  Actions = "chat-bubble-actions",
}

export interface ChatBubbleProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** `you` = right-aligned inverted bubble; `coo` = left-aligned outlined bubble. */
  author: "you" | "coo";
  children: ReactNode;
  /** Action row under the text (coo bubbles), e.g. CREATE TASK / OPEN FORM. */
  actions?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * One chat message bubble of the COO dock — square corners, 13px/1.4 text.
 * Width caps resolve against the (full-width) message list / aligning parent.
 */
export function ChatBubble({
  author,
  children,
  actions,
  ref,
  "data-testid": testId = ChatBubbleTestId.Root,
  ...props
}: ChatBubbleProps & { "data-testid"?: string }) {
  return (
    <div
      className={cn(
        "rounded-none px-[11px] py-[9px] text-[13px] leading-[1.4]",
        author === "you"
          ? "max-w-[80%] self-end bg-ink whitespace-pre-line text-panel"
          : "flex max-w-[86%] flex-col gap-2 self-start border border-line-2 bg-background",
      )}
      data-author={author}
      data-testid={testId}
      ref={ref}
      {...props}
    >
      <div
        className="[&_.md-prose]:text-[13px]! [&_.md-prose]:leading-[1.4]! [&_.wmde-markdown]:text-[13px]! [&_.wmde-markdown]:leading-[1.4]!"
        data-testid={ChatBubbleTestId.Body}
      >
        {children}
      </div>
      {actions && (
        <div className="flex gap-1.5" data-testid={ChatBubbleTestId.Actions}>
          {actions}
        </div>
      )}
    </div>
  );
}
