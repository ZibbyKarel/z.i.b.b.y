import { CompanyDetailScreen } from "../../../../../features/companies/screens/CompanyDetailScreen";

export default async function WorkCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompanyDetailScreen companyId={id} />;
}
