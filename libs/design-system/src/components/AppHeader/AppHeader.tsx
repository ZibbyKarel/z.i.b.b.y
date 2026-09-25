import type { ReactNode, Ref } from "react";
import { LAYOUT } from "../../tokens";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Container } from "../Container/Container";
import { Row } from "../Stack/Stack";
import type { SubNavLinkComponent } from "../SubNav/SubNav";
import { Wordmark } from "../Wordmark/Wordmark";

export enum AppHeaderTestId {
  Root = "app-header-root",
  Wordmark = "app-header-wordmark",
  Nav = "app-header-nav",
  Operator = "app-header-operator",
  ActiveCount = "app-header-active-count",
  Limits = "app-header-limits",
  Search = "app-header-search",
  SearchShortcut = "app-header-search-shortcut",
  Settings = "app-header-settings",
}

export interface AppHeaderProps {
  /** Brand mark, leading the header. Defaults to `<Wordmark />`. */
  wordmark?: ReactNode;
  /** Section navigation — the app composes a `Tabs variant="mono"`. */
  nav?: ReactNode;
  /** Operator identity slot, trailing cluster. */
  operator?: ReactNode;
  /** Active-agent count slot, trailing cluster. */
  activeCount?: ReactNode;
  /** 5H / WEEK usage readout slot (a `LimitBar` pair), trailing cluster. */
  limits?: ReactNode;
  /** Search trigger label — the control itself is built in and always shows
   *  `⌘K`. Omit `onSearchClick` to not render the trigger at all. */
  searchLabel?: string;
  onSearchClick?: () => void;
  /** Settings link target, rendered as a `⚙` icon link. Omit to hide it. */
  settingsHref?: string;
  settingsLabel?: string;
  /** Overrides the rendered anchor for `settingsHref` — pass the app's
   *  `next/link` `Link`, same contract as `SubNav`/`Breadcrumb`. */
  linkComponent?: SubNavLinkComponent;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §5/§8 app shell top bar — a fixed `LAYOUT.headerHeight` (56px) band,
 * `--panel` background, a bottom hairline. Leading brand mark + section nav,
 * trailing operator/active-count/usage/search/settings cluster. Every
 * trailing slot the app owns is an opaque `ReactNode` (domain-neutral, no
 * `next/link` import here) except the search trigger and settings link,
 * which `AppHeader` renders itself so every screen gets the identical `⌘K`
 * affordance and gear icon for free (DS.md §8 "Search trigger").
 */
export function AppHeader({
  wordmark,
  nav,
  operator,
  activeCount,
  limits,
  searchLabel = "Search",
  onSearchClick,
  settingsHref,
  settingsLabel = "Settings",
  linkComponent,
  ref,
}: AppHeaderProps) {
  const SettingsLink = linkComponent ?? "a";
  return (
    <Row
      align="center"
      as="header"
      data-testid={AppHeaderTestId.Root}
      gap="200"
      ref={ref}
      style={{
        height: LAYOUT.headerHeight,
        padding: "0 20px",
        borderBottom: "1px solid var(--color-line)",
      }}
    >
      <div data-testid={AppHeaderTestId.Wordmark}>{wordmark ?? <Wordmark />}</div>

      <Container grow minW0 data-testid={AppHeaderTestId.Nav} height="100%">
        {nav}
      </Container>

      <Row align="center" gap="150" shrink={false}>
        {operator && <span data-testid={AppHeaderTestId.Operator}>{operator}</span>}
        {activeCount && <span data-testid={AppHeaderTestId.ActiveCount}>{activeCount}</span>}
        {limits && <span data-testid={AppHeaderTestId.Limits}>{limits}</span>}

        {onSearchClick && (
          <button
            aria-label={searchLabel}
            className={cn(
              "inline-flex items-center gap-3.5 border border-line-2 px-[10px] py-[6px]",
              "font-mono text-[11px] uppercase tracking-wider text-ink-2 transition-colors",
              "hover:border-ink hover:text-ink",
              focusRing,
            )}
            data-testid={AppHeaderTestId.Search}
            onClick={onSearchClick}
            type="button"
          >
            <span>{searchLabel}</span>
            <span className="text-ink-3" data-testid={AppHeaderTestId.SearchShortcut}>
              ⌘K
            </span>
          </button>
        )}

        {settingsHref && (
          <SettingsLink
            aria-label={settingsLabel}
            className={cn(
              "inline-flex items-center justify-center border border-line-2 px-[9px] py-[5px]",
              "text-ink transition-colors hover:border-ink",
              focusRing,
            )}
            data-testid={AppHeaderTestId.Settings}
            href={settingsHref}
          >
            <span aria-hidden="true">⚙</span>
          </SettingsLink>
        )}
      </Row>
    </Row>
  );
}
