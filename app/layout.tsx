import type { Metadata } from "next";
import { WalletProvider } from "./providers/WalletProvider";
import { UmbraProvider } from "../lib/umbra/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vest — Private vesting on Solana",
  description:
    "Run team and investor unlocks without putting salaries on a block explorer. Built on Umbra.",
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
