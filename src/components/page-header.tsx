export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mb-10 max-w-[70ch]">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1>{title}</h1>
      {lead && <p className="mt-4 text-[1.2rem] leading-[1.6] text-ink-2">{lead}</p>}
    </div>
  );
}
