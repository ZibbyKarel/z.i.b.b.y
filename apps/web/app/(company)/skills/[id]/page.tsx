import { DetailScreen } from "../../../../features/skills/DetailScreen";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen skillId={id} />;
}
