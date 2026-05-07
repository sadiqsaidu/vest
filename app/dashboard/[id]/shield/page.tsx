import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { ShieldFlow } from "@/components/brand/ShieldFlow";

export default function ShieldPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <ShieldFlow id={params.id} />
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}
