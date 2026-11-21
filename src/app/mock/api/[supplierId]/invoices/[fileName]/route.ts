import { fileHandler } from "../../../../_lib/api";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ supplierId: string; fileName: string }> },
) {
  const { supplierId, fileName } = await ctx.params;
  return fileHandler(request, supplierId, fileName);
}
