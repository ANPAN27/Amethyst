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
} from "@/components/ui/primitives";
import { getCreditTransactionHistory, getViewer } from "@/lib/server-data";
import {
  creditTransactionLabel,
  formatDateTime,
  totalPages,
} from "@/lib/ui";
import type { CreditTransactionFilter } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Credit transactions" };

const PAGE_SIZE = 25;
const FILTERS: Array<{ value: CreditTransactionFilter; label: string }> = [
  { value: "all", label: "All transactions" },
  { value: "added", label: "Credits added" },
  { value: "consumed", label: "Credits consumed" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(first(value) ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function normalizeFilter(value: string | string[] | undefined): CreditTransactionFilter {
  const raw = first(value);
  return raw === "added" || raw === "consumed" ? raw : "all";
}

export default async function CreditTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const page = parsePage(params.page);
  const filter = normalizeFilter(params.filter);
  const offset = (page - 1) * PAGE_SIZE;
  const data = await getCreditTransactionHistory(
    viewer.user.id,
    filter,
    PAGE_SIZE,
    offset,
  );
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
        description="The append-only ledger shows every credit grant, pack purchase, AI debit, and adjustment on your account."
        eyebrow="Account / payments / credit activity"
        title="Credit transactions"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Ledger</h2>
            <p>
              {data.total.toLocaleString()} {data.total === 1 ? "entry" : "entries"} for this
              filter.
            </p>
          </div>
          <Badge mono>{page} / {pages}</Badge>
        </div>
        <div className="payment-filter-bar">
          {FILTERS.map((item) => {
            const href =
              item.value === "all"
                ? "/payments/transactions"
                : `/payments/transactions?filter=${item.value}`;
            const active = filter === item.value;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`payment-filter${active ? " payment-filter-active" : ""}`}
                href={href}
                key={item.value}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        {data.transactions.length === 0 ? (
          <EmptyState
            compact
            description="Credit activity appears after a purchase or AI operation."
            icon={<IconCredits size={20} />}
            title="No matching transactions"
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
                {data.transactions.map((transaction) => (
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
                              ? ` / ${transaction.reference_id.slice(0, 14)}`
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
        <div className="panel-footer" style={{ justifyContent: "space-between" }}>
          <span className="table-footer-meta">
            Page {page} of {pages}
          </span>
          <div className="row" style={{ gap: 8 }}>
            {page > 1 ? (
              <Link
                className="btn btn-quiet btn-sm"
                href={`/payments/transactions?filter=${filter}&page=${page - 1}`}
              >
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                className="btn btn-quiet btn-sm"
                href={`/payments/transactions?filter=${filter}&page=${page + 1}`}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
