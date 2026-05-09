import { AuditView } from "@/components/brand/AuditView";

export default function AuditPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  return (
    <main className="pt-2">
      <AuditView initialKey={searchParams?.key} />
    </main>
  );
}
