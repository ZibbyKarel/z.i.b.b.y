import { notFound } from "next/navigation";
import { DetailScreen as CommandDetailScreen } from "../../../../../../features/commands/DetailScreen";
import { DetailScreen as HookDetailScreen } from "../../../../../../features/hooks/DetailScreen";
import { DetailScreen as McpDetailScreen } from "../../../../../../features/mcp/DetailScreen";
import type { RegistryKindParam } from "../../../../../../features/registries/screens/RegistriesScreen";
import { REGISTRY_KINDS } from "../../../../../../features/registries/screens/RegistriesScreen";
import { DetailScreen as SkillDetailScreen } from "../../../../../../features/skills/DetailScreen";

function isRegistryKind(value: string): value is RegistryKindParam {
  return (REGISTRY_KINDS as readonly string[]).includes(value);
}

/**
 * `/system/registries/<kind>/[id]` — moved verbatim from `/skills/[id]` etc.
 * (ZB-11); each per-kind `DetailScreen` (the unchanged edit forms) already
 * points its own back-link and post-save/delete redirects at the new route.
 */
export default async function RegistryDetailPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isRegistryKind(kind)) notFound();
  if (kind === "skills") return <SkillDetailScreen skillId={id} />;
  if (kind === "mcp") return <McpDetailScreen serverId={id} />;
  if (kind === "hooks") return <HookDetailScreen hookId={id} />;
  return <CommandDetailScreen commandId={id} />;
}
