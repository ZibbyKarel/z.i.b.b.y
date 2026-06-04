import { useTranslations } from "next-intl";
import { Container, Stack, Typography } from "@zibby/design-system";

export default function DashboardLoading() {
  const t = useTranslations("common");
  return (
    <Container height="100%">
      { }
      <Stack align="center" justify="center" style={{ height: "100%" }}>
        <Typography
          mono
          uppercase
          size="caption"
           
          style={{ color: "var(--text-muted)" }}
          tracking="wider"
          type="note"
        >
          {t("loading")}
        </Typography>
      </Stack>
    </Container>
  );
}
