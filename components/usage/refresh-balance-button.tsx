"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconRefresh } from "@/components/icons";
import { Button } from "@/components/ui/primitives";

export function RefreshBalanceButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      size="sm"
      variant="quiet"
    >
      <IconRefresh size={13} />
      {pending ? "Refreshing…" : "Refresh balance"}
    </Button>
  );
}
