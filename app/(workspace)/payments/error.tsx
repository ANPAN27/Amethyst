"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@/components/icons";
import { Button } from "@/components/ui/primitives";

export default function PaymentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[payments] route error", {
      message: error.message,
      digest: error.digest,
      ...(process.env.NODE_ENV !== "production" ? { stack: error.stack } : {}),
    });
  }, [error]);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-body stack" style={{ alignItems: "flex-start", gap: 14 }}>
          <div className="unavailable-mark" style={{ height: 48, width: 48 }}>
            <IconAlert size={22} />
          </div>
          <div>
            <div className="eyebrow">Payments unavailable</div>
            <h2>Payment data could not be loaded.</h2>
            <p className="muted" style={{ marginTop: 8, maxWidth: 640 }}>
              The server could not complete the payment request. No fallback or simulated payment
              data has been substituted. Retry the request; if the problem persists, check the
              Supabase migration and server configuration.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={reset}>
              <IconRefresh size={14} /> Retry payments
            </Button>
            <Link className="btn btn-secondary" href="/overview">
              Return to overview
            </Link>
          </div>
          {error.digest ? (
            <p className="mono small muted">Reference: {error.digest}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
