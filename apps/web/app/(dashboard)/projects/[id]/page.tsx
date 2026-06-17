import { ProfileScreen } from "../../../../features/projects/ProfileScreen";

export default async function ProjectProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfileScreen projectId={id} />;
}
