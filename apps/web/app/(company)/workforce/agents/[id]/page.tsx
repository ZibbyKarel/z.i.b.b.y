import { PersonProfileScreen } from "../../../../../features/departments/screens/PersonProfileScreen";

export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonProfileScreen employeeId={id} />;
}
