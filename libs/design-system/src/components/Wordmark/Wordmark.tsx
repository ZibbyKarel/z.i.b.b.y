import type { Ref } from "react";
import { Typography } from "../Typography/Typography";

export enum WordmarkTestId {
  Root = "wordmark-root",
  Name = "wordmark-name",
  Version = "wordmark-version",
}

export interface WordmarkProps {
  /** Overrides the default brand text. Rendered as written — never CSS-uppercased. */
  children?: string;
  /** Optional small second line under the name, e.g. the running release `v0.2.1`. */
  version?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §8 brand mark — `Typography`'s `wordmark` preset (mono 13 / 600), in
 * in the brand's own casing (`ZibbyOS`). Standalone in `AppHeader`'s leading slot
 * (optionally with the running `version` as an unobtrusive micro line below) and
 * animated (opacity only, the text itself never changes) inside `Splash`.
 */
export function Wordmark({ children = "ZibbyOS", version, ref }: WordmarkProps) {
  return (
    <span
      aria-label={version ? `${children} ${version}` : children}
      className="inline-flex flex-col"
      data-testid={WordmarkTestId.Root}
      ref={ref}
    >
      <Typography
        data-testid={WordmarkTestId.Name}
        tracking="wide"
        type="wordmark"
        uppercase={false}
      >
        {children}
      </Typography>
      {version && (
        <Typography data-testid={WordmarkTestId.Version} leading="tight" type="micro">
          {version}
        </Typography>
      )}
    </span>
  );
}
