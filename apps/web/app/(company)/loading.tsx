import { useTranslations } from "next-intl";
import { Container, Progress, Stack, Typography } from "@zibby/design-system";

export default function DashboardLoading() {
  const t = useTranslations("common");
  return (
    <Container height="100%">
      <Stack align="center" justify="center" style={{ height: "100%" }}>
        <Stack align="center" gap="150" role="status">
          <Typography mono tracking="wider" type="labelSm" variant="secondary">
            {t("loading")}
          </Typography>
          <Container maxWidth="220px" width="100%">
            <Progress indeterminate height="25" />
          </Container>
        </Stack>
      </Stack>
    </Container>
  );
}
