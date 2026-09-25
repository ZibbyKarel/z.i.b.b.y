import { redirect } from "next/navigation";

/** ZB-10: `/ledger` has no screen of its own — land on its first tab. */
export default function LedgerPage() {
  redirect("/ledger/budgets");
}
