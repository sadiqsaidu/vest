"use client";

import { formatRelative, cn } from "@/lib/utils";

type TimestampProps = {
  date: Date;
  className?: string;
};

export function Timestamp({ date, className }: TimestampProps) {
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className={cn("font-mono text-sm text-text-muted", className)}
    >
      {formatRelative(date)}
    </time>
  );
}
