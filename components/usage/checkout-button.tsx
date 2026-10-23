"use client";

import { useState } from "react";
import { IconArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import { formatClientError, pluralize } from "@/lib/ui";

export function CheckoutButton({ productId, credits }: { productId: string; credits: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const result = await apiRequest<{ checkout: { checkout_url: string } }>(
        "/api/v1/credits/checkout",
        {
          method: "POST",
          body: JSON.stringify({ product_id: productId }),
        },
      );
      window.location.assign(result.checkout.checkout_url);
    } catch (caught) {
      toast.push({
        title: "Checkout unavailable",
        description: formatClientError(caught),
        tone: "danger",
      });
      setBusy(false);
    }
  }

  return (
    <Button disabled={busy} onClick={start} size="sm" variant="secondary">
      {busy ? "Opening…" : `Buy ${pluralize(credits, "credit")}`}
      <IconArrowRight size={12} />
    </Button>
  );
}
