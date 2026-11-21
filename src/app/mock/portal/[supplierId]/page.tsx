import { notFound } from "next/navigation";
import { DemoFrame } from "../../_lib/portal-ui";
import { isValidSupplierId, readBillingInfo, DEFAULT_MONTH } from "../../_lib/demo-data";

export const dynamic = "force-dynamic";

export default async function PortalLogin({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { supplierId } = await params;
  const { error } = await searchParams;
  if (!isValidSupplierId(supplierId)) notFound();
  const info = readBillingInfo(DEFAULT_MONTH, supplierId);
  if (!info) notFound();
  return (
    <DemoFrame title={`${info.displayName} dashboard: sign in`}>
      {error && <p style={{ color: "#b91c1c" }}>Wrong credentials. Use demo / demo.</p>}
      <form
        method="post"
        action={`/mock/portal/${supplierId}/login`}
        style={{ display: "grid", gap: 12, maxWidth: 320 }}
      >
        <label>
          Username
          <input
            name="username"
            type="text"
            defaultValue=""
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            defaultValue=""
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p style={{ fontSize: 13, color: "#555" }}>Demo credentials: demo / demo.</p>
    </DemoFrame>
  );
}
