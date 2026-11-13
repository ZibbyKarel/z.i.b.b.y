import type { ReactNode } from "react";

/** opencode brand mark — its favicon's frame + inner block, scaled to 24, `currentColor`. */
export const opencode: ReactNode = (
  <>
    <path
      d="M18 19.5H6v-15h12zM15 7.5H9v9h6z"
      fill="currentColor"
      fillRule="evenodd"
      stroke="none"
    />
    <path d="M15 10.5v6H9v-6z" fill="currentColor" opacity={0.4} stroke="none" />
  </>
);
