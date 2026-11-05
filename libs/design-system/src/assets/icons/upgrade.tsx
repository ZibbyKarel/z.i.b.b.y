import type { ReactNode } from "react";

/** A circle with an up-arrow inside — "a newer release is available". */
export const upgrade: ReactNode = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" />
  </>
);
