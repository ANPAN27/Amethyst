"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconDownload } from "@/components/icons";
import { IconButton } from "@/components/ui/primitives";
import { safeDownloadName } from "@/lib/ui";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="copy-button" onClick={copy} type="button">
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({
  code,
  language = "text",
  filename,
  maxHeight,
}: {
  code: string;
  language?: string;
  filename?: string;
  maxHeight?: number;
}) {
  function download() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeDownloadName(filename ?? `amethyst-output.${language}`);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-title">{filename ?? language}</span>
        <div className="code-block-actions">
          <CopyButton value={code} />
          <IconButton label="Download code" onClick={download}>
            <IconDownload size={15} />
          </IconButton>
        </div>
      </div>
      <pre className="code-block-pre" style={maxHeight ? { maxHeight } : undefined}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
