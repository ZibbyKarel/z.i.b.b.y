import { DetailScreen } from "../../../../features/companies/DetailScreen";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen companyId={id} />;
}
