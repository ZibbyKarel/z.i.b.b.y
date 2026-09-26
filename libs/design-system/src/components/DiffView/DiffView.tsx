import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { Typography } from "../Typography/Typography";

export type DiffLineType = "add" | "remove" | "context" | "header";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffHunk {
  /** e.g. `@@ -12,6 +12,8 @@` — rendered as a `header`-type line if given
   * separately from `lines`. */
  header?: string;
  lines: DiffLine[];
}

export interface DiffViewStat {
  files: number;
  additions: number;
  deletions: number;
}

export enum DiffViewTestId {
  Root = "diff-view-root",
  Stat = "diff-view-stat",
  Line = "diff-view-line",
}

/** Splits a unified-diff string into a single hunk of typed lines — `+`/`-`
 * (not `+++`/`---` file markers, which are dropped) become `add`/`remove`,
 * `@@ ... @@` becomes `header`, everything else is `context`. */
function parseUnified(unified: string): DiffHunk[] {
  const lines: DiffLine[] = unified
    .split("\n")
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
    .map((line) => {
      if (line.startsWith("@@")) return { type: "header", text: line };
      if (line.startsWith("+")) return { type: "add", text: line };
      if (line.startsWith("-")) return { type: "remove", text: line };
      return { type: "context", text: line };
    });
  return [{ lines }];
}

export interface DiffViewProps {
  hunks?: DiffHunk[];
  unified?: string;
  stat?: DiffViewStat;
  ref?: Ref<HTMLDivElement>;
}

const lineClass: Record<DiffLineType, string> = {
  add: "bg-elevated text-foreground",
  remove: "text-foreground-faint",
  context: "text-foreground",
  header: "text-foreground-faint",
};

/**
 * DS.md §8 diff/artifact viewer (the approval sheet's "ARTIFACT" panel) —
 * a monospace, whitespace-preserving line list. Deliberately monochrome to
 * match the mock (`+` lines get a filled background, `-` lines dim to
 * tertiary, no red/green): the whole DS avoids success/error hue except for
 * `StateTone`.
 */
export function DiffView({ hunks, unified, stat, ref }: DiffViewProps) {
  const resolvedHunks = hunks ?? (unified ? parseUnified(unified) : []);
  return (
    <div className="flex flex-col gap-2" data-testid={DiffViewTestId.Root} ref={ref}>
      {stat && (
        <Typography
          data-testid={DiffViewTestId.Stat}
          tracking="wider"
          type="labelSm"
          variant="tertiary"
        >
          {stat.files} {stat.files === 1 ? "file" : "files"} ·{" "}
          <span className="text-foreground">+{stat.additions}</span>{" "}
          <span className="text-foreground-faint">-{stat.deletions}</span>
        </Typography>
      )}
      <div className="overflow-x-auto border border-border bg-background py-2.5">
        {resolvedHunks.flatMap((hunk, hi) => [
          ...(hunk.header
            ? [
                <div
                  className={cn("px-3 whitespace-pre", lineClass.header)}
                  data-testid={DiffViewTestId.Line}
                  key={`${hi}-header`}
                >
                  <Typography type="code" variant="tertiary">
                    {hunk.header}
                  </Typography>
                </div>,
              ]
            : []),
          ...hunk.lines.map((line, li) => (
            <div
              className={cn("px-3 whitespace-pre", lineClass[line.type])}
              data-testid={DiffViewTestId.Line}
              key={`${hi}-${li}`}
            >
              <Typography
                as="span"
                type="code"
                variant={line.type === "remove" ? "tertiary" : "primary"}
              >
                {line.text || " "}
              </Typography>
            </div>
          )),
        ])}
      </div>
    </div>
  );
}
