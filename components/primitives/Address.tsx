"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn, truncateAddress } from "@/lib/utils";

type AddressProps = {
  pubkey: string;
  chars?: number;
  className?: string;
};

export function Address({ pubkey, chars = 4, className }: AddressProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(pubkey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={pubkey}
      className={cn(
        "group inline-flex items-center gap-1.5 font-mono text-sm",
        "hover:text-text transition-colors",
        className,
      )}
    >
      <span>{truncateAddress(pubkey, chars)}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </span>
    </button>
  );
}
