import type { HTMLAttributes, Ref } from "react";
import { Button } from "../Button/Button";
import { Container } from "../Container/Container";
import { Row, Stack } from "../Stack/Stack";
import { Tag } from "../Tag/Tag";
import { Typography } from "../Typography/Typography";

export enum ContactRowTestId {
  Root = "contact-row-root",
  Initial = "contact-row-initial",
  Name = "contact-row-name",
  Sub = "contact-row-sub",
  Vip = "contact-row-vip",
  Remove = "contact-row-remove",
}

export interface ContactRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  name: string;
  /** Secondary line — role, or role + comms style. */
  sub?: string;
  /** Key-contact marker (D-011's "Communications always asks before writing to
   *  them") — present and toggleable via `onToggleVip`. */
  vip?: boolean;
  onToggleVip?: () => void;
  onRemove?: () => void;
  vipLabel?: string;
  removeLabel?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * `Work Screens.dc.html` → Companies/Teams contacts list — a monogram square, the
 * name/role, a toggleable KEY marker and a remove action. Shared by the
 * Companies and Teams detail screens (D-003: teams follow the companies pattern).
 */
export function ContactRow({
  name,
  sub,
  vip = false,
  onToggleVip,
  onRemove,
  vipLabel = "Key",
  removeLabel = "Remove contact",
  ref,
  ...rest
}: ContactRowProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Container data-testid={ContactRowTestId.Root} padding={["100", "150"]} ref={ref} {...rest}>
      <Row align="center" gap="100">
        <div
          aria-hidden="true"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center border border-line-2 font-mono text-[11px] font-semibold"
          data-testid={ContactRowTestId.Initial}
        >
          {initial}
        </div>
        <Stack grow gap="25">
          <Typography truncate data-testid={ContactRowTestId.Name} type="labelSm" weight="semibold">
            {name}
          </Typography>
          {sub && (
            <Typography
              truncate
              data-testid={ContactRowTestId.Sub}
              type="caption"
              variant="secondary"
            >
              {sub}
            </Typography>
          )}
        </Stack>
        {onToggleVip && (
          <Tag
            uppercase
            data-testid={ContactRowTestId.Vip}
            onClick={onToggleVip}
            tone={vip ? "thinking" : "neutral"}
          >
            {vipLabel}
          </Tag>
        )}
        {onRemove && (
          <Button
            aria-label={removeLabel}
            data-testid={ContactRowTestId.Remove}
            icon="x"
            intent="ghost"
            onClick={onRemove}
            size="sm"
          />
        )}
      </Row>
    </Container>
  );
}
