import { notFound } from "next/navigation";
import { RegistriesScreen } from "../../../../../../features/registries/screens/RegistriesScreen";
import {
  REGISTRY_KINDS,
  type RegistryKindParam,
} from "../../../../../../features/registries/registryKinds";

function isRegistryKind(value: string): value is RegistryKindParam {
  return (REGISTRY_KINDS as readonly string[]).includes(value);
}

export default async function RegistryKindNewPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!isRegistryKind(kind)) notFound();
  return <RegistriesScreen openCreateOnMount kind={kind} />;
}
