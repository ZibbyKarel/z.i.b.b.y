import { Ref } from "react";

/** Set both the internal scroll ref and a forwarded consumer ref. */
export function mergeRefs<T>(internal: { current: T | null }, external?: Ref<T>) {
  return (node: T | null) => {
    internal.current = node;
    if (typeof external === "function") external(node);
    else if (external) (external as { current: T | null }).current = node;
  };
}
