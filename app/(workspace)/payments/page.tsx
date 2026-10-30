import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconAi, IconCredits, IconShield } from "@/components/icons";
import { CreditPackCard } from "@/components/payments/credit-pack-card";
import { RefreshBalanceButton } from "@/components/usage/refresh-balance-button";
import {
  Badge,
  ButtonLink,
  EmptyState,
  Metric,
  Notice,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { serverConfig } from "@/lib/config";
import { getPaymentsOverview, getViewer } from "@/lib/server-data";
import { creditTransactionLabel, formatDateTime, formatMoney, pluralize } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payments" };

function paymentPackName(productId: string | null, packs: { id: string; name: string }[]) {
  if (!productId) return "Credit pack";
  return packs.find((pack) => pack.id === productId)?.name ?? productId;
}

export default async function PaymentsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getPaymentsOverview(viewer.user.id);
  const packOptions = data.packs.map((pack) => ({ id: pack.id, name: pack.name }));

  return (
    <div className="page-stack">
      <PageHeader
        actions={
          <div className="row" style={{ gap: 8 }}>
            <RefreshBalanceButton />
            <ButtonLink href="/payments/history" variant="secondary">
              Payment history
            </ButtonLink>
            <ButtonLink href="/ai" variant="quiet">
              <IconAi size={14} /> AI workspace
            </ButtonLink>
          </div>
        }
        description="Buy credit packs, track every verified payment, and see exactly how credits enter and leave your account."
        eyebrow="Account / payments"
        title="Payments"
      />

      {data.paymentConfigurationIssues.length > 0 ? (
        <Notice tone="warning" title="Payments configuration incomplete">
          Missing or invalid server configuration:{" "}
          <span className="mono">{data.paymentConfigurationIssues.join(", ")}</span>. Credit packs
          stay unavailable until the server configuration is corrected.
        </Notice>
      ) : null}

      <div className="usage-hero">
        <section className="balance-panel">
          <div className="eyebrow">Available balance</div>
          <div className="balance-value">{data.credits.available.toLocaleString()}</div>
          <p className="balance-caption">
            Spendable credits. {data.credits.reserved.toLocaleString()} currently reserved for AI
            operations in flight.
          </p>
          <div className="balance-split">
            <div>
              <span>Available</span>
              <strong>{data.credits.available.toLocaleString()}</strong>
            </div>
            <div>
              <span>Reserved</span>
              <strong>{data.credits.reserved.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Credit packs</h2>
              <p>One-time purchases. Credits are granted only after a verified payment webhook.</p>
            </div>
            <Badge tone={data.packs.some((pack) => pack.checkoutReady) ? "success" : "warning"}>
              {data.packs.some((pack) => pack.checkoutReady) ? "Test mode ready" : "Unavailable"}
            </Badge>
          </div>
          <div className="panel-body">
            {data.packs.length === 0 ? (
              <EmptyState
                compact
                description="No active credit products are configured on the server."
                icon={<IconCredits size={20} />}
                title="No credit packs available"
              />
            ) : (
              <div className="payment-pack-grid">
                {data.packs.map((pack) => (
                  <CreditPackCard key={pack.id} pack={pack} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="metric-grid">
        <Metric
          detail="Authoritative ledger balance"
          label="Available credits"
          value={data.credits.available.toLocaleString()}
        />
        <Metric
          detail="All credit grants and purchases"
          label="Credits purchased"
          value={data.totals.purchased.toLocaleString()}
        />
        <Metric
          detail="AI operations and adjustments"
          label="Credits consumed"
          value={data.totals.consumed.toLocaleString()}
        />
        <Metric
          detail="Verified by signed webhook"
          label="Successful payments"
          value={data.successfulPayments.toLocaleString()}
        />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent payments</h2>
            <p>Only payments that belong to your account are shown.</p>
          </div>
          <Link className="row-link" href="/payments/history">
            View all
          </Link>
        </div>
        {data.recentPayments.length === 0 ? (
          <EmptyState
            compact
            description="Completed and failed test-mode payments will appear here after Dodo sends a signed webhook."
            icon={<IconCredits size={20} />}
            title="No payments yet"
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Credit pack</th>
                  <th>Amount</th>
                  <th>Credits</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="mono-cell">{formatDateTime(payment.created_at)}</td>
                    <td className="mono-cell">
                      {payment.provider_payment_id?.slice(0, 18) ?? "—"}
                    </td>
                    <td className="primary-cell">
                      {paymentPackName(payment.product_id, packOptions)}
                    </td>
                    <td className="mono-cell">{formatMoney(payment.amount, payment.currency)}</td>
                    <td className="mono-cell">{payment.credits?.toLocaleString() ?? "—"}</td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td>
                      <Link className="row-link" href={`/payments/${payment.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="panel-footer">
          <span className="table-footer-meta">
            A return URL never grants credits. Webhook verification is authoritative.
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent credit activity</h2>
            <p>Every credit grant, purchase, and AI debit is recorded in the ledger.</p>
          </div>
          <Link className="row-link" href="/payments/transactions">
            View all
          </Link>
        </div>
        {data.recentTransactions.length === 0 ? (
          <EmptyState
            compact
            description="Purchases and AI usage will appear here once credits move."
            icon={<IconCredits size={20} />}
            title="No credit activity"
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Change</th>
                  <th>Balance after</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="mono-cell">{formatDateTime(transaction.created_at)}</td>
                    <td className="primary-cell">{creditTransactionLabel(transaction)}</td>
                    <td
                      className={`mono-cell ${
                        transaction.delta > 0
                          ? "transaction-amount-positive"
                          : transaction.delta < 0
                            ? "transaction-amount-negative"
                            : ""
                      }`}
                    >
                      {transaction.delta > 0 ? "+" : ""}
                      {transaction.delta.toLocaleString()}
                    </td>
                    <td className="mono-cell">{transaction.balance_after.toLocaleString()}</td>
                    <td className="mono-cell">
                      {transaction.reference_type
                        ? `${transaction.reference_type}${
                            transaction.reference_id
                              ? ` / ${transaction.reference_id.slice(0, 12)}`
                              : ""
                          }`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Operation pricing</h2>
              <p>Server-authoritative credit cost.</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>AI analysis</strong>
                <span>Grounded answer over finding evidence</span>
              </span>
              <span className="setting-row-value">
                {pluralize(serverConfig.credits.aiChat, "credit")}
              </span>
            </div>
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>Code generation</strong>
                <span>Review-only proposal</span>
              </span>
              <span className="setting-row-value">
                {pluralize(serverConfig.credits.codegen, "credit")}
              </span>
            </div>
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>Analysis jobs</strong>
                <span>Performed by your local companion</span>
              </span>
              <span className="setting-row-value">No AI debit</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Payment safety</h2>
              <p>How Amethyst protects your credits.</p>
            </div>
          </div>
          <div className="panel-body">
            <ul className="security-list">
              <li>
                <IconShield size={14} />
                <span>Every checkout is tied to your authenticated Supabase user.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Dodo webhook signatures are verified against the raw request body.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Credits are granted exactly once using provider payment ids.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Users can read their own payment history, but cannot write balances.</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <Notice tone="neutral" title="Test mode only">
        This integration is running against Dodo Payments test mode. Use documented test payment
        methods; no live charge is created from this dashboard.
      </Notice>
    </div>
  );
}
