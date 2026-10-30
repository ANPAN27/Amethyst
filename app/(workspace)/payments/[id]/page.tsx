import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { IconExternal, IconShield } from "@/components/icons";
import { RefreshBalanceButton } from "@/components/usage/refresh-balance-button";
import {
  Badge,
  ButtonLink,
  Notice,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { getPaymentDetail, getViewer } from "@/lib/server-data";
import { formatDateTime, formatMoney, statusLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment details" };

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function invoiceUrl(metadata: Record<string, unknown>): string | null {
  const value = metadata.invoice_url;
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const rawId = (await params).id;
  const parsedId = z.string().uuid().safeParse(rawId);
  if (!parsedId.success) notFound();

  const detail = await getPaymentDetail(viewer.user.id, parsedId.data);
  if (!detail) notFound();

  const { payment, checkout, transaction } = detail;
  const receipt = invoiceUrl(payment.metadata);
  const refundId = metadataString(payment.metadata, "refund_id");
  const productName = checkout?.product_id ?? payment.product_id ?? "Credit pack";

  return (
    <div className="page-stack">
      <PageHeader
        actions={
          <div className="row" style={{ gap: 8 }}>
            <RefreshBalanceButton />
            <ButtonLink href="/payments/history" variant="secondary">
              Back to history
            </ButtonLink>
            <ButtonLink href="/payments" variant="quiet">
              Payments overview
            </ButtonLink>
          </div>
        }
        description="A single verified payment record. Only the authenticated owner can view this page."
        eyebrow="Account / payments / details"
        title="Payment details"
      />

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Payment</h2>
              <p>Recorded from a signed Dodo Payments webhook.</p>
            </div>
            <StatusBadge status={payment.status} />
          </div>
          <div className="panel-body">
            <div className="payment-detail-grid">
              <div>
                <span>Payment reference</span>
                <strong className="mono">{payment.provider_payment_id ?? "—"}</strong>
              </div>
              <div>
                <span>Amethyst record</span>
                <strong className="mono">{payment.id}</strong>
              </div>
              <div>
                <span>Product purchased</span>
                <strong>{productName}</strong>
              </div>
              <div>
                <span>Credits received</span>
                <strong>{payment.credits?.toLocaleString() ?? "—"}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{formatMoney(payment.amount, payment.currency)}</strong>
              </div>
              <div>
                <span>Currency</span>
                <strong>{payment.currency ?? "—"}</strong>
              </div>
              <div>
                <span>Payment date</span>
                <strong>{formatDateTime(payment.created_at)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{statusLabel(payment.status)}</strong>
              </div>
              <div>
                <span>Dodo checkout reference</span>
                <strong className="mono">{checkout?.id ?? payment.checkout_session_id ?? "—"}</strong>
              </div>
              <div>
                <span>Credit ledger entry</span>
                <strong className="mono">{transaction?.id ?? "—"}</strong>
              </div>
            </div>
            {receipt ? (
              <div className="payment-detail-actions">
                <a className="btn btn-secondary btn-sm" href={receipt} rel="noreferrer" target="_blank">
                  Open Dodo receipt <IconExternal size={12} />
                </a>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Verification</h2>
              <p>How this record was created.</p>
            </div>
            <Badge tone="success">Verified</Badge>
          </div>
          <div className="panel-body">
            <ul className="security-list">
              <li>
                <IconShield size={14} />
                <span>The webhook signature was checked against the raw request body.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>The checkout belongs to your authenticated Supabase user.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Product, currency, amount, and credits matched server-side records.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Credit granting is idempotent by Dodo payment id.</span>
              </li>
            </ul>
            {refundId ? (
              <Notice tone="warning" title="Refund recorded">
                Dodo refund reference <span className="mono">{refundId}</span>.
              </Notice>
            ) : null}
            {payment.status === "failed" ? (
              <Notice tone="danger" title="Payment failed">
                No credits were granted for this attempt. You can start a new checkout from the
                payments overview.
              </Notice>
            ) : null}
            {payment.status === "cancelled" ? (
              <Notice tone="warning" title="Payment cancelled">
                No credits were granted for this attempt.
              </Notice>
            ) : null}
            {payment.status === "pending" || payment.status === "processing" ? (
              <Notice tone="warning" title="Payment pending">
                Credits appear only after a verified payment.succeeded webhook.
              </Notice>
            ) : null}
          </div>
          <div className="panel-footer">
            <Link className="row-link" href="/payments/transactions">
              View credit transactions
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
