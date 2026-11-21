"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const LINKS = [
  { href: "/", label: "Panoramica" },
  { href: "/eccezioni", label: "Eccezioni" },
  { href: "/approvazioni", label: "Approvazioni" },
  { href: "/fornitori", label: "Fornitori" },
  { href: "/registro", label: "Registro" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principale" className="flex flex-wrap gap-x-5 gap-y-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "py-1 text-[0.95rem] underline-offset-[6px]",
              active ? "font-semibold underline decoration-2" : "text-ink-2 hover:text-terracotta",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
