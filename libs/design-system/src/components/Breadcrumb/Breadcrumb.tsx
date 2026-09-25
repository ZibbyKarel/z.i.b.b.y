import { Fragment } from "react";
import { Row } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";
import type { SubNavLinkComponent } from "../SubNav/SubNav";

export enum BreadcrumbTestId {
  Root = "breadcrumb-root",
  Item = "breadcrumb-item",
  Separator = "breadcrumb-separator",
  Current = "breadcrumb-current",
}

export interface BreadcrumbItem {
  label: string;
  /** Omit on the last item (or any non-navigable ancestor) to render plain text. */
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Overrides the rendered anchor for items with an `href` — pass the app's
   *  `next/link` `Link` to get client-side navigation. Defaults to a plain `<a>`. */
  linkComponent?: SubNavLinkComponent;
}

/**
 * DS.md §3.2 mono trail for detail pages — a `nav` landmark with `aria-current`
 * on the last crumb. Every non-last item with an `href` renders as a link
 * (through the overridable `linkComponent`, same contract as {@link SubNav});
 * an item without `href` (or the trailing crumb) renders as plain text.
 */
export function Breadcrumb({ items, linkComponent }: BreadcrumbProps) {
  const Link = linkComponent ?? "a";
  const lastIndex = items.length - 1;
  return (
    <Row
      align="center"
      aria-label="Breadcrumb"
      as="nav"
      data-testid={BreadcrumbTestId.Root}
      gap="50"
    >
      {items.map((item, index) => {
        const isLast = index === lastIndex;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <Typography
                aria-hidden="true"
                data-testid={`${BreadcrumbTestId.Separator}-${index}`}
                type="labelSm"
              >
                /
              </Typography>
            )}
            {isLast || !item.href ? (
              <Typography
                aria-current={isLast ? "page" : undefined}
                data-testid={
                  isLast ? BreadcrumbTestId.Current : `${BreadcrumbTestId.Item}-${index}`
                }
                type="labelSm"
                variant={isLast ? "primary" : "tertiary"}
              >
                {item.label}
              </Typography>
            ) : (
              <Link
                className="font-mono text-[10px] uppercase tracking-wider text-foreground-faint transition-colors hover:text-foreground-dim"
                data-testid={`${BreadcrumbTestId.Item}-${index}`}
                href={item.href}
              >
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </Row>
  );
}
