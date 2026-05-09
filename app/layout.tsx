import type { Metadata, Viewport } from "next";
import { WalletProvider } from "./providers/WalletProvider";
import { UmbraProvider } from "../lib/umbra/provider";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Vest — Private vesting on Solana",
  description:
    "Run team and investor unlocks without putting salaries on a block explorer. Built on Umbra.",
  applicationName: "Vest",
  openGraph: {
    title: "Vest — Private vesting on Solana",
    description:
      "Run team and investor unlocks without putting salaries on a block explorer. Built on Umbra.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vest — Private vesting on Solana",
    description:
      "Run team and investor unlocks without putting salaries on a block explorer.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <WalletProvider>
          <UmbraProvider>{children}</UmbraProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
