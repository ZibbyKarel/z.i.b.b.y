import { useTranslations } from "next-intl";
import { Button, Card, Container, Icon, Stack, Typography } from "@zibby/design-system";
import { ActivityFeed } from "../../overview/components/ActivityFeed/ActivityFeed";
import { useActivityQuery } from "../../overview/queries";

export enum ChatSidePanelTestId {
  Root = "chat-side-panel",
  Close = "chat-side-panel-close",
  Loading = "chat-side-panel-loading",
  Empty = "chat-side-panel-empty",
  Feed = "chat-side-panel-feed",
}

export interface ChatSidePanelProps {
  /** Close just this panel — Esc (top priority in `ChatScreen`) or the header button. */
  onClose: () => void;
}

/** How many recent entries to show — enough to be useful without turning into a log. */
const ACTIVITY_LIMIT = 12;

/**
 * The activity panel docked to the chat overlay's right edge (Fáze 14.5,
 * Rozhodnutí 7): a local composite built from the DS `Card`/`Container`
 * primitives, not a new DS Drawer — this is chat-specific overlay chrome, only
 * worth promoting to a DS primitive once a second screen needs the same shape.
 * Reuses the overview screen's own presentational `ActivityFeed` fed by its
 * `useActivityQuery` — the same cross-feature import pattern `ChatRunCard`
 * already uses for `features/runs`/`features/pipelines`.
 */
export function ChatSidePanel({ onClose }: ChatSidePanelProps) {
  const t = useTranslations("chat.panel");
  const { data, isPending } = useActivityQuery();
  const items = data ?? [];

  return (
    <Container
      bottom="0"
      data-testid={ChatSidePanelTestId.Root}
      position="fixed"
      right="0"
      top="64px"
      width="380px"
      zIndex={45}
    >
      {/* `Card` has no `height`/`overflowY` prop (nothing else in the overlay needs a
          docked, full-height scrolling surface) — the sanctioned DS style
          passthrough (CLAUDE.md) fills the fixed box above instead of a new prop. */}
      <Card
        animate="scale"
        background="surface"
        header={
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="75">
              <Icon name="pulse" size="sm" tone="accent" />
              <Typography type="note" weight="semibold">
                {t("title")}
              </Typography>
            </Stack>
            <Button
              aria-label={t("closeAria")}
              data-testid={ChatSidePanelTestId.Close}
              icon="x"
              intent="ghost"
              onClick={onClose}
              size="sm"
            />
          </Stack>
        }
        radius="none"
        shadow="modal"
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        <Container overflowY="auto" padding="200" style={{ flex: 1 }}>
          {isPending ? (
            <Typography
              data-testid={ChatSidePanelTestId.Loading}
              type="note"
              variant="tertiary"
            >
              {t("loading")}
            </Typography>
          ) : items.length === 0 ? (
            <Typography data-testid={ChatSidePanelTestId.Empty} type="note" variant="tertiary">
              {t("empty")}
            </Typography>
          ) : (
            <Container data-testid={ChatSidePanelTestId.Feed}>
              <ActivityFeed items={items} limit={ACTIVITY_LIMIT} />
            </Container>
          )}
        </Container>
      </Card>
    </Container>
  );
}
