import type { Ref } from "react";
import { Typography } from "../Typography/Typography";

export enum WordmarkTestId {
  Root = "wordmark-root",
}

export interface WordmarkProps {
  /** Overrides the default brand text. */
  children?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §8 brand mark — `Typography`'s `wordmark` preset (mono 13 / 600 /
 * `.18em`, uppercase). Standalone in `AppHeader`'s leading slot and animated
 * (opacity only, the text itself never changes) inside `Splash`.
 */
export function Wordmark({ children = "ZIBBYCORP", ref }: WordmarkProps) {
  return (
    <Typography aria-label={children} data-testid={WordmarkTestId.Root} ref={ref} type="wordmark">
      {children}
    </Typography>
  );
}
