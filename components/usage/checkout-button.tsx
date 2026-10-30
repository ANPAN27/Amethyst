"use client";

import { useState } from "react";
import { IconArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import { formatClientError, pluralize } from "@/lib/ui";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md";

export function CheckoutButton({
  productId,
  credits,
  label,
  variant = "secondary",
  size = "sm",
  className,
  disabled = false,
}: {
  productId: string;
  credits: number;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}) {
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
    <Button
      className={className}
      disabled={busy || disabled}
      onClick={start}
      size={size}
      variant={variant}
    >
      {busy ? "Opening…" : (label ?? `Buy ${pluralize(credits, "credit")}`)}
      <IconArrowRight size={12} />
    </Button>
  );
}
