import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-container flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <Logo />
          <span className="font-mono text-xs text-text-subtle">
            © {new Date().getFullYear()}
          </span>
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <Link href="#" className="hover:text-text">GitHub</Link>
            <Link href="#" className="hover:text-text">Docs</Link>
            <Link
              href="https://umbraprivacy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text"
            >
              Umbra
            </Link>
          </div>
        </div>
        <Link
          href="https://umbraprivacy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-text-subtle hover:text-text-muted"
        >
          Built on Umbra ↗
        </Link>
      </div>
    </footer>
  );
}
