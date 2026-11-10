const PREVIEW_ORIGIN = "https://bc-pr-224-battlecruiser.robvg9.workers.dev";
const PRODUCTION_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const LOGIN_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-username-login";
const LOGIN_PROXY_PATH = "/__bc_preview/functions/v1/bc-username-login";
const RECOVERY_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-password-recovery-admin";
const RECOVERY_PROXY_PATH = "/__bc_preview/functions/v1/bc-password-recovery-admin";

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
    if (url.origin !== PREVIEW_ORIGIN) {
      return env.ASSETS.fetch(request);
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
      if (requestOrigin !== PREVIEW_ORIGIN) {
        return json({ error: "Origen no permitido." }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": PREVIEW_ORIGIN,
          "Access-Control-Allow-Headers": "apikey, content-type",
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
    const foreignOrigin = requestOrigin && requestOrigin !== PREVIEW_ORIGIN;
    if ((request.method === "POST" && requestOrigin !== PREVIEW_ORIGIN) ||
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
    if (apiKey) headers.set("apikey", apiKey);
    if (contentType) headers.set("content-type", contentType);

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
