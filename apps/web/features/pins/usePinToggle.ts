import type { EntityPinKind, Pin } from "@zibby/contracts";
import { useSetPinsMutation } from "./mutations/useSetPinsMutation";
import { usePinsQuery } from "./queries/usePinsQuery";

function pinKey(p: Pin) {
  return `${p.kind}:${p.id}`;
}

/** Read the current pin list and expose an is-pinned check + a toggle mutator,
 *  for the catalog-entity kinds (agent/workflow/employee). Page pins go
 *  through `usePagePins` — they carry a label an entity pin doesn't. */
export function usePinToggle() {
  const { data: pins = [] } = usePinsQuery();
  const setPins = useSetPinsMutation();

  const isPinned = (kind: EntityPinKind, id: string) =>
    pins.some((p) => p.kind === kind && p.id === id);

  const toggle = (kind: EntityPinKind, id: string) => {
    const key = `${kind}:${id}`;
    const next = isPinned(kind, id)
      ? pins.filter((p) => pinKey(p) !== key)
      : [...pins, { kind, id }];
    setPins.mutate({ body: next });
  };

  return { pins, isPinned, toggle, isPending: setPins.isPending };
}
