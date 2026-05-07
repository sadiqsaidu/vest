import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { ComingUp } from "@/components/brand/ComingUp";

export default function ShieldPage() {
  return (
    <>
      <Nav />
      <main className="pt-20">
        <ComingUp label="Shielding flow — coming in next prompt" />
      </main>
      <Footer />
    </>
  );
}
