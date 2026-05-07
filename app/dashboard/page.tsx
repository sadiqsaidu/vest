import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { ComingUp } from "@/components/brand/ComingUp";

export default function DashboardPage() {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <ComingUp label="Founder mode" />
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}
