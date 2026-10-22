import type { ReactNode } from "react";

export const atom: ReactNode = (
  <>
    <circle cx="12" cy="12" r="1.6" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
  </>
);
