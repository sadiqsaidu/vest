export function ComingUp({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <h2 className="text-2xl tracking-h2 text-text">Coming up</h2>
    </div>
  );
}
