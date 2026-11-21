import { NextResponse } from "next/server";
import { isValidSupplierId } from "../../../_lib/demo-data";

// Demo login: user "demo", password "demo". Sets a cookie and redirects to the invoices page.
export async function POST(request: Request, ctx: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await ctx.params;
  if (!isValidSupplierId(supplierId)) return new Response("Not found", { status: 404 });
  const form = await request.formData();
  const ok = form.get("username") === "demo" && form.get("password") === "demo";
  const target = ok ? `/mock/portal/${supplierId}/invoices` : `/mock/portal/${supplierId}?error=1`;
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  if (ok) response.cookies.set(`mock_portal_${supplierId}`, "1", { path: "/mock/portal" });
  return response;
}
