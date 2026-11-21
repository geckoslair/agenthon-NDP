import { listHandler } from "../../../_lib/api";

export async function GET(request: Request, ctx: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await ctx.params;
  return listHandler(request, supplierId);
}
