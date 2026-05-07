import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn("vest-skeleton block rounded-md", className)}
    />
  );
}
