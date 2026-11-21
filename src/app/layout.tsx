import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Probata",
  description: "Il pacchetto mensile delle fatture estere, con una persona che approva.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
            <Link
              href="/"
              aria-label="Probata, panoramica"
              className="font-serif text-2xl hover:text-foreground"
            >
              Probata
            </Link>
            <Nav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-10 sm:px-6 sm:py-16">
          {children}
        </main>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-[1120px] px-4 py-6 text-sm text-ink-2 sm:px-6">
            Probata non invia nulla senza la tua approvazione. In questa demo gli invii sono
            simulati.
          </p>
        </footer>
      </body>
    </html>
  );
}
