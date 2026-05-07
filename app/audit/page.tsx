import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { Input } from "@/components/ui/input";

export default function AuditPage() {
  return (
    <>
      <Nav />
      <main className="pt-32">
        <div className="mx-auto flex max-w-prose flex-col gap-4 px-6">
          <span className="font-mono text-xs uppercase tracking-wide text-text-subtle">
            Auditor mode
          </span>
          <h1 className="text-3xl tracking-h2 text-text">
            Paste a viewing key.
          </h1>
          <p className="text-[15px] text-text-muted">
            Drop in a scoped viewing key issued by a Vest founder. We&apos;ll
            decrypt the slice you have access to — nothing more.
          </p>
          <Input
            placeholder="vk_master_… / vk_mint_… / vk_yyyy_… / vk_yyyymm_…"
            className="mt-4 font-mono"
          />
          <div className="mt-6 rounded-lg border border-border p-6 text-sm text-text-muted glass">
            Coming up — viewing key envelope cards will render here.
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
