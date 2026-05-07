import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { RequireWallet } from "@/components/brand/RequireWallet";
import { CreateVestFlow } from "@/components/brand/CreateVestFlow";

export default function NewVestPage() {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <RequireWallet>
          <CreateVestFlow />
        </RequireWallet>
      </main>
      <Footer />
    </>
  );
}
