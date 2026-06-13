import { Card, Container, Icon, Stack, Typography } from "@zibby/design-system";

export function FilePreview({ preview }: { preview: string }) {
  return (
    <Card background="background" radius="sm">
      <Container padding={["150", "150"]}>
        <Stack align="center" direction="row" gap="100">
          <Icon name="file" size="sm" tone="faint" />
          <Container minW0>
            <Typography mono truncate size="sm" type="note" variant="tertiary">
              {preview}
            </Typography>
          </Container>
        </Stack>
      </Container>
    </Card>
  );
}
