/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { operatorService } from "../lib/operator-service";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  RELAY_OPERATOR_SECRET?: string;
  RELAY_MASTER_EMAILS?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if(url.pathname === '/api/relay-operator') return operatorService(request,env);
    // Enforce suspension before all API handlers, including generation and cloud saves.
    const email=request.headers.get('oai-authenticated-user-email');
    if(email && url.pathname.startsWith('/api/')) {
      try {
        const account=await env.DB.prepare('SELECT status FROM relay_accounts WHERE email_key=?').bind(email.trim().toLowerCase()).first<{status:string}>();
        if(account && account.status!=='ACTIVE') return Response.json({error:'운영자에 의해 이용이 제한된 계정입니다.',code:'ACCOUNT_SUSPENDED'}, {status:403,headers:{'Cache-Control':'no-store'}});
      } catch { return Response.json({error:'계정 상태를 확인하지 못했습니다.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (
      url.pathname === "/api/openai/test" ||
      url.pathname === "/api/simulate" ||
      url.pathname === "/api/image"
    ) {
      const hardened = new Response(response.body, response);
      hardened.headers.set("Cache-Control", "no-store, private, max-age=0");
      hardened.headers.set("Pragma", "no-cache");
      hardened.headers.set("Referrer-Policy", "no-referrer");
      hardened.headers.set("X-Content-Type-Options", "nosniff");
      return hardened;
    }
    return response;
  },
};

export default worker;
