"use client";

import type { AnchorHTMLAttributes } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  Container,
  Rail,
  Stack,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { usePagePins } from "../usePagePins";

export enum PinnedRailTestId {
  Row = "pinned-rail-row",
  Kind = "pinned-rail-kind",
  Link = "pinned-rail-link",
  Unpin = "pinned-rail-unpin",
  Empty = "pinned-rail-empty",
}

/** Adapts `next/link`'s `Link` (which types `href` as `Route | UrlObject`) to
 *  `TextLink`'s router-agnostic `linkComponent` contract (`href: string`) —
 *  same seam as `AppShell`'s own `NavLink`. */
function NavLink({
  href,
  ...rest
}: { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href as Route} {...rest} />;
}

export interface PinnedRailProps {
  /** The current page's pin-identity href (`pinHrefFor`) — the row whose
   *  href matches gets the active treatment (spec decision 5). */
  currentHref: string;
}

/**
 * The ActivityDock "Pinned" panel body — any page pin, in pin order, as a static list (no accordion; the dock panel itself is the container and scrolls).
 */
export function PinnedRail({ currentHref }: PinnedRailProps) {
  const t = useTranslations("shell");
  const { pagePins, unpinPage } = usePagePins();

  return (
    <Rail
      count={pagePins.length}
      empty={
        <Card
          background="surface"
          borderStyle="dashed"
          data-testid={PinnedRailTestId.Empty}
          radius="none"
        >
          <CardContent padding="150">
            <Typography type="note" variant="secondary">
              {t("pinnedEmpty")}
            </Typography>
          </CardContent>
        </Card>
      }
      title={t("dockPinned")}
    >
      {pagePins.length === 0
        ? undefined
        : pagePins.map((pin) => {
            const active = pin.id === currentHref;
            return (
              // Design line 50's row: `38px minmax(0,1fr) auto` grid, `padding:
              // 0 12px 0 20px` — the kind column is widened to 56px here (DS
              // Container.width, not an arbitrary CSS grid template) because
              // "STRÁNKA" (cs) doesn't fit the mock's English-sized 38px; the
              // flex equivalent (fixed-width + grow/minW0 + auto-trailing
              // Button) reproduces the same three tracks via DS primitives.
              <Container
                data-testid={PinnedRailTestId.Row}
                key={pin.id}
                padding={["0", "150", "0", "250"]}
                style={{
                  background: active ? "var(--color-panel-2)" : undefined,
                  boxShadow: active ? "inset 2px 0 0 var(--color-ink)" : undefined,
                }}
              >
                <Stack align="center" direction="row" gap="100">
                  <Container shrink={false} width="56px">
                    <Typography
                      truncate
                      data-testid={PinnedRailTestId.Kind}
                      type="labelSm"
                      variant="tertiary"
                    >
                      {t("pinnedKindPage")}
                    </Typography>
                  </Container>
                  <Container grow minW0>
                    <TextLink
                      truncate
                      data-testid={PinnedRailTestId.Link}
                      href={pin.id}
                      linkComponent={NavLink}
                    >
                      <Typography truncate type="note" weight={active ? "medium" : "normal"}>
                        {pin.label}
                      </Typography>
                    </TextLink>
                  </Container>
                  <Button
                    aria-label={t("pinnedUnpinAria", { name: pin.label })}
                    data-testid={PinnedRailTestId.Unpin}
                    icon="x"
                    intent="ghost"
                    onClick={() => unpinPage(pin.id)}
                    size="sm"
                  />
                </Stack>
              </Container>
            );
          })}
    </Rail>
  );
}
