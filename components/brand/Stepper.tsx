import { cn } from "@/lib/utils";

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-3">
          <span
            className={cn(
              i === current ? "text-text" : "text-text-subtle",
              "tracking-tight",
            )}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <span className="h-px w-8 bg-border" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
