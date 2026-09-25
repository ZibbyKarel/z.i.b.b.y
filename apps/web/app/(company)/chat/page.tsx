import { redirect } from "next/navigation";

/** ROUTE-MAP §2: `/chat` → `/org` (ZB-02) — the chat engine lives in the shell's
 *  COO dock now (ZB-01/ZB-12); the `Screen` component this page used to render
 *  stays in place, unused, until ZB-13 deletes it. */
export default function ChatPage() {
  redirect("/org");
}
