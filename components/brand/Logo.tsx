import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "font-mono text-base lowercase tracking-tight text-text",
        className,
      )}
    >
      vest
    </Link>
  );
}
