import {
  Card,
  Container,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { TaskTarget, TaskTargetKind } from "../task";

export interface TargetPickerProps {
  candidates: TaskTarget[];
  selected: TaskTarget;
  onPick: (target: TaskTarget) => void;
}

const targetKey = (t: TaskTarget) => `${t.kind}:${t.id}`;

/** One selectable destination row in the manual override list. */
function TargetRow({
  target,
  selected,
  onPick,
}: {
  target: TaskTarget;
  selected: boolean;
  onPick: (target: TaskTarget) => void;
}) {
  const t = useTranslations("tasks.routing");
  return (
    <Card
      as="button"
      interactive={!selected}
      onClick={() => onPick(target)}
      selected={selected}
    >
      <Container padding="150">
        <Stack align="center" direction="row" gap="100">
          <IconTile glyph={target.glyph} size="sm" tone={selected ? "accent" : "neutral"} />
          <Container grow minW0>
            <Typography mono truncate type="note" weight="bold">
              {target.name}
            </Typography>
            {target.category && (
              <Typography truncate size="sm" type="note" variant="tertiary">
                {target.category}
              </Typography>
            )}
          </Container>
          <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
            {t(`targetKind.${target.kind}`)}
          </Typography>
        </Stack>
      </Container>
    </Card>
  );
}

/**
 * Manual override: the full candidate catalog grouped by kind (agents, then
 * pipelines). Picking a row updates the dispatch target — the explicit escape
 * hatch when the classifier guessed wrong or wasn't confident.
 */
export function TargetPicker({ candidates, selected, onPick }: TargetPickerProps) {
  const t = useTranslations("tasks.routing");
  const selectedKey = targetKey(selected);

  const groups: Array<{
    kind: TaskTargetKind;
    labelKey: "pickerAgents" | "pickerPipelines";
  }> = [
    { kind: "agent", labelKey: "pickerAgents" },
    { kind: "pipeline", labelKey: "pickerPipelines" },
  ];

  return (
    <Stack gap="150">
      {groups.map(({ kind, labelKey }) => {
        const items = candidates.filter((c) => c.kind === kind);
        if (items.length === 0) return null;
        return (
          <Stack gap="75" key={kind}>
            <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
              {t(labelKey)}
            </Typography>
            <Stack gap="75">
              {items.map((target) => (
                <TargetRow
                  key={targetKey(target)}
                  onPick={onPick}
                  selected={targetKey(target) === selectedKey}
                  target={target}
                />
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
