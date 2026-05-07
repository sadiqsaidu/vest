import Link from "next/link";
import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { Button } from "@/components/ui/button";

export default function ViewingKeysPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <div className="mx-auto max-w-container px-6 py-10 space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl tracking-h1">Viewing keys</h1>
              <p className="text-sm text-text-muted">
                Issue a viewing key to share read access with auditors, lawyers,
                or beneficiaries&rsquo; tax preparers. Coming next.
              </p>
            </div>
            <Link href={`/dashboard/${params.id}`}>
              <Button variant="ghost">Back to dashboard</Button>
            </Link>
          </div>
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}
