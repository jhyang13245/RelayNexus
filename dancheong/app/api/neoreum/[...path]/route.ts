import { proxyNeoreumRequest } from "@/lib/neoreum-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const handle = async (request: Request, context: Context) => {
  const { path } = await context.params;
  return proxyNeoreumRequest(request, path);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
