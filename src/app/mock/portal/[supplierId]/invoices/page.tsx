import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DemoFrame } from "../../../_lib/portal-ui";
import {
  DEFAULT_MONTH,
  isValidSupplierId,
  listInvoices,
  readBillingInfo,
  readSources,
} from "../../../_lib/demo-data";

export const dynamic = "force-dynamic";

export default async function PortalInvoices({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  if (!isValidSupplierId(supplierId)) notFound();
  const info = readBillingInfo(DEFAULT_MONTH, supplierId);
  if (!info) notFound();
  const signedIn = (await cookies()).get(`mock_portal_${supplierId}`)?.value === "1";
  if (!signedIn) {
    return (
      <DemoFrame title={`${info.displayName}: sign in required`}>
        <p>
          <a href={`/mock/portal/${supplierId}`}>Go to the sign-in page</a>
        </p>
      </DemoFrame>
    );
  }
  const files = readSources(DEFAULT_MONTH)?.browser[supplierId] ?? [];
  const rows = listInvoices(files, DEFAULT_MONTH);
  return (
    <DemoFrame title={`${info.displayName}: invoices`}>
      <table id="invoices" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Number</th>
            <th align="left">Date</th>
            <th align="right">Amount</th>
            <th align="left">PDF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fileName}>
              <td>{r.number ?? "n/a"}</td>
              <td>{r.date ?? "n/a"}</td>
              <td align="right">
                {r.amount === null ? "n/a" : `${r.currency} ${r.amount.toFixed(2)}`}
              </td>
              <td>
                <a href={`/mock/portal/${supplierId}/files/${r.fileName}`}>{r.fileName}</a>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4}>No invoices in the dashboard.</td>
            </tr>
          )}
        </tbody>
      </table>
    </DemoFrame>
  );
}
