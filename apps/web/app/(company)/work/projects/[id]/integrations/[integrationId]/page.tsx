import { DetailScreen } from "../../../../../../../features/integrations/DetailScreen";

export default async function WorkIntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string; integrationId: string }>;
}) {
  const { id, integrationId } = await params;
  return <DetailScreen integrationId={integrationId} projectId={id} />;
}
