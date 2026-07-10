"use client";

import {
  Button,
  Chip,
  Container,
  Grid,
  OrbitLoader,
  Pressable,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { ImportDialog } from "./components/ImportDialog";
import { MemoryGraph } from "./components/MemoryGraph";
import { NoteEditorDialog } from "./components/NoteEditorDialog";
import { NoteView } from "./components/NoteView";
import { QuickCapture } from "./components/QuickCapture";
import { type TierFilter, filterGraphByTier } from "./filterGraph";
import { useMemoryGraphQuery, useMemorySearchQuery, useNoteQuery } from "./queries";

const TIER_FILTERS: TierFilter[] = ["all", "memory", "daily", "knowledge"];

/**
 * Memory screen: the force-directed wiki-link graph from the real vault, a note
 * viewer/editor, index-first search, a tier filter, and a daily timeline. Notes
 * are created and edited here through the vault write API (Phase 4); the graph,
 * search, and the open note all refresh off the `["memory"]` query key.
 */
export function Screen() {
  const t = useTranslations("memory");
  const graphQuery = useMemoryGraphQuery();
  const graph = graphQuery.data;
  const [selected, setSelected] = useState<string | null>(null);
  const [tier, setTier] = useState<TierFilter>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // Phase 109: the lighter-weight "halda" capture path, alongside `creating`'s full
  // NoteEditorDialog flow — visually subordinate (a ghost trigger beside the primary
  // "New note" button), never a replacement for it.
  const [quickCapturing, setQuickCapturing] = useState(false);
  // Phase 112c: bulk-import external .md/.txt files into the halda queue.
  const [importing, setImporting] = useState(false);

  const { data: note } = useNoteQuery(selected);
  const { data: searchHits } = useMemorySearchQuery(search);

  // Phase 108: no global project scope any more — the graph and search always
  // cover every project's notes at once, filtered only by tier.
  const filteredGraph = useMemo(
    () => (graph ? filterGraphByTier(graph, tier) : graph),
    [graph, tier],
  );
  const hits = useMemo(
    () => (searchHits?.results ?? []).filter((h) => tier === "all" || h.tier === tier),
    [searchHits, tier],
  );
  const tierChips = (
    <Stack wrap align="center" direction="row" gap="75">
      {TIER_FILTERS.map((value) => (
        <Pressable data-testid={`memory-tier-${value}`} key={value} onClick={() => setTier(value)}>
          <Chip tone={tier === value ? "accent" : "idle"}>{t(`tier.${value}`)}</Chip>
        </Pressable>
      ))}
    </Stack>
  );

  const header = (
    <PageHeader
      actions={
        <Stack align="center" direction="row" gap="100">
          <Button
            data-testid="memory-note-quickcapture-toggle"
            icon="bolt"
            intent="ghost"
            onClick={() => setQuickCapturing(true)}
            size="sm"
          >
            {t("quickCapture.trigger")}
          </Button>
          <Button
            data-testid="memory-import-open"
            icon="file"
            intent="ghost"
            onClick={() => setImporting(true)}
            size="sm"
          >
            {t("import.trigger")}
          </Button>
          <Button
            data-testid="memory-note-new"
            icon="plus"
            intent="primary"
            onClick={() => setCreating(true)}
          >
            {t("newNote")}
          </Button>
        </Stack>
      }
      subtitle={t("countSummary", { count: graph?.nodes.length ?? 0 })}
      title={t("title")}
    />
  );

  const quickCapturePanel = quickCapturing && (
    <HudPanel padding="200" title={t("quickCapture.title")}>
      <QuickCapture
        onCaptured={(id) => setSelected(id)}
        onClose={() => setQuickCapturing(false)}
      />
    </HudPanel>
  );

  const toolbar = (
    <Stack wrap align="end" direction="row" gap="150" justify="between">
      <Container grow minW0>
        <TextInputField
          data-testid="memory-search-input"
          label={t("searchLabel")}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          value={search}
        />
      </Container>
      {tierChips}
    </Stack>
  );

  // Create-only (N4g): editing happens in place on the note panel below.
  const editorDialog = creating && (
    <NoteEditorDialog onClose={() => setCreating(false)} onSaved={(id) => setSelected(id)} />
  );

  const importDialog = importing && <ImportDialog onClose={() => setImporting(false)} />;

  if (graphQuery.isPending) {
    return (
      <PageContainer>
        <QueryLoading />
        {editorDialog}
        {importDialog}
      </PageContainer>
    );
  }

  if (graphQuery.isError) {
    return (
      <PageContainer>
        <QueryError onRetry={() => void graphQuery.refetch()} />
        {editorDialog}
        {importDialog}
      </PageContainer>
    );
  }

  if (graph && graph.nodes.length === 0) {
    return (
      <PageContainer>
        <Stack align="center" gap="200">
          <EmptyState description={t("emptyDescription")} glyph="brain" title={t("emptyTitle")} />
          <Button data-testid="memory-note-new" icon="plus" onClick={() => setCreating(true)}>
            {t("newNote")}
          </Button>
        </Stack>
        {editorDialog}
        {importDialog}
      </PageContainer>
    );
  }

  return (
    <PageContainer stretch>
      <Stack gap="250">
        {header}
        {toolbar}
        {quickCapturePanel}

        {search.trim().length > 0 && (
          <HudPanel padding="200" title={t("searchResults")}>
            {hits.length > 0 ? (
              <Stack gap="75">
                {hits.map((hit) => (
                  <Pressable
                    data-testid={`memory-search-hit-${hit.id}`}
                    key={hit.id}
                    onClick={() => setSelected(hit.id)}
                  >
                    <Stack gap="25">
                      <Typography mono size="sm" type="note">
                        {hit.title} · {hit.tier}
                      </Typography>
                      <Typography size="caption" type="note" variant="tertiary">
                        {hit.snippet}
                      </Typography>
                    </Stack>
                  </Pressable>
                ))}
              </Stack>
            ) : (
              <Typography mono size="sm" type="note" variant="secondary">
                {t("noResults")}
              </Typography>
            )}
          </HudPanel>
        )}

        <Grid align="start" gap="250" sidebar="right">
          <HudPanel padding="200" title={t("knowledgeGraph")}>
            {filteredGraph ? (
              <MemoryGraph graph={filteredGraph} onSelect={setSelected} selectedId={selected} />
            ) : (
              <Container padding={["500", "0"]}>
                <Stack align="center">
                  <OrbitLoader label={t("loadingGraph")} />
                </Stack>
              </Container>
            )}
          </HudPanel>

          {/* Keyed by note so switching notes resets any in-progress edit (N4g). */}
          <NoteView key={note?.id ?? "none"} note={note} onSelect={setSelected} />
        </Grid>

        {editorDialog}
        {importDialog}
      </Stack>
    </PageContainer>
  );
}
