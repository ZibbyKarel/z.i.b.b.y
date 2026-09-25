"use client";

import { useMemo, useState } from "react";
import { DEPARTMENTS } from "@zibby/contracts";
import {
  Button,
  Chip,
  Container,
  Grid,
  List,
  ListItem,
  ListItemText,
  Panel,
  Pressable,
  SearchInput,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { ImportDialog } from "../components/ImportDialog";
import { NoteEditorDialog } from "../components/NoteEditorDialog";
import { NoteView } from "../components/NoteView";
import { QuickCapture } from "../components/QuickCapture";
import { groupVaultNodes } from "../groupVault";
import { useMemoryGraphQuery, useMemorySearchQuery, useNoteQuery } from "../queries";

const DEPARTMENT_NAME: ReadonlyMap<string, string> = new Map(
  DEPARTMENTS.map((d) => [d.id, d.name] as const),
);

/**
 * The vault: a left nav grouped by tier → department shelf (O-24), a reader (DS
 * `Markdown`, note-nav chips for outgoing/backlinks — ported from `NoteView`'s
 * wikilink handling) and a "used by" (backlinks) rail. Editing happens in place
 * via `NoteView`'s own top-right Edit → `MarkdownEditor` swap.
 */
export function VaultScreen() {
  const t = useTranslations("knowledge");
  const tm = useTranslations("memory");
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = searchParams.get("note");

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [quickCapturing, setQuickCapturing] = useState(false);
  const [importing, setImporting] = useState(false);

  const graphQuery = useMemoryGraphQuery();
  const graph = graphQuery.data;
  const { data: note } = useNoteQuery(selected);
  const { data: searchHits } = useMemorySearchQuery(search);

  const select = (id: string) => router.replace(`/knowledge/vault?note=${id}` as Route);

  const visibleIds = useMemo(
    () =>
      search.trim().length > 0 ? new Set((searchHits?.results ?? []).map((h) => h.id)) : undefined,
    [search, searchHits],
  );
  const groups = useMemo(
    () => (graph ? groupVaultNodes(graph.nodes, visibleIds) : []),
    [graph, visibleIds],
  );

  const backlinks = note?.backlinks ?? [];

  const actions = (
    <Stack align="center" direction="row" gap="100">
      <Button
        data-testid="vault-quickcapture-toggle"
        icon="bolt"
        intent="ghost"
        onClick={() => setQuickCapturing(true)}
        size="sm"
      >
        {tm("quickCapture.trigger")}
      </Button>
      <Button
        data-testid="vault-import-open"
        icon="file"
        intent="ghost"
        onClick={() => setImporting(true)}
        size="sm"
      >
        {tm("import.trigger")}
      </Button>
      <Button
        data-testid="vault-note-new"
        icon="plus"
        intent="primary"
        onClick={() => setCreating(true)}
      >
        {tm("newNote")}
      </Button>
    </Stack>
  );

  if (graphQuery.isPending) {
    return (
      <Container padding={["300", "350"]}>
        <PageContainer>
          <QueryLoading />
        </PageContainer>
      </Container>
    );
  }
  if (graphQuery.isError) {
    return (
      <Container padding={["300", "350"]}>
        <PageContainer>
          <QueryError onRetry={() => void graphQuery.refetch()} />
        </PageContainer>
      </Container>
    );
  }

  const nav = (
    <Panel header={t("vault.title")} padding="150">
      <Stack gap="200">
        <SearchInput
          ariaLabel={t("vault.title")}
          data-testid="vault-search-input"
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tm("searchPlaceholder")}
          value={search}
        />
        {graph && graph.nodes.length === 0 ? (
          <EmptyState description={tm("emptyDescription")} glyph="brain" title={tm("emptyTitle")} />
        ) : (
          <List>
            {groups.map((g) => (
              <Stack gap="100" key={g.tier}>
                <Typography
                  mono
                  uppercase
                  size="2xs"
                  tracking="wide"
                  type="note"
                  variant="tertiary"
                >
                  {tm(`tier.${g.tier}`)}
                </Typography>
                {g.shelves.map((shelf) => {
                  const shelfId = shelf.department ?? "general";
                  const shelfLabel = shelf.department
                    ? (DEPARTMENT_NAME.get(shelf.department) ?? shelf.department)
                    : t("vault.shelfGeneral");
                  return (
                    <Stack gap="50" key={`${g.tier}-${shelfId}`}>
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {shelfLabel} · {shelf.notes.length}
                      </Typography>
                      {shelf.notes.map((n) => (
                        <ListItem
                          active={n.id === selected}
                          id={`${g.tier}-${shelfId}-${n.id}`}
                          key={n.id}
                          onSelect={() => select(n.id)}
                        >
                          <ListItemText>{n.label}</ListItemText>
                        </ListItem>
                      ))}
                    </Stack>
                  );
                })}
              </Stack>
            ))}
          </List>
        )}
      </Stack>
    </Panel>
  );

  const usedBy = (
    <Panel header={t("vault.usedBy")} padding="150">
      {backlinks.length > 0 ? (
        <Stack gap="75">
          {backlinks.map((id) => (
            <Pressable data-testid={`vault-usedby-${id}`} key={id} onClick={() => select(id)}>
              <Chip tone="idle">{id}</Chip>
            </Pressable>
          ))}
        </Stack>
      ) : (
        <Typography mono size="sm" type="note" variant="tertiary">
          {t("vault.usedByEmpty")}
        </Typography>
      )}
    </Panel>
  );

  return (
    <Container padding={["300", "350"]}>
      <PageContainer stretch>
        <Stack gap="250">
          <Stack wrap align="end" direction="row" gap="150" justify="between">
            <Typography type="title">{t("vault.title")}</Typography>
            {actions}
          </Stack>

          {quickCapturing && (
            <Panel header={tm("quickCapture.title")} padding="200">
              <QuickCapture
                onCaptured={(id) => select(id)}
                onClose={() => setQuickCapturing(false)}
              />
            </Panel>
          )}

          <Grid align="start" gap="200" sidebar="right">
            <Grid align="start" gap="200" sidebar="left">
              {nav}
              <NoteView note={note} onSelect={select} />
            </Grid>
            {usedBy}
          </Grid>
        </Stack>
      </PageContainer>

      {creating && (
        <NoteEditorDialog onClose={() => setCreating(false)} onSaved={(id) => select(id)} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </Container>
  );
}
