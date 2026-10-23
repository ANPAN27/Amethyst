import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight, IconClock, IconCredits } from "@/components/icons";

export const metadata: Metadata = { title: "Payment return" };

export default function BillingReturnPage() {
  return (
    <main className="error-page grid-pattern">
      <div className="error-card">
        <div className="eyebrow">Billing / return</div>
        <h1>Checkout returned.</h1>
        <p>
          This page does not grant credits. The signed Dodo Payments webhook is the only event that
          can add credits, and it is processed idempotently on the server.
        </p>
        <div className="notice notice-neutral" style={{ marginTop: 18 }}>
          <IconClock className="notice-icon" size={16} />
          <div className="notice-body">
            <strong>Balance may take a moment to update</strong>
            <span>
              Wait for webhook processing, then refresh your usage page. A redirect is never treated
              as proof of payment.
            </span>
          </div>
        </div>
        <div className="error-card-actions">
          <Link className="btn btn-primary" href="/usage">
            <IconCredits size={14} /> Review balance
          </Link>
          <Link className="btn btn-secondary" href="/overview">
            Workspace <IconArrowRight size={13} />
          </Link>
        </div>
      </div>
    </main>
  );
}
