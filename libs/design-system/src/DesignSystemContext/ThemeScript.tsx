import { type ResolvedTheme, THEME_STORAGE_KEY } from "./DesignSystemProvider";

export enum ThemeScriptTestId {
  Root = "theme-script",
}

export interface ThemeScriptProps {
  /** Applied when there's no stored preference and no usable
   *  `prefers-color-scheme` query (old browsers, or the query throwing) — must
   *  match the app's own `DesignSystemProvider theme=` default. */
  fallback?: ResolvedTheme;
}

/**
 * Builds the inline no-flash theme script as a string (kept a plain function, not a
 * template literal at the call site, so both the tag body and a test can share it).
 * Reads the persisted choice from `localStorage` (mirrors `DesignSystemProvider`'s
 * own write — see `THEME_STORAGE_KEY`), falls back to `prefers-color-scheme`, and
 * sets `data-theme` on `<html>` **before** hydration — this is what avoids the
 * flash; `DesignSystemProvider`'s own effect keeps it correct afterwards (including
 * live `system` changes). Every branch is defensive: `localStorage`/`matchMedia`
 * can throw (private mode, disabled storage, an old browser) and must never leave
 * `<html>` without a `data-theme`.
 */
function buildThemeScriptSource(fallback: ResolvedTheme): string {
  return (
    `(function(){try{` +
    `var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `var t=(s==="light"||s==="dark")?s:` +
    `((window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":${JSON.stringify(fallback)});` +
    `document.documentElement.setAttribute("data-theme",t);` +
    `}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(fallback)});}` +
    `})();`
  );
}

/**
 * The no-flash theme script — render once in the root `<head>` (`apps/web/app/
 * layout.tsx`), ahead of any styled content. A plain server component: it renders a
 * synchronous inline `<script>`, no client JS of its own. See `DesignSystemProvider`
 * for the half that keeps `<html data-theme>` correct after hydration.
 */
export function ThemeScript({ fallback = "dark" }: ThemeScriptProps) {
  // The one sanctioned inline script: it must run synchronously before hydration,
  // which rules out a React-rendered client component (see the file doc comment).
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: buildThemeScriptSource(fallback) }}
      data-testid={ThemeScriptTestId.Root}
    />
  );
}

export { buildThemeScriptSource };
