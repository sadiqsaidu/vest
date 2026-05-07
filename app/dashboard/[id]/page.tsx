import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { CapTableDetail } from "@/components/brand/CapTableDetail";

export default function CapTableDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <CapTableDetail id={params.id} />
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}
