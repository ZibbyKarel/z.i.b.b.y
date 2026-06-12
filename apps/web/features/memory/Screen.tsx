"use client";

import {
  Button,
  Chip,
  Container,
  Grid,
  Pressable,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { MemoryGraph } from "./components/MemoryGraph";
import { NoteEditorDialog } from "./components/NoteEditorDialog";
import { type TierFilter, filterGraphByTier } from "./filterGraph";
import {
  useMemoryGraphQuery,
  useMemorySearchQuery,
  useNoteQuery,
} from "./queries";

const TIER_FILTERS: TierFilter[] = ["all", "memory", "daily", "knowledge"];

/**
 * Memory screen: the force-directed wiki-link graph from the real vault, a note
 * viewer/editor, index-first search, a tier filter, and a daily timeline. Notes
 * are created and edited here through the vault write API (Phase 4); the graph,
 * search, and the open note all refresh off the `["memory"]` query key.
 */
export function Screen() {
  const t = useTranslations("memory");
  const { data: graph } = useMemoryGraphQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const [tier, setTier] = useState<TierFilter>("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ mode: "create" | "edit" } | null>(
    null,
  );

  const { data: note } = useNoteQuery(selected);
  const { data: searchHits } = useMemorySearchQuery(search);

  const filteredGraph = useMemo(
    () => (graph ? filterGraphByTier(graph, tier) : graph),
    [graph, tier],
  );
  const hits = useMemo(
    () =>
      (searchHits?.results ?? []).filter(
        (h) => tier === "all" || h.tier === tier,
      ),
    [searchHits, tier],
  );
  const dailyNodes = useMemo(
    () =>
      (graph?.nodes ?? [])
        .filter((n) => n.tier === "daily")
        .sort((a, b) => b.id.localeCompare(a.id)),
    [graph],
  );

  const tierChips = (
    <Stack wrap align="center" direction="row" gap="75">
      {TIER_FILTERS.map((value) => (
        <Pressable
          data-testid={`memory-tier-${value}`}
          key={value}
          onClick={() => setTier(value)}
        >
          <Chip tone={tier === value ? "accent" : "idle"}>
            {t(`tier.${value}`)}
          </Chip>
        </Pressable>
      ))}
    </Stack>
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
      <Button
        data-testid="memory-note-new"
        icon="plus"
        onClick={() => setEditor({ mode: "create" })}
      >
        {t("newNote")}
      </Button>
    </Stack>
  );

  const editorDialog = editor && (
    <NoteEditorDialog
      mode={editor.mode}
      note={editor.mode === "edit" ? note : undefined}
      onClose={() => setEditor(null)}
      onSaved={(id) => setSelected(id)}
    />
  );

  if (graph && graph.nodes.length === 0) {
    return (
      <PageContainer>
        <Stack align="center" gap="200">
          <EmptyState
            description={t("emptyDescription")}
            glyph="brain"
            title={t("emptyTitle")}
          />
          <Button
            data-testid="memory-note-new"
            icon="plus"
            onClick={() => setEditor({ mode: "create" })}
          >
            {t("newNote")}
          </Button>
        </Stack>
        {editorDialog}
      </PageContainer>
    );
  }

  return (
    <Stack gap="250">
      {toolbar}

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

      <Grid center align="start" gap="250" maxWidth="1400px" sidebar="right">
        <Container minW0>
          <Stack gap="250">
            <HudPanel padding="200" title={t("knowledgeGraph")}>
              {filteredGraph ? (
                <MemoryGraph
                  graph={filteredGraph}
                  onSelect={setSelected}
                  selectedId={selected}
                />
              ) : (
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("loadingGraph")}
                </Typography>
              )}
            </HudPanel>

            {dailyNodes.length > 0 && (
              <HudPanel padding="200" title={t("dailyTimeline")}>
                <Stack gap="75">
                  {dailyNodes.map((n) => (
                    <Pressable
                      data-testid={`memory-daily-${n.id}`}
                      key={n.id}
                      onClick={() => setSelected(n.id)}
                    >
                      <Typography mono size="sm" type="note">
                        {n.label}
                      </Typography>
                    </Pressable>
                  ))}
                </Stack>
              </HudPanel>
            )}
          </Stack>
        </Container>

        <Container minW0>
          <HudPanel padding="250" title={note?.title ?? t("noteFallback")}>
            {note ? (
              <Stack gap="150">
                <Stack
                  align="center"
                  direction="row"
                  gap="150"
                  justify="between"
                >
                  <Typography
                    mono
                    size="caption"
                    type="note"
                    variant="tertiary"
                  >
                    {note.path} · {note.tier}
                  </Typography>
                  <Button
                    data-testid="memory-note-edit"
                    icon="edit"
                    intent="ghost"
                    onClick={() => setEditor({ mode: "edit" })}
                    size="sm"
                  >
                    {t("editNote")}
                  </Button>
                </Stack>
                <Typography size="base" type="note" variant="secondary">
                  {note.body ?? ""}
                </Typography>
                {note.backlinks && note.backlinks.length > 0 && (
                  <Typography mono size="sm" type="note" variant="tertiary">
                    ← {note.backlinks.join(", ")}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography mono size="sm" type="note" variant="secondary">
                {t("selectNode")}
              </Typography>
            )}
          </HudPanel>
        </Container>
      </Grid>

      {editorDialog}
    </Stack>
  );
}
