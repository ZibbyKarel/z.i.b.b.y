import { type GlobalGateRule } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import {
  Button,
  Card,
  Container,
  Divider,
  Icon,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { DECISION_META, MATCHER_ICON } from "../gate";
import { MatcherText, ResolveChips } from "./RuleParts";

export enum GlobalRuleCardTestId {
  /** The owning-department scope tag (NS2 F3a) — rendered iff `rule.department` is set. */
  OwnerTag = "global-rule-card-owner-tag",
  /** The shield replacing the matcher icon on a built-in system rule (`rule.system`). */
  SystemIcon = "global-rule-card-system-icon",
}

/** A catalog rule's consumer (an agent or a skill that links it via `gateRuleIds`). */
export interface RuleUser {
  id: string;
  name: string;
  glyph: IconName;
}

export interface GlobalRuleCardProps {
  rule: GlobalGateRule;
  /** Agents that link this rule (computed from each agent's `gateRuleIds`). */
  agents: RuleUser[];
  /** Skills that link this rule. */
  skills: RuleUser[];
  onEdit: (rule: GlobalGateRule) => void;
  onDelete: (id: string) => void;
  /** The board's "move to another column" menu (keyboard path for drag & drop). */
  moveMenu?: ReactNode;
}

/** A chip naming one agent/skill that uses the rule. */
function UserChip({ user }: { user: RuleUser }) {
  return (
    <Tag tone="neutral">
      <Stack inline align="center" as="span" direction="row" gap="50">
        <Icon name={user.glyph} size="xs" tone="accent" />
        {user.name}
      </Stack>
    </Tag>
  );
}

/**
 * One global gate rule in the catalog: name + description, the matcher (→ resolve,
 * for `ask`), a usage strip (which agents/skills link it) and the row actions
 * (move to another column, edit, delete). A built-in system rule (`rule.system`)
 * looks the same but wears a shield instead of the matcher icon and has no delete
 * button — it can be edited and moved, never removed. The decision isn't badged — the column
 * the card sits in names it; the left border still encodes it.
 */
export function GlobalRuleCard({
  rule,
  agents,
  skills,
  onEdit,
  onDelete,
  moveMenu,
}: GlobalRuleCardProps) {
  const t = useTranslations("gates");
  const departments = useDepartmentLookup();
  const meta = DECISION_META[rule.decision];
  const matcherIcon = MATCHER_ICON[rule.match[0]?.type ?? "action"];
  const total = agents.length + skills.length;
  // NS2 F3a — a tagged rule is load-bearing for its department's runs (a third
  // evaluation bucket), so the card names its owner scope explicitly.
  const owner = rule.department ? departments.get(rule.department) : undefined;

  return (
    <div
      // eslint-disable-next-line react/forbid-dom-props
      style={{
        borderLeft: `3px solid ${meta.cssVar}`,
        borderRadius: 2,
      }}
    >
      <Card background="panel" radius="sm">
        <Container padding="150">
          <Stack gap="100">
            <Stack align="center" direction="row" gap="100">
              {rule.system ? (
                <Icon data-testid={GlobalRuleCardTestId.SystemIcon} name="shield" size="sm" tone="warn" />
              ) : (
                <Icon name={matcherIcon} size="sm" tone="faint" />
              )}
              <Container grow minW0>
                {rule.name && (
                  <Typography size="sm" type="text" weight="semibold">
                    {rule.name}
                  </Typography>
                )}
              </Container>
              {moveMenu}
              <Button
                aria-label={t("edit")}
                icon="edit"
                intent="ghost"
                onClick={() => onEdit(rule)}
                size="sm"
              />
              {!rule.system && (
                <Button
                  aria-label={t("delete")}
                  icon="x"
                  intent="ghost"
                  onClick={() => onDelete(rule.id)}
                  size="sm"
                />
              )}
            </Stack>

            {rule.desc && (
              <Typography size="xs" type="note" variant="secondary">
                {rule.desc}
              </Typography>
            )}
            <Stack wrap align="center" direction="row" gap="100">
              <MatcherText andLabel={t("and")} match={rule.match} />
              {rule.decision === "ask" && (
                <ResolveChips resolve={rule.resolve} youLabel={t("you")} />
              )}
            </Stack>

            <Stack align="center" direction="row" gap="50">
              {owner && (
                <Tag data-testid={GlobalRuleCardTestId.OwnerTag} tone="accent">
                  <Stack inline align="center" as="span" direction="row" gap="50">
                    <Icon name={departments.icon(owner.id)} size="xs" />
                    {owner.name}
                  </Stack>
                </Tag>
              )}
              {total > 0 ? (
                <Tag tone="accent">
                  <Stack inline align="center" as="span" direction="row" gap="50">
                    <Icon name="bot" size="xs" />
                    {total}
                  </Stack>
                </Tag>
              ) : (
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {t("unused")}
                </Typography>
              )}
            </Stack>

            {total > 0 && (
              <>
                <Divider />
                <Stack wrap align="center" direction="row" gap="100">
                  {agents.length > 0 && (
                    <Stack inline align="center" as="span" direction="row" gap="75">
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {t("usedByAgents")}
                      </Typography>
                      {agents.map((a) => (
                        <UserChip key={a.id} user={a} />
                      ))}
                    </Stack>
                  )}
                  {skills.length > 0 && (
                    <Stack inline align="center" as="span" direction="row" gap="75">
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {t("usedBySkills")}
                      </Typography>
                      {skills.map((s) => (
                        <UserChip key={s.id} user={s} />
                      ))}
                    </Stack>
                  )}
                </Stack>
              </>
            )}
          </Stack>
        </Container>
      </Card>
    </div>
  );
}
