import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { ClaimFlow } from "@/components/brand/ClaimFlow";

export default function ClaimPage() {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <ClaimFlow />
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}
