import { redirect } from "next/navigation";

/** `/inbox` → its first sub-page (spec decision 15: Overview is the first submenu entry). */
export default function InboxPage() {
  redirect("/inbox/overview");
}
