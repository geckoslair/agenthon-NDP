import type { ReactNode } from "react";

/** Shared frame of the fake supplier pages: always plainly marked as a demo. */
export function DemoFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 24 }}
    >
      <p
        data-demo-banner
        style={{ background: "#fef3c7", border: "1px solid #f59e0b", padding: 8, fontSize: 13 }}
      >
        DEMO PAGE. Synthetic supplier site for the Probata demo, not a real service. Pagina
        dimostrativa con dati sintetici.
      </p>
      <h1 style={{ fontSize: 24, margin: "16px 0" }}>{title}</h1>
      {children}
    </main>
  );
}
