import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Chip,
  Container,
  type IconName,
  MenuSurface,
  SearchMenu,
  type SearchMenuSection,
  Stack,
  TextAreaField,
} from "@zibby/design-system";
import type { TaskTarget } from "@zibby/contracts";
import { useAgentsQuery } from "../../agents";
import { usePipelinesQuery } from "../../pipelines";

export enum ChatComposerTestId {
  Root = "chat-composer",
  Input = "chat-composer-input",
  Send = "chat-composer-send",
  MentionMenu = "chat-composer-mention-menu",
  TargetChip = "chat-composer-target-chip",
}

export interface ChatComposerProps {
  /** Send the composed text, plus the @mentioned routing target when one was picked. */
  onSend: (text: string, target?: TaskTarget) => void;
  /** Disable input + send while a turn is in flight. */
  disabled?: boolean;
  /**
   * Fired whenever the trimmed draft flips between empty and non-empty (including
   * the clear-on-send) — never on every keystroke. Lets a parent (e.g. ChatScreen)
   * derive a "listening" state without owning the draft text itself.
   */
  onDraftChange?: (hasDraft: boolean) => void;
}

/** Position (viewport px) the fixed mention picker is rendered at, above the composer. */
interface MentionMenuRect {
  left: number;
  width: number;
  bottom: number;
}

/** True right after the operator types `@` at the start of the text or after whitespace —
 * the moment the mention picker should open (Fáze 14.2, Rozhodnutí 3). */
function isMentionTrigger(text: string, cursor: number): boolean {
  if (cursor === 0 || text[cursor - 1] !== "@") return false;
  return cursor === 1 || /\s/.test(text[cursor - 2] ?? "");
}

/** Case-insensitive substring match on a target's display name or id. */
function matchesQuery(query: string, name: string, id: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
}

/**
 * The chat text input — a textarea as the PRIMARY input plus a Send button. Enter
 * sends (the headline text-first interaction); Shift+Enter inserts a newline. The
 * field clears on send and ignores empty/whitespace-only submissions.
 *
 * Fáze 14.2 adds an @mention picker: typing `@` at a word start opens a floating
 * `SearchMenu` (Agents + Pipelines, reusing the existing catalog queries) positioned
 * above the textarea. `SearchMenu` owns its own input and keyboard nav (↑/↓/Enter/
 * Escape) internally, so opening the picker moves focus into IT — the operator
 * types the filter there, not in the composer's textarea, which stays untouched
 * until a selection inserts `@Name ` at the mention position and hands focus back.
 * A picked target renders as a closable `Chip` above the composer and rides along
 * with the next `onSend` call; sending (or removing the chip) clears it — it is
 * one-shot per message, mirroring the backend's one-shot-per-turn explicit target.
 */
export function ChatComposer({ onSend, disabled, onDraftChange }: ChatComposerProps) {
  const t = useTranslations("chat.composer");
  const tMention = useTranslations("chat.mention");
  const [value, setValue] = useState("");
  const hasDraftRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [menuRect, setMenuRect] = useState<MentionMenuRect | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TaskTarget | undefined>(undefined);

  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();

  // Once the picker is positioned (menuRect set — see the trigger in the textarea's
  // onChange, which computes it synchronously so it lands in the SAME render as
  // `mentionOpen` flipping true) it is actually mounted, and focus can move into its
  // own search input — SearchMenu owns its keyboard nav internally, so it must hold
  // focus to drive it.
  useEffect(() => {
    if (mentionOpen && menuRect) mentionInputRef.current?.focus();
  }, [mentionOpen, menuRect]);

  // Hand focus back to the textarea once the picker closes, for EITHER close path
  // (Escape/outside-click via SearchMenu's `onOpenChange`, or a selection via
  // `selectMention`). A selection also leaves a cursor position to restore — kept in
  // a ref (not state) since it is write-once, read-once and must never itself trigger
  // a render. Effect-driven rather than `requestAnimationFrame`: React flushes effects
  // deterministically (act()-friendly), where a raw rAF callback is not guaranteed to
  // have run by the time the next simulated interaction fires.
  const pendingCursorRef = useRef<number | null>(null);
  useEffect(() => {
    if (mentionOpen) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    if (pendingCursorRef.current !== null) {
      el.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }
  }, [mentionOpen]);

  const closeMention = () => {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMenuRect(null);
  };

  const notifyDraftChange = (text: string) => {
    const hasDraft = text.trim().length > 0;
    if (hasDraft !== hasDraftRef.current) {
      hasDraftRef.current = hasDraft;
      onDraftChange?.(hasDraft);
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    // Only pass a second argument when a target was actually picked — keeps
    // `onSend` calls unchanged (single-arg) for the plain no-mention case.
    if (selectedTarget) onSend(text, selectedTarget);
    else onSend(text);
    setValue("");
    notifyDraftChange("");
    setSelectedTarget(undefined);
  };

  const agentSection: SearchMenuSection = {
    id: "agents",
    label: tMention("sections.agents"),
    items: agents
      .filter((a) => matchesQuery(mentionQuery, a.name ?? a.id, a.id))
      .map((a) => ({ id: a.id, title: a.name ?? a.id, glyph: (a.glyph as IconName | undefined) ?? "bot" })),
  };
  const pipelineSection: SearchMenuSection = {
    id: "pipelines",
    label: tMention("sections.pipelines"),
    items: pipelines
      .filter((p) => matchesQuery(mentionQuery, p.name, p.id))
      .map((p) => ({ id: p.id, title: p.name, glyph: "flow" as IconName })),
  };

  const selectMention = (sectionId: string, itemId: string) => {
    if (mentionStart === null) return;
    let target: TaskTarget | undefined;
    if (sectionId === "agents") {
      const agent = agents.find((a) => a.id === itemId);
      if (agent) target = { kind: "agent", id: agent.id, name: agent.name ?? agent.id, glyph: agent.glyph };
    } else if (sectionId === "pipelines") {
      const pipeline = pipelines.find((p) => p.id === itemId);
      if (pipeline) target = { kind: "pipeline", id: pipeline.id, name: pipeline.name, glyph: "flow" };
    }
    if (!target) return;

    const mentionText = `@${target.name} `;
    const start = mentionStart;
    const nextValue = value.slice(0, start) + mentionText + value.slice(start + 1);
    setValue(nextValue);
    notifyDraftChange(nextValue);
    setSelectedTarget(target);
    pendingCursorRef.current = start + mentionText.length;
    closeMention();
  };

  return (
    <Stack
      data-testid={ChatComposerTestId.Root}
      direction="col"
      gap="75"
      // Escape while the mention picker is focused must close ONLY the picker
      // (SearchMenu handles that itself) — stop it here so it never reaches the
      // ChatScreen's window listener and closes the whole overlay too.
      onKeyDown={(e) => {
        if (mentionOpen && e.key === "Escape") e.stopPropagation();
      }}
    >
      {selectedTarget && (
        <Stack align="center" direction="row" gap="75">
          <Chip
            closable
            closeLabel={tMention("removeAria")}
            data-testid={ChatComposerTestId.TargetChip}
            onClose={() => {
              setSelectedTarget(undefined);
              textareaRef.current?.focus();
            }}
            tone="accent"
          >
            {selectedTarget.name}
          </Chip>
        </Stack>
      )}

      <Container position="relative" ref={rootRef}>
        {mentionOpen && menuRect && (
          <MenuSurface
            data-testid={ChatComposerTestId.MentionMenu}
            placement="fixed"
            style={{ left: menuRect.left, width: menuRect.width, bottom: menuRect.bottom }}
          >
            <SearchMenu
              ariaLabel={tMention("ariaLabel")}
              emptyLabel={tMention("empty")}
              inputRef={mentionInputRef}
              onOpenChange={(open) => {
                if (!open) closeMention();
              }}
              onSelect={selectMention}
              onValueChange={setMentionQuery}
              open={mentionOpen}
              placeholder={tMention("placeholder")}
              sections={[agentSection, pipelineSection]}
              value={mentionQuery}
            />
          </MenuSurface>
        )}

        <Stack align="end" direction="row" gap="100">
          <Stack grow style={{ minWidth: 0 }}>
            <TextAreaField
              autoFocus
              data-testid={ChatComposerTestId.Input}
              disabled={disabled}
              label={t("label")}
              onChange={(e) => {
                const nextValue = e.target.value;
                const cursor = e.target.selectionStart ?? nextValue.length;
                setValue(nextValue);
                notifyDraftChange(nextValue);
                if (!mentionOpen && isMentionTrigger(nextValue, cursor)) {
                  // Measure synchronously (the DOM is fully laid out inside this
                  // event handler) so `menuRect` and `mentionOpen` land in the SAME
                  // render — the picker mounts immediately, with no extra render
                  // pass, so the focus effect above finds a real input to focus.
                  const rect = rootRef.current?.getBoundingClientRect();
                  if (rect) {
                    setMenuRect({
                      left: rect.left,
                      width: rect.width,
                      bottom: window.innerHeight - rect.top + 8,
                    });
                  }
                  setMentionStart(cursor - 1);
                  setMentionQuery("");
                  setMentionOpen(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t("placeholder")}
              ref={textareaRef}
              rows={2}
              value={value}
            />
          </Stack>
          <Button
            data-testid={ChatComposerTestId.Send}
            disabled={disabled || value.trim().length === 0}
            icon="arrow"
            intent="primary"
            onClick={submit}
            size="sm"
          >
            {t("send")}
          </Button>
        </Stack>
      </Container>
    </Stack>
  );
}
