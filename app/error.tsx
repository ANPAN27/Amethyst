"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@/components/icons";
import { Button } from "@/components/ui/primitives";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui] route error", {
      name: error.name,
      message: error.message,
      digest: error.digest,
      ...(process.env.NODE_ENV !== "production" ? { stack: error.stack } : {}),
    });
  }, [error]);

  return (
    <main className="error-page grid-pattern">
      <div className="error-card">
        <div className="unavailable-mark" style={{ height: 48, width: 48 }}>
          <IconAlert size={22} />
        </div>
        <div className="eyebrow" style={{ marginTop: 16 }}>Unexpected error</div>
        <h1>The workspace could not finish that request.</h1>
        <p>
          No client-side fallback data is substituted. Retry the route; if the problem is a server
          configuration or database issue, the error will persist until it is corrected.
        </p>
        <div className="error-card-actions">
          <Button onClick={reset}>
            <IconRefresh size={14} /> Try again
          </Button>
          <Link className="btn btn-secondary" href="/overview">
            Return to overview
          </Link>
        </div>
        {error.digest ? (
          <p className="mono small muted" style={{ marginTop: 16 }}>
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
