import { redirect } from "next/navigation";

/** ROUTE-MAP §2 — the old catalog list has no single pipeline to resolve a
 * department from; it goes straight to the org map. */
export default function PipelinesRedirectPage() {
  redirect("/org");
}
