import { DetailScreen } from "../../../../../../features/integrations/DetailScreen";

export default async function CompanyIntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string; integrationId: string }>;
}) {
  const { id, integrationId } = await params;
  return <DetailScreen companyId={id} integrationId={integrationId} />;
}
