import type { ReactNode, Ref } from "react";
import { LAYOUT } from "../../tokens";
import { cn } from "../../utils/cn";
import { focusRing, focusRingInset } from "../../utils/focus";
import { Container } from "../Container/Container";
import { Row } from "../Stack/Stack";
import type { SubNavLinkComponent } from "../SubNav/SubNav";
import { Wordmark } from "../Wordmark/Wordmark";

export enum AppHeaderTestId {
  Root = "app-header-root",
  Wordmark = "app-header-wordmark",
  HomeLink = "app-header-home-link",
  Nav = "app-header-nav",
  Operator = "app-header-operator",
  ActiveCount = "app-header-active-count",
  Limits = "app-header-limits",
  Pin = "app-header-pin",
  Notifications = "app-header-notifications",
  Search = "app-header-search",
  SearchShortcut = "app-header-search-shortcut",
  Menu = "app-header-menu",
}

export interface AppHeaderProps {
  /** Brand mark, leading the header. Defaults to `<Wordmark />`. */
  wordmark?: ReactNode;
  /** Href the brand mark (glyph + wordmark) links to. Omit to render it inert. */
  homeHref?: string;
  /** Accessible name for the brand mark link (only used when `homeHref` is set). */
  homeLabel?: string;
  /** Section navigation — the app composes a `Tabs variant="mono"`. Auto
   *  width (never grows) — the center search region absorbs the rest. */
  nav?: ReactNode;
  /** Operator identity slot, trailing cluster. */
  operator?: ReactNode;
  /** Active-agent count slot, trailing cluster. */
  activeCount?: ReactNode;
  /** 5H / WEEK usage readout slot (a `LimitBar` pair), trailing cluster. */
  limits?: ReactNode;
  /** Current-page pin toggle slot (an app-composed icon `Button`), trailing
   *  cluster — between the usage readout and the notification bell. */
  pin?: ReactNode;
  /** Notification bell slot, trailing cluster. */
  notifications?: ReactNode;
  /** ⋮ overflow menu slot (an `app`-composed `MenuButton variant="bordered"`),
   *  trailing cluster — last. Carries page-pin + settings/registries actions. */
  menu?: ReactNode;
  /** Search trigger label — the control itself is built in and always shows
   *  `⌘K`. Omit `onSearchClick` to not render the trigger at all — the
   *  center region still reserves its space either way, so the layout never
   *  shifts when a screen opts out of search. */
  searchLabel?: string;
  onSearchClick?: () => void;
  /** Overrides the rendered anchor for `homeHref` — pass the app's
   *  `next/link` `Link`, same contract as `SubNav`/`Breadcrumb`. */
  linkComponent?: SubNavLinkComponent;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §5/§8 app shell top bar — a fixed `LAYOUT.headerHeight` (56px) band,
 * `--panel` background, a bottom hairline. Leading brand mark (linking home,
 * ZB-01) + auto-width section nav, a centered search trigger (`flex:1`
 * region, ZB-06), and a trailing operator/active-count/usage/pin/notifications/⋮
 * cluster. Every trailing slot the app owns is an opaque `ReactNode`
 * (domain-neutral, no `next/link` import here) except the search trigger,
 * which `AppHeader` renders itself so every screen gets the identical `⌘K`
 * affordance for free (DS.md §8 "Search trigger"). Settings/Registries now
 * live in the `menu` slot's ⋮ overflow (an app-composed `MenuButton
 * variant="bordered"`) instead of a dedicated top-bar control.
 */
export function AppHeader({
  wordmark,
  homeHref,
  homeLabel = "ZibbyCorp",
  nav,
  operator,
  activeCount,
  limits,
  pin,
  notifications,
  menu,
  searchLabel = "Search",
  onSearchClick,
  linkComponent,
  ref,
}: AppHeaderProps) {
  const HomeLink = linkComponent ?? "a";
  const mark = wordmark ?? <Wordmark />;
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
      <div data-testid={AppHeaderTestId.Wordmark}>
        {homeHref ? (
          <HomeLink
            aria-label={homeLabel}
            className={cn("inline-flex items-center", focusRingInset)}
            data-testid={AppHeaderTestId.HomeLink}
            href={homeHref}
          >
            {mark}
          </HomeLink>
        ) : (
          mark
        )}
      </div>

      <Container data-testid={AppHeaderTestId.Nav} height="100%" shrink={false}>
        {nav}
      </Container>

      <Container grow minW0 style={{ display: "flex", justifyContent: "center" }}>
        {onSearchClick && (
          <button
            aria-label={searchLabel}
            className={cn(
              "inline-flex h-8 w-[340px] max-w-full items-center justify-between gap-3.5",
              "border border-line-2 bg-background px-3",
              "font-mono text-[11px] uppercase tracking-wider text-ink-2 transition-colors",
              "hover:border-ink",
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
      </Container>

      <Row align="center" gap="150" shrink={false}>
        {operator && <span data-testid={AppHeaderTestId.Operator}>{operator}</span>}
        {activeCount && <span data-testid={AppHeaderTestId.ActiveCount}>{activeCount}</span>}
        {limits && <span data-testid={AppHeaderTestId.Limits}>{limits}</span>}
        {pin && <span data-testid={AppHeaderTestId.Pin}>{pin}</span>}
        {notifications && <span data-testid={AppHeaderTestId.Notifications}>{notifications}</span>}
        {menu && <span data-testid={AppHeaderTestId.Menu}>{menu}</span>}
      </Row>
    </Row>
  );
}
