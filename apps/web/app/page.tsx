import { redirect } from "next/navigation";

/** ROUTE-MAP §2: `/` → `/org` (ZB-02 ships the org map, so the TODO this file
 *  used to carry is resolved — `/chat` is no longer home). */
export default function RootPage() {
  redirect("/org");
}
