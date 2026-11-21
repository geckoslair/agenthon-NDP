import { notFound } from "next/navigation";
import { DemoFrame } from "../../../_lib/portal-ui";
import { billingFacts } from "../../../_lib/billing-facts";
import { DEFAULT_MONTH, isValidSupplierId, readBillingInfo } from "../../../_lib/demo-data";

export const dynamic = "force-dynamic";

export default async function BillingInfoPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  if (!isValidSupplierId(supplierId)) notFound();
  const info = readBillingInfo(DEFAULT_MONTH, supplierId);
  if (!info) notFound();
  return (
    <DemoFrame title={`${info.displayName}: billing and VAT FAQ`}>
      <p>Frequently asked questions about invoices and VAT.</p>
      {billingFacts(info).map((f) => (
        <p key={f.name} data-fact={f.name} data-value={f.value}>
          {f.text}
        </p>
      ))}
    </DemoFrame>
  );
}
