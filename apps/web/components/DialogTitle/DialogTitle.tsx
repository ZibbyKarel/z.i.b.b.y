import { Container, type IconName, IconTile, Stack, Typography } from "@zibby/design-system";

export interface DialogTitleProps {
  glyph: IconName;
  title: string;
  subtitle: string;
}

export function DialogTitle({ glyph, title, subtitle }: DialogTitleProps) {
  return (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph={glyph} size="md" />
      <Container grow minW0>
        <Typography mono size="xl" type="note" weight="bold">
          {title}
        </Typography>
        <Typography mono size="xs" type="note" variant="tertiary">
          {subtitle}
        </Typography>
      </Container>
    </Stack>
  );
}
