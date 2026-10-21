import type { Decision } from "@zibby/contracts";
import {
  Grid,
  type GridCols,
  Icon,
  MenuButton,
  Panel,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { DECISION_META } from "../gate";

/** The board's columns, in reading order. `allow` is how a rule gets switched off. */
const COLUMNS: Decision[] = ["ask", "deny", "notify", "allow"];

/** Drag-data MIME a column reads on drop (the dragged rule's id). */
const RULE_DND_TYPE = "application/x-zibby-gate-rule";

export enum DecisionColumnsTestId {
  /** One decision column — suffixed with the decision: `decision-column-ask`. */
  Column = "decision-column",
}

export interface DecisionColumnsProps<T extends { id: string; decision: Decision }> {
  rules: T[];
  /**
   * One card; `column` is the rule's column (its order = evaluation order within it).
   * `moveMenu` is the keyboard path for {@link onMove} (a "move to…" menu) — place it
   * in the card's action row; null when moving is off.
   */
  renderCard: (rule: T, index: number, column: T[], moveMenu: ReactNode) => ReactNode;
  /** Moving a card to another column changes the rule's decision (its tier). Absent =
   *  cards aren't draggable. */
  onMove?: (rule: T, to: Decision) => void;
}

/**
 * Gate rules laid out as one column per decision (ask / deny / notify / allow;
 * dropping a rule in allow is how it gets switched off). The column names the
 * decision, so cards don't badge it. Cards drag between
 * columns (native HTML5 DnD) to change their decision; a per-card menu does the same
 * from the keyboard. Shared by the global catalog and the system floor.
 */
export function DecisionColumns<T extends { id: string; decision: Decision }>({
  rules,
  renderCard,
  onMove,
}: DecisionColumnsProps<T>) {
  const t = useTranslations("gates");
  const [over, setOver] = useState<Decision | null>(null);

  const drop = (id: string, to: Decision) => {
    const rule = rules.find((r) => r.id === id);
    if (rule && rule.decision !== to) onMove?.(rule, to);
  };

  const moveMenu = (rule: T): ReactNode =>
    onMove ? (
      <MenuButton
        ariaLabel={t("moveTo")}
        intent="ghost"
        items={COLUMNS.filter((d) => d !== rule.decision).map((d) => ({
          id: d,
          label: `${t("moveTo")} ${t(`decision_.${d}`)}`,
          icon: DECISION_META[d].icon,
          onSelect: () => onMove(rule, d),
        }))}
        size="sm"
      />
    ) : null;

  return (
    <Grid cols={1} gap="200" lg={COLUMNS.length as GridCols}>
      {COLUMNS.map((d) => {
        const column = rules.filter((r) => r.decision === d);
        return (
          <div
            data-testid={`${DecisionColumnsTestId.Column}-${d}`}
            key={d}
            onDragLeave={() => setOver((o) => (o === d ? null : o))}
            onDragOver={(e) => {
              if (!onMove || !e.dataTransfer.types.includes(RULE_DND_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(d);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              drop(e.dataTransfer.getData(RULE_DND_TYPE), d);
            }}
            // eslint-disable-next-line react/forbid-dom-props
            style={{
              outline: over === d ? `1px dashed ${DECISION_META[d].cssVar}` : undefined,
              outlineOffset: 4,
              minHeight: 80,
            }}
          >
            <Stack gap="100">
              <Stack gap="25">
                <Stack align="center" direction="row" gap="75">
                  <Icon name={DECISION_META[d].icon} size="sm" tone={DECISION_META[d].tone} />
                  <Typography mono size="sm" type="note" weight="semibold">
                    {t(`decision_.${d}`)}
                  </Typography>
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {column.length}
                  </Typography>
                </Stack>
                <Typography size="2xs" type="note" variant="tertiary">
                  {t(`decisionHint.${d}`)}
                </Typography>
              </Stack>
              {column.length === 0 ? (
                <Panel padding="150">
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t(onMove ? "columnEmptyDrop" : "columnEmpty")}
                  </Typography>
                </Panel>
              ) : (
                column.map((rule, i) => (
                  <div
                    draggable={Boolean(onMove)}
                    key={rule.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(RULE_DND_TYPE, rule.id);
                    }}
                  >
                    {renderCard(rule, i, column, moveMenu(rule))}
                  </div>
                ))
              )}
            </Stack>
          </div>
        );
      })}
    </Grid>
  );
}
