import { redirect } from "next/navigation";

/** `/overview` is deleted (F8d, O2/O3) — `/chat` is home now, the one world the
 * whole HUD → Chat UI migration arc has been building toward.
 *
 * TODO(ZB-02): ROUTE-MAP §2 wants `/` → `/org`, but `/org` doesn't exist until
 * ZB-02 ships the org map. Keep pointing at `/chat` (still a real, rendering
 * route inside the ZibbyCorp shell) until then. */
export default function RootPage() {
  redirect("/chat");
}
