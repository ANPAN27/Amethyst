"use client";

import { useState } from "react";
import { IconDownload } from "@/components/icons";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import { formatClientError } from "@/lib/ui";

export function ArtifactDownloadButton({
  jobId,
  label = "Download evidence",
  variant = "secondary",
  size = "sm",
}: {
  jobId: string;
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const result = await apiRequest<{ url: string; expires_in_seconds: number }>(
        `/api/v1/jobs/${jobId}/artifact`,
      );
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      anchor.click();
      toast.push({
        title: "Signed download opened",
        description: `The link expires in ${Math.round(result.expires_in_seconds / 60)} minutes.`,
        tone: "success",
      });
    } catch (caught) {
      toast.push({ title: "Download unavailable", description: formatClientError(caught), tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button disabled={busy} onClick={download} size={size} variant={variant}>
      <IconDownload size={13} />
      {busy ? "Signing…" : label}
    </Button>
  );
}
