import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = { title: "Checkout canceled" };

export default function BillingCancelPage() {
  return (
    <main className="error-page grid-pattern">
      <div className="error-card">
        <div className="eyebrow">Billing / canceled</div>
        <h1>Checkout canceled.</h1>
        <p>
          No payment was taken and no credits were added. You can start a new checkout from the
          usage page at any time.
        </p>
        <div className="error-card-actions">
          <Link className="btn btn-primary" href="/usage">
            Return to usage
          </Link>
          <Link className="btn btn-secondary" href="/overview">
            Workspace <IconArrowRight size={13} />
          </Link>
        </div>
      </div>
    </main>
  );
}
