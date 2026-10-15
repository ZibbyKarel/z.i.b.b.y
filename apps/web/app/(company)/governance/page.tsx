import { redirect } from "next/navigation";

/** `/governance` → its first tab. */
export default function GovernancePage() {
  redirect("/governance/approvals");
}
