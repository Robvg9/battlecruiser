const PREVIEW_ORIGINS = new Set([
  "https://bc-pr-224-battlecruiser.robvg9.workers.dev",
  "https://ux-jornada-status-colors-transfer-modern-picker-battlecruiser.robvg9.workers.dev"
]);
const PRODUCTION_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const LOGIN_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-username-login";
const LOGIN_PROXY_PATH = "/__bc_preview/functions/v1/bc-username-login";
const RECOVERY_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-password-recovery-admin";
const RECOVERY_PROXY_PATH = "/__bc_preview/functions/v1/bc-password-recovery-admin";
const PREVIEW_CORE_ASSETS = new Set(["/", "/index.html", "/app.js", "/service-worker.js", "/style.css"]);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // This Worker script is only enabled for the exact shared PR preview host.
    // All unrelated asset requests continue through the configured ASSETS binding.
    if (!PREVIEW_ORIGINS.has(url.origin)) {
      return env.ASSETS.fetch(request);
    }
    // Force the preview shell and versioned core assets through the same
    // Worker asset manifest. Cloudflare may otherwise serve a cached bare "/"
    // separately from a fresh "/index.html" or query-versioned script.
    if (PREVIEW_CORE_ASSETS.has(url.pathname)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "Método no permitido." }, 405);
      }
      const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const assetUrl = new URL(assetPath, url.origin);
      url.searchParams.forEach((value, key) => assetUrl.searchParams.set(key, value));
      assetUrl.searchParams.set("__bc_preview_asset", Date.now() + "-" + Math.random().toString(36).slice(2));
      const assetRequest = new Request(assetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        redirect: "follow",
      });
      const asset = await env.ASSETS.fetch(assetRequest);
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      headers.set("Pragma", "no-cache");
      return new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
      });
    }

    const upstreamFunction = url.pathname === LOGIN_PROXY_PATH
      ? LOGIN_FUNCTION_URL
      : url.pathname === RECOVERY_PROXY_PATH
        ? RECOVERY_FUNCTION_URL
        : null;
    if (!upstreamFunction) {
      return env.ASSETS.fetch(request);
    }

    const requestOrigin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      if (!PREVIEW_ORIGINS.has(requestOrigin)) {
        return json({ error: "Origen no permitido." }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": url.origin,
          "Access-Control-Allow-Headers": "apikey, x-client-info, content-type, authorization",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "600",
          "Cache-Control": "no-store",
          "Vary": "Origin",
        },
      });
    }

    // A browser POST from the preview must carry its exact same-origin marker.
    // A GET is allowed only as a no-credential diagnostic: the upstream function
    // returns 405 before its rate limiter or auth/database logic can run.
    const foreignOrigin = requestOrigin && !PREVIEW_ORIGINS.has(requestOrigin);
    if ((request.method === "POST" && !PREVIEW_ORIGINS.has(requestOrigin)) ||
        (request.method === "GET" && foreignOrigin)) {
      return json({ error: "Origen no permitido." }, 403);
    }
    if (request.method !== "POST" && request.method !== "GET") {
      return json({ error: "Método no permitido." }, 405);
    }

    const headers = new Headers({
      "Origin": PRODUCTION_ORIGIN,
      "Cache-Control": "no-store",
    });
    const apiKey = request.headers.get("apikey");
    const contentType = request.headers.get("content-type");
    const authorization = request.headers.get("authorization");
    const clientInfo = request.headers.get("x-client-info");
    if (apiKey) headers.set("apikey", apiKey);
    if (contentType) headers.set("content-type", contentType);
    if (authorization) headers.set("authorization", authorization);
    if (clientInfo) headers.set("x-client-info", clientInfo);

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method === "POST") {
      if (!apiKey || !contentType) {
        return json({ error: "Solicitud inválida." }, 400);
      }
      init.body = await request.text();
    }

    try {
      const upstream = await fetch(upstreamFunction, init);
      // The browser is calling this same-origin proxy, so the upstream CORS
      // header does not need to be rewritten. Preserve the Edge Function's
      // status/body and never cache authentication responses.
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set("Cache-Control", "no-store");
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      return json({ error: "El servicio de acceso no está disponible temporalmente." }, 502);
    }
  },
};
