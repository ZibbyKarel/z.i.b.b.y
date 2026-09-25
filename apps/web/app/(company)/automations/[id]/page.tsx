import { DetailScreen } from "../../../../features/automations/DetailScreen";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DetailScreen automationId={id} />;
}
