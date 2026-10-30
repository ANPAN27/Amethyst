import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconCredits } from "@/components/icons";
import { RefreshBalanceButton } from "@/components/usage/refresh-balance-button";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { getPaymentHistory, getViewer } from "@/lib/server-data";
import { formatDateTime, formatMoney, totalPages } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment history" };

const PAGE_SIZE = 25;

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function PaymentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const page = parsePage((await searchParams).page);
  const offset = (page - 1) * PAGE_SIZE;
  const data = await getPaymentHistory(viewer.user.id, PAGE_SIZE, offset);
  const pages = totalPages(data.total, PAGE_SIZE);

  return (
    <div className="page-stack">
      <PageHeader
        actions={
          <div className="row" style={{ gap: 8 }}>
            <RefreshBalanceButton />
            <ButtonLink href="/payments" variant="secondary">
              Payments overview
            </ButtonLink>
          </div>
        }
        description="Verified Dodo Payments records for your account only. Failed, cancelled, and pending attempts are retained for audit."
        eyebrow="Account / payments / history"
        title="Payment history"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>All payments</h2>
            <p>
              {data.total.toLocaleString()} {data.total === 1 ? "payment" : "payments"} recorded.
            </p>
          </div>
          <Badge mono>{page} / {pages}</Badge>
        </div>
        {data.payments.length === 0 ? (
          <EmptyState
            compact
            description="Start a test-mode credit purchase from the Payments overview."
            icon={<IconCredits size={20} />}
            title="No payments yet"
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payment ID</th>
                  <th>Product / credit pack</th>
                  <th>Amount</th>
                  <th>Credits</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="mono-cell">{formatDateTime(payment.created_at)}</td>
                    <td className="mono-cell">
                      {payment.provider_payment_id?.slice(0, 20) ?? payment.id.slice(0, 20)}
                    </td>
                    <td className="primary-cell">{payment.product_id ?? "Credit pack"}</td>
                    <td className="mono-cell">{formatMoney(payment.amount, payment.currency)}</td>
                    <td className="mono-cell">{payment.credits?.toLocaleString() ?? "—"}</td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td>
                      <Link className="row-link" href={`/payments/${payment.id}`}>
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="panel-footer" style={{ justifyContent: "space-between" }}>
          <span className="table-footer-meta">
            Page {page} of {pages}
          </span>
          <div className="row" style={{ gap: 8 }}>
            {page > 1 ? (
              <Link className="btn btn-quiet btn-sm" href={`/payments/history?page=${page - 1}`}>
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="btn btn-quiet btn-sm" href={`/payments/history?page=${page + 1}`}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
