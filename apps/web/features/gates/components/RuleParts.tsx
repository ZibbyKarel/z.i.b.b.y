import { Fragment } from "react";
import type { Decision, MatchCondition, Resolve } from "@zibby/contracts";
import { Badge, Icon, Stack, Typography } from "@zibby/design-system";
import { DECISION_META, flattenResolve, matchText } from "../gate";

const MONO = "var(--font-mono, ui-monospace, monospace)";

export function DecisionBadge({ decision, label, size = "sm" }: { decision: Decision; label: string; size?: "sm" | "md" }) {
  const meta = DECISION_META[decision];
  return (
    <Badge size={size} tone={meta.tone}>
      <Stack inline align="center" as="span" direction="row" gap="50">
        <Icon name={meta.icon} size="xs" />
        {label}
      </Stack>
    </Badge>
  );
}

/** A highlighted match-pattern chip (the emphasized argument/target). */
function Pat({ children }: { children: string }) {
  return (
    <span
      // eslint-disable-next-line react/forbid-dom-props
      style={{
        fontFamily: MONO,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--color-accent)",
        background: "var(--color-accent-dim)",
        border: "1px solid var(--color-border)",
        borderRadius: 2,
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Render the rule's AND-ed match conditions as human-readable text. */
export function MatcherText({ match, andLabel }: { match: MatchCondition[]; andLabel: string }) {
  return (
    <Stack
      inline
      wrap
      align="center"
      as="span"
      direction="row"
      gap="75"
       
      style={{ lineHeight: 1.5 }}
    >
      {match.map((c, i) => {
        const { lead, pattern } = matchText(c);
        return (
          <Fragment key={i}>
            {i > 0 && (
              <Typography mono size="2xs" type="note" variant="tertiary" weight="bold">
                {andLabel}
              </Typography>
            )}
            <Stack inline align="center" as="span" direction="row" gap="50">
              <Typography mono size="sm" type="note" variant="secondary">
                {lead}
              </Typography>
              {pattern && (
                <>
                  {/* eslint-disable-next-line react/forbid-dom-props */}
                  <span style={{ color: "var(--color-foreground-faint)" }}>→</span>
                  <Pat>{pattern}</Pat>
                </>
              )}
            </Stack>
          </Fragment>
        );
      })}
    </Stack>
  );
}

/** Resolution chips (only meaningful for `ask`): human / check / agent, AND/OR-combined. */
export function ResolveChips({ resolve, youLabel }: { resolve: Resolve | undefined; youLabel: string }) {
  const { leaves, mode } = flattenResolve(resolve);
  if (leaves.length === 0) return null;
  return (
    <Stack inline wrap align="center" as="span" direction="row" gap="75">
      {leaves.map((leaf, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <Typography mono size="2xs" type="note" variant="tertiary" weight="bold">
              {mode === "all" ? "AND" : "OR"}
            </Typography>
          )}
          <Badge size="sm" tone={leaf.kind === "check" ? "ok" : leaf.kind === "agent" ? "accent" : "neutral"}>
            <Stack inline align="center" as="span" direction="row" gap="50">
              <Icon name={leaf.kind === "agent" ? "bot" : leaf.kind === "check" ? "check" : "shield"} size="xs" />
              {leaf.kind === "human" ? youLabel : leaf.name}
            </Stack>
          </Badge>
        </Fragment>
      ))}
    </Stack>
  );
}
