import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

const headers = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function genericFailure(status = 401) {
  return reply({ error: "Usuario o contraseña incorrectos." }, status);
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const old = attempts.get(ip);
  if (!old || old.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  old.count += 1;
  if (attempts.size > 4096) {
    for (const [key, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(key);
    }
  }
  return old.count > MAX_ATTEMPTS_PER_IP;
}

function clearRateLimit(ip: string): void {
  attempts.delete(ip);
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    // Origin should normally contain only scheme + host. Normalize defensively
    // in case a trusted webview forwards a slash/path with the Origin value.
    return new URL(value).origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = normalizeOrigin(req.headers.get("origin"));

  // A CORS preflight may arrive without Origin on some intermediary/webview
  // paths. Respond with the single fixed production origin; browsers from any
  // other origin will reject that response. Actual POST requests still require
  // the exact allowlisted origin below.
  if (req.method === "OPTIONS") {
    if (origin && origin !== APP_ORIGIN) return reply({ error: "Origen no permitido." }, 403);
    return new Response(null, { status: 204, headers });
  }
  if (origin !== APP_ORIGIN) return reply({ error: "Origen no permitido." }, 403);
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return reply({ error: "Demasiados intentos. Espera unos minutos y vuelve a probar." }, 429);
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 4096) return reply({ error: "Solicitud inválida." }, 400);

  let body: { username?: unknown; password?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Solicitud inválida." }, 400);
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const mode = body.mode === "password-recovery" ? "password-recovery" : "login";
  if (!username || username.length > 120 ||
      (mode === "login" && (!password || password.length > 256))) {
    return genericFailure(401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRole) {
    return reply({ error: "El servicio de acceso no está disponible temporalmente." }, 503);
  }

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let email: string | null = null;
  try {
    // The privileged resolver accepts either the public username or the account email,
    // but only for an active application user. Keep the mapped address server-side.
    const resolved = await admin.rpc("obtener_email_login_por_nombre", { p_nombre: username });
    if (resolved.error) {
      return reply({ error: "El servicio de acceso no está disponible temporalmente." }, 503);
    }
    if (typeof resolved.data === "string" && resolved.data.includes("@")) {
      email = resolved.data;
    }

    if (mode === "password-recovery") {
      // Keep the response indistinguishable for known and unknown identifiers.
      // Supabase Auth performs the actual email delivery; no address is returned to the PWA.
      const recoveryEmail = email || "bc-rwht-nonexistent-user@internal.battlecruiser.local";
      try {
        await auth.auth.resetPasswordForEmail(recoveryEmail, {
          redirectTo: APP_ORIGIN + "/?bc_recovery=1",
        });
      } catch {
        // Do not expose whether an account/username exists through the public response.
      }
      return reply({ accepted: true }, 200);
    }

    // Use the same Auth password verifier for valid and unknown identifiers.
    const login = await auth.auth.signInWithPassword({
      email: email || "bc-rwht-nonexistent-user@internal.battlecruiser.local",
      password,
    });
    if (login.error || !login.data.session) return genericFailure(401);

    clearRateLimit(ip);
    return reply({ session: login.data.session }, 200);
  } catch {
    return reply({ error: "El servicio de acceso no está disponible temporalmente." }, 503);
  }
});
