// Status tag: small pill with a colored dot and always a text label (design.md section 7).
import type { Tone } from "@/components/format";
import { cn } from "cn";

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  neutral: "bg-ink-2",
};

export function StateTag({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 px-2.5 py-0.5 text-[0.74rem] font-medium text-foreground">
      <span aria-hidden className={cn("size-2 rounded-full", DOT[tone])} />
      {label}
    </span>
  );
}
