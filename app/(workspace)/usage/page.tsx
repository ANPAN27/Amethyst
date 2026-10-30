import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconAi, IconCredits, IconShield } from "@/components/icons";
import { CheckoutButton } from "@/components/usage/checkout-button";
import { RefreshBalanceButton } from "@/components/usage/refresh-balance-button";
import {
  Badge,
  ButtonLink,
  EmptyState,
  Metric,
  Notice,
  PageHeader,
} from "@/components/ui/primitives";
import { getUsageData, getViewer } from "@/lib/server-data";
import { formatDateTime, formatMoney, pluralize, statusLabel, statusTone } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Usage & credits" };

function invoiceUrl(metadata: Record<string, unknown>): string | null {
  const value = metadata.invoice_url;
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

export default async function UsagePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getUsageData(viewer.user.id);
  const earned = data.transactions
    .filter((transaction) => transaction.delta > 0)
    .reduce((total, transaction) => total + transaction.delta, 0);
  const spent = data.transactions
    .filter((transaction) => transaction.delta < 0)
    .reduce((total, transaction) => total + Math.abs(transaction.delta), 0);

  return (
    <div className="page-stack">
      <PageHeader
        actions={
          <div className="row" style={{ gap: 8 }}>
            <RefreshBalanceButton />
            <ButtonLink href="/payments" variant="secondary"><IconCredits size={14} /> Payments</ButtonLink>
            <ButtonLink href="/ai" variant="quiet"><IconAi size={14} /> AI workspace</ButtonLink>
          </div>
        }
        description="Credits are reserved before an operation, committed on success, and released on failure. The ledger is authoritative."
        eyebrow="Account / usage & credits"
        title="Usage & credits"
      />

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
              <p>Only shown when the payment provider is fully configured.</p>
            </div>
            <Badge tone={data.paymentsConfigured ? "success" : "warning"}>
              {data.paymentsConfigured ? "Configured" : "Unavailable"}
            </Badge>
          </div>
          <div className="panel-body stack">
            {data.products.length === 0 ? (
              <EmptyState
                compact
                description="No server-side credit products are configured. AI usage still works while your balance lasts."
                icon={<IconCredits size={20} />}
                title="No credit products configured"
              />
            ) : (
              data.products.map((product) => (
                <div className="price-option" key={product.id}>
                  <div>
                    <strong>{pluralize(product.credits, "credit")}</strong>
                    <span>Product ID / {product.id}</span>
                  </div>
                  {data.paymentsConfigured ? (
                    <CheckoutButton credits={product.credits} productId={product.id} />
                  ) : (
                    <Badge tone="warning">Checkout unavailable</Badge>
                  )}
                </div>
              ))
            )}
            <Notice tone="neutral" title="How credits are added">
              A return URL or success page never grants credits. Grants occur only after the signed
              payment webhook is processed idempotently.
            </Notice>
          </div>
        </section>
      </div>

      <div className="metric-grid">
        <Metric label="Available" value={data.credits.available.toLocaleString()} detail="Authoritative balance" />
        <Metric label="Reserved" value={data.credits.reserved.toLocaleString()} detail="Pending AI runs" />
        <Metric label="Credits added" value={earned.toLocaleString()} detail="From recent ledger entries" />
        <Metric label="Credits used" value={spent.toLocaleString()} detail="Debits in recent history" />
        <Metric label="AI chat cost" value={`${data.chatCost}`} detail="Credits per request" />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent ledger</h2>
            <p>The latest 25 append-only credit transactions.</p>
          </div>
          <Badge mono>{data.transactions.length} entries</Badge>
        </div>
        {data.transactions.length === 0 ? (
          <EmptyState
            compact
            description="Credit grants, purchases, debits, and adjustments will appear here."
            icon={<IconCredits size={20} />}
            title="No ledger entries"
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Change</th>
                  <th>Balance after</th>
                  <th>Reference</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="primary-cell">{statusLabel(transaction.kind)}</td>
                    <td className={`mono-cell ${transaction.delta > 0 ? "transaction-amount-positive" : transaction.delta < 0 ? "transaction-amount-negative" : ""}`}>
                      {transaction.delta > 0 ? "+" : ""}{transaction.delta.toLocaleString()}
                    </td>
                    <td className="mono-cell">{transaction.balance_after.toLocaleString()}</td>
                    <td className="mono-cell">
                      {transaction.reference_type
                        ? `${transaction.reference_type}${transaction.reference_id ? ` / ${transaction.reference_id.slice(0, 12)}` : ""}`
                        : "—"}
                    </td>
                    <td className="mono-cell">{formatDateTime(transaction.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="panel-footer" style={{ justifyContent: "space-between" }}>
          <span className="table-footer-meta">Ledger is append-only</span>
          <Link className="btn btn-quiet btn-sm" href="/ai">
            Use credits in AI workspace
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Purchase history</h2>
            <p>Verified Dodo payments. A return URL never creates a purchase.</p>
          </div>
          <Badge mono>{data.payments.length} payments</Badge>
        </div>
        {data.payments.length === 0 ? (
          <EmptyState
            compact
            description="Completed test-mode or live payments will appear here after the signed webhook is processed."
            icon={<IconCredits size={20} />}
            title="No purchases yet"
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Credits</th>
                  <th>Amount</th>
                  <th>Dodo payment</th>
                  <th>Receipt</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => {
                  const receipt = invoiceUrl(payment.metadata);
                  return (
                    <tr key={payment.id}>
                      <td>
                        <Badge tone={statusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
                      </td>
                      <td className="mono-cell">
                        {payment.credits?.toLocaleString() ?? "—"}
                      </td>
                      <td className="mono-cell">
                        {formatMoney(payment.amount, payment.currency)}
                      </td>
                      <td className="mono-cell">
                        {payment.provider_payment_id
                          ? payment.provider_payment_id.slice(0, 18)
                          : "—"}
                      </td>
                      <td>
                        {receipt ? (
                          <a
                            className="row-link"
                            href={receipt}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Invoice
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="mono-cell">{formatDateTime(payment.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="panel-footer">
          <span className="table-footer-meta">
            Purchases are written only after signature verification and idempotent credit grants.
          </span>
        </div>
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
                <strong>AI chat</strong>
                <span>Grounded answer over finding evidence</span>
              </span>
              <span className="setting-row-value">{pluralize(data.chatCost, "credit")}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>Code generation</strong>
                <span>Review-only proposal</span>
              </span>
              <span className="setting-row-value">{pluralize(data.codegenCost, "credit")}</span>
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
              <h2>Controls</h2>
              <p>Why balances can change.</p>
            </div>
          </div>
          <div className="panel-body">
            <ul className="security-list">
              <li>
                <IconShield size={14} />
                <span>Reservations prevent concurrent AI runs from overspending.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Failed runs release the reserved amount.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Payment grants are idempotent and webhook-verified.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Balances are read from the ledger-backed account, never estimated client-side.</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
