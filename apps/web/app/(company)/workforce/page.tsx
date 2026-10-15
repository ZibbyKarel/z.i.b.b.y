import { redirect } from "next/navigation";

/** `/workforce` → its first tab. */
export default function WorkforcePage() {
  redirect("/workforce/agents");
}
