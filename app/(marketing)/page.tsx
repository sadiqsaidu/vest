import Link from "next/link";
import { Nav } from "@/components/brand/Nav";
import { Footer } from "@/components/brand/Footer";
import { ScheduleDiagram } from "@/components/brand/ScheduleDiagram";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero-vignette pt-40 pb-[120px] md:pt-[160px]">
          <div className="mx-auto max-w-container px-6">
            <div className="max-w-3xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] uppercase tracking-wider text-text-muted">
                <span
                  className="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--accent)" }}
                />
                Built on Umbra · Solana
              </div>
              <h1 className="text-[44px] leading-[1.05] tracking-h1 text-text md:text-[64px]">
                Keep your team{" "}
                <span
                  className="relative inline-block"
                  style={{ paddingBottom: "0.05em" }}
                >
                  off Solscan
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 origin-left"
                    style={{
                      bottom: "0.04em",
                      height: "0.08em",
                      background: "var(--text)",
                      transform: "scaleX(1)",
                    }}
                  />
                </span>
                .
              </h1>
              <p className="mt-7 max-w-[540px] text-[20px] leading-[1.45] text-text-muted">
                Vest is private vesting on Solana. Run team and investor
                unlocks without putting salaries on a block explorer — and
                disclose to auditors on your own terms.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="group inline-flex h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:translate-y-px"
                >
                  Launch app
                  <span className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-medium text-text hover:border-border-strong"
                >
                  How it works
                </Link>
              </div>
            </div>

            <div className="mt-24">
              <ScheduleDiagram />
            </div>
          </div>
        </section>

        <section className="border-t border-border py-20 md:py-[120px]">
          <div className="mx-auto max-w-container px-6">
            <h2 className="max-w-prose text-3xl tracking-h2 text-text md:text-4xl">
              What goes public on Solana today.
            </h2>
            <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
              {[
                {
                  num: "01",
                  title: "Salary doxxing",
                  body: "Every monthly transfer to an engineer is a permanent, public, indexed record. Recruiters scrape it.",
                },
                {
                  num: "02",
                  title: "Unlock-day attacks",
                  body: "Public schedules tell phishers exactly when a wallet receives a large amount, and what wallet to target.",
                },
                {
                  num: "03",
                  title: "Diligence leakage",
                  body: "Acquirers, competitors, and journalists see the cap table on Solscan before any agreement is signed.",
                },
              ].map((item) => (
                <div key={item.num}>
                  <div className="font-mono text-xs text-text-subtle">
                    {item.num} /
                  </div>
                  <h3 className="mt-3 text-xl text-text tracking-h2">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.55] text-text-muted">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-t border-border py-20 md:py-[120px]"
        >
          <div className="mx-auto max-w-container px-6">
            <h2 className="max-w-prose text-3xl tracking-h2 text-text md:text-4xl">
              How it works.
            </h2>
            <div className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-0">
              <div
                className="absolute left-0 right-0 top-[14px] hidden border-t border-border md:block"
                aria-hidden
              />
              {[
                {
                  num: "01",
                  title: "Create cap table",
                  body: "Define beneficiaries, amounts, cliffs, and unlock cadence. Saved encrypted off-chain.",
                },
                {
                  num: "02",
                  title: "Shield treasury",
                  body: "Move project tokens from your treasury wallet into an encrypted balance.",
                },
                {
                  num: "03",
                  title: "Beneficiaries claim privately",
                  body: "When an unlock hits, the recipient claims from the mixer to a fresh wallet.",
                },
              ].map((step) => (
                <div key={step.num} className="relative md:px-6">
                  <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-bg font-mono text-[11px] text-text-muted">
                    {step.num}
                  </div>
                  <h3 className="mt-5 text-lg text-text">{step.title}</h3>
                  <p className="mt-2 max-w-[300px] text-[15px] leading-[1.55] text-text-muted">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border py-20 md:py-[120px]">
          <div className="mx-auto max-w-container px-6">
            <h2 className="max-w-prose text-3xl tracking-h2 text-text md:text-4xl">
              Private by default. Disclosed on demand.
            </h2>
            <p className="mt-5 max-w-prose text-[16px] leading-[1.55] text-text-muted">
              Issue scoped viewing keys to auditors, investors, or the board.
              Each scope reveals only the slice of the cap table the recipient
              is meant to see.
            </p>
            <div className="mt-14 grid gap-0 md:grid-cols-2">
              {[
                {
                  scope: "Master",
                  body: "Full cap table. Reserve for your CFO, compliance lead, or counsel.",
                },
                {
                  scope: "Mint",
                  body: "All movement of a single token (e.g. the team token). Useful for token-specific audits.",
                },
                {
                  scope: "Yearly",
                  body: "All unlocks within a calendar year. Good for tax filings and annual reports.",
                },
                {
                  scope: "Monthly",
                  body: "A single month's activity. Granular access for ongoing diligence windows.",
                },
              ].map((item) => (
                <div
                  key={item.scope}
                  className="border-t border-border py-6 pr-6 md:pr-12"
                >
                  <div className="font-mono text-xs uppercase tracking-wide text-text-subtle">
                    {item.scope}
                  </div>
                  <p className="mt-2 text-[15px] leading-[1.55] text-text">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}
