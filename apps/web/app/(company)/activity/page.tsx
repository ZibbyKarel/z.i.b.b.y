import { redirect } from "next/navigation";

/** `/activity` (ZB-07) → `/activity/log`, the section's default tab. */
export default function ActivityPage() {
  redirect("/activity/log");
}
