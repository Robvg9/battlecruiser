import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const MAX_BODY_BYTES = 8192;
const rateWindowMs = 15 * 60 * 1000;
const maxIpAttempts = 12;
const ipAttempts = new Map<string, { count: number; resetAt: number }>();

const headers = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "apikey, x-client-info, content-type, x-bc-bootstrap-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + rateWindowMs });
    return false;
  }
  entry.count += 1;
  if (ipAttempts.size > 4096) {
    for (const [key, value] of ipAttempts) {
      if (value.resetAt <= now) ipAttempts.delete(key);
    }
  }
  return entry.count > maxIpAttempts;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sameSecret(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  let origin: string | null = null;
  try {
    origin = req.headers.get("origin") ? new URL(req.headers.get("origin")!).origin : null;
  } catch {
    return reply({ error: "Origen no permitido." }, 403);
  }

  if (req.method === "OPTIONS") {
    if (origin && origin !== APP_ORIGIN) return reply({ error: "Origen no permitido." }, 403);
    return new Response(null, { status: 204, headers });
  }
  if (origin !== APP_ORIGIN) return reply({ error: "Origen no permitido." }, 403);
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return reply({ error: "Demasiados intentos. Espera y vuelve a probar." }, 429);
  }

  const size = Number(req.headers.get("content-length") || 0);
  if (size > MAX_BODY_BYTES) return reply({ error: "Solicitud inválida." }, 400);

  let body: { username?: unknown; email?: unknown; password?: unknown; request_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Solicitud inválida." }, 400);
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestId = body.request_id;
  const token = req.headers.get("x-bc-bootstrap-token") || "";

  if (!username || username.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      password.length < 12 || password.length > 256 ||
      !validUuid(requestId) || token.length < 32 || token.length > 512) {
    return reply({ error: "No se pudo inicializar el administrador." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const configuredToken = Deno.env.get("BC_BOOTSTRAP_TOKEN");
  if (!url || !serviceRole || !configuredToken) {
    return reply({ error: "El servicio de inicialización no está configurado." }, 503);
  }

  try {
    const configuredSecretMatches = await sameSecret(token, configuredToken);
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // The database gate persists failed token attempts, even when the Edge
    // secret differs, so invalid attempts cannot bypass the durable DB limit.
    const claim = await admin.rpc("bc_bootstrap_claim", {
      p_token: token,
      p_request_id: requestId,
    });
    if (!configuredSecretMatches || claim.error || !claim.data?.ok) {
      return reply({ error: "No se pudo inicializar el administrador." }, 401);
    }

    if (claim.data.already_completed === true) {
      return reply({ initialized: true, replayed: true }, 200);
    }

    let authUser = null;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        bc_bootstrap_request_id: requestId,
      },
    });

    if (!created.error && created.data.user) {
      authUser = created.data.user;
    } else {
      // A retry after a network interruption can find the Auth user created by
      // this same request. Never adopt an unrelated account with the same email.
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (!listed.error) {
        authUser = listed.data.users.find((user) =>
          user.email?.toLowerCase() === email &&
          user.user_metadata?.bc_bootstrap_request_id === requestId
        ) || null;
      }
    }

    if (!authUser) {
      // The claim remains bound to request_id for safe retry; no secret or
      // password is logged, and no second identity can take the bootstrap.
      return reply({ error: "No se pudo completar la creación. Reintenta con la misma solicitud." }, 503);
    }

    const finalized = await admin.rpc("bc_bootstrap_finalize", {
      p_request_id: requestId,
      p_auth_user_id: authUser.id,
      p_nombre: username,
    });
    if (finalized.error || !finalized.data?.ok) {
      // Keep the Auth identity for idempotent recovery with this same request.
      // Deleting on an ambiguous network error could undo an already-committed
      // database finalization, so recovery is deliberately retry-based.
      return reply({ error: "La identidad fue creada; falta finalizar el perfil. Reintenta la misma solicitud." }, 503);
    }

    return reply({ initialized: true, role: "Dueño" }, 201);
  } catch {
    // Do not log request bodies, tokens, passwords, or email addresses.
    return reply({ error: "El servicio de inicialización no está disponible temporalmente." }, 503);
  }
});
