import type { PagePin, Pin } from "@zibby/contracts";
import { useSetPinsMutation } from "./mutations/useSetPinsMutation";
import { usePinsQuery } from "./queries/usePinsQuery";

function isPagePin(pin: Pin): pin is PagePin {
  return pin.kind === "page";
}

/** Read the current page pins (the sidebar "Pinned" list) and expose
 *  pin/unpin mutators keyed by href — the page-pin counterpart to
 *  `usePinToggle`, which only knows the catalog-entity kinds. */
export function usePagePins() {
  const { data: pins = [] } = usePinsQuery();
  const setPins = useSetPinsMutation();

  const pagePins = pins.filter(isPagePin);

  const isPagePinned = (href: string) => pagePins.some((p) => p.id === href);

  const pinPage = (href: string, label: string) => {
    const next: Pin[] = [
      ...pins.filter((p) => !(p.kind === "page" && p.id === href)),
      { kind: "page", id: href, label },
    ];
    setPins.mutate({ body: next });
  };

  const unpinPage = (href: string) => {
    const next = pins.filter((p) => !(p.kind === "page" && p.id === href));
    setPins.mutate({ body: next });
  };

  return { pagePins, isPagePinned, pinPage, unpinPage, isPending: setPins.isPending };
}
