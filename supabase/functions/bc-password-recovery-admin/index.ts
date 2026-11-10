import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const PREVIEW_ORIGIN = "https://bc-pr-224-battlecruiser.robvg9.workers.dev";
const MASTER_EMAIL = "robvg9@gmail.com";
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 4;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

type Action = "request" | "list" | "approve" | "reject" | "complete";

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

function headers(origin: string | null): HeadersInit {
  const allowed = origin === APP_ORIGIN || origin === PREVIEW_ORIGIN ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "apikey, x-client-info, content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function reply(body: unknown, status = 200, origin: string | null = APP_ORIGIN): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  if (rateBuckets.size > 2048) {
    for (const [key, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(key);
    }
  }
  return bucket.count > MAX_REQUESTS_PER_IP;
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return String(values.default || "");
  } catch { return ""; }
}

function publishableKey(): string {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    return String(values.default || "");
  } catch { return ""; }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function userByEmail(admin: any, email: string): Promise<any | null> {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("AUTH_USER_LOOKUP_FAILED");
    const found = (data?.users || []).find((user: any) =>
      String(user.email || "").toLowerCase() === email.toLowerCase()
    );
    if (found) return found;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

async function authenticatedAdmin(admin: any, authorization: string | null): Promise<any | null> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return null;

  const { data: profile, error: profileError } = await admin
    .from("usuarios")
    .select("id,nombre,role_id,activo,archivado")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.activo !== true || profile.archivado === true || !profile.role_id) {
    return null;
  }

  const { data: permission, error: permissionError } = await admin
    .from("permisos")
    .select("permitido")
    .eq("role_id", profile.role_id)
    .eq("seccion", "usuarios")
    .eq("accion", "editar")
    .maybeSingle();

  if (permissionError || permission?.permitido !== true) return null;
  return { authUser: authData.user, profile };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveTemporaryPasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: new Uint8Array(salt).buffer as ArrayBuffer,
    iterations: 150000,
    hash: "SHA-256",
  }, key, 256);
  return encodeBase64(new Uint8Array(bits));
}

function constantTimeBase64Equal(left: string, right: string): boolean {
  try {
    const a = decodeBase64(left);
    const b = decodeBase64(right);
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
    return difference === 0;
  } catch { return false; }
}

async function logApproval(admin: any, actor: any, targetName: string, requestId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("auditoria_operaciones").insert({
    fecha: now,
    usuario_id: actor.authUser.id,
    usuario_nombre: actor.profile.nombre || "Administración",
    tipo: "password_recovery_approved",
    descripcion: "Administración autorizó una contraseña temporal; se exige cambio al próximo acceso.",
    estado: "exito",
    entidad_id: requestId,
    payload_resumen: { objetivo: targetName, solicitud_id: requestId },
  });
  if (error) console.warn("[bc-password-recovery-admin] audit insert failed");
}

Deno.serve(async (req: Request) => {
  const origin = normalizeOrigin(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    if (origin && origin !== APP_ORIGIN && origin !== PREVIEW_ORIGIN) {
      return reply({ error: "Origen no permitido." }, 403, origin);
    }
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (origin !== APP_ORIGIN && origin !== PREVIEW_ORIGIN) {
    return reply({ error: "Origen no permitido." }, 403, origin);
  }
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405, origin);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 8192) return reply({ error: "Solicitud inválida." }, 400, origin);

  let body: { action?: unknown; identifier?: unknown; request_id?: unknown; temporary_password?: unknown };
  try { body = await req.json(); } catch {
    return reply({ error: "Solicitud inválida." }, 400, origin);
  }

  const action = body.action as Action;
  if (!["request", "list", "approve", "reject", "complete"].includes(action)) {
    return reply({ error: "Acción no válida." }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const secret = serviceKey();
  const publicKey = publishableKey();
  if (!url || !secret || !publicKey) {
    return reply({ error: "El servicio de recuperación no está disponible." }, 503, origin);
  }

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (action === "request") {
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      return reply({ error: "Demasiadas solicitudes. Espera unos minutos y vuelve a probar." }, 429, origin);
    }
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    if (!identifier || identifier.length > 120) {
      return reply({ accepted: false, error: "Escribe el usuario para solicitar la recuperación." }, 400, origin);
    }

    try {
      const { data: resolvedEmail, error: resolveError } = await admin.rpc(
        "obtener_email_login_por_nombre",
        { p_nombre: identifier },
      );
      // Identifiers that do not resolve receive exactly the same accepted response.
      if (resolveError || typeof resolvedEmail !== "string" || !resolvedEmail.includes("@")) {
        return reply({ accepted: true }, 200, origin);
      }

      const targetAuth = await userByEmail(admin, resolvedEmail);
      if (!targetAuth || targetAuth.deleted_at) return reply({ accepted: true }, 200, origin);

      const { data: profile, error: profileError } = await admin
        .from("usuarios")
        .select("id,nombre,username,role_id,activo,archivado")
        .eq("id", targetAuth.id)
        .maybeSingle();

      if (profileError || !profile || profile.activo !== true || profile.archivado === true || !profile.role_id) {
        return reply({ accepted: true }, 200, origin);
      }

      const { data: role, error: roleError } = await admin
        .from("roles")
        .select("nombre")
        .eq("id", profile.role_id)
        .maybeSingle();

      if (roleError || String(role?.nombre || "").trim().toLowerCase() !== "dependienta") {
        return reply({ accepted: true }, 200, origin);
      }

      const now = new Date().toISOString();
      await admin.from("bc_password_recovery_requests")
        .update({ status: "EXPIRADA" })
        .eq("target_user_id", targetAuth.id)
        .in("status", ["PENDIENTE", "PROCESANDO"])
        .lt("expires_at", now);

      const { data: existing, error: existingError } = await admin
        .from("bc_password_recovery_requests")
        .select("id")
        .eq("target_user_id", targetAuth.id)
        .in("status", ["PENDIENTE", "PROCESANDO"])
        .gt("expires_at", now)
        .maybeSingle();

      if (existingError) throw new Error("RECOVERY_QUEUE_READ_FAILED");
      // Do not send repeated emails while an open request already exists.
      if (existing) return reply({ accepted: true }, 200, origin);

      const requestId = crypto.randomUUID();
      const username = String(profile.username || targetAuth.user_metadata?.battlecruiser_username || identifier).slice(0, 80);
      const targetName = String(profile.nombre || targetAuth.user_metadata?.nombre || username).slice(0, 120);

      const { error: insertError } = await admin.from("bc_password_recovery_requests").insert({
        id: requestId,
        target_user_id: targetAuth.id,
        target_username: username,
        target_name: targetName,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        notification_status: "PENDIENTE",
      });
      // A concurrent duplicate request is intentionally indistinguishable from success.
      if (insertError) {
        if (String(insertError.code || "") === "23505") return reply({ accepted: true }, 200, origin);
        throw new Error("RECOVERY_QUEUE_INSERT_FAILED");
      }

      const mailClient = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const emailResult = await mailClient.auth.signInWithOtp({
        email: MASTER_EMAIL,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: APP_ORIGIN + "/?bc_admin_recovery=" + encodeURIComponent(requestId),
        },
      });

      if (emailResult.error) {
        console.warn("[bc-password-recovery-admin] master notification not delivered:", emailResult.error.code || "AUTH_EMAIL_ERROR");
        await admin.from("bc_password_recovery_requests")
          .update({ notification_status: "FALLIDA" })
          .eq("id", requestId);
      } else {
        await admin.from("bc_password_recovery_requests")
          .update({ notification_status: "ENVIADA", notification_sent_at: new Date().toISOString() })
          .eq("id", requestId);
      }

      // Never disclose whether the dependent username exists or whether a mail was sent.
      return reply({ accepted: true }, 200, origin);
    } catch {
      return reply({ accepted: true }, 200, origin);
    }
  }

  if (action === "complete") {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ error: "Sesión no válida." }, 401, origin);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return reply({ error: "Sesión no válida." }, 401, origin);

    const current = authData.user;
    if (current.app_metadata?.bc_password_change_required !== true) {
      return reply({ completed: true }, 200, origin);
    }

    const completionPassword = typeof body.temporary_password === "string" ? body.temporary_password : "";
    if (completionPassword.length < 10 || completionPassword.length > 128 || !current.email) {
      return reply({ error: "La nueva contraseña no pudo verificarse." }, 400, origin);
    }

    const { data: approvedRequest, error: approvedRequestError } = await admin
      .from("bc_password_recovery_requests")
      .select("id,temporary_password_salt,temporary_password_hash")
      .eq("target_user_id", current.id)
      .eq("status", "APROBADA")
      .is("completed_at", null)
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (approvedRequestError) return reply({ error: "No se pudo validar la autorización." }, 500, origin);
    if (!approvedRequest) {
      // An earlier completion can be retried with a still-cached JWT after server metadata
      // was cleared; only a server-recorded COMPLETADA request permits this idempotent path.
      const { data: completedRequest, error: completedError } = await admin
        .from("bc_password_recovery_requests")
        .select("id")
        .eq("target_user_id", current.id)
        .eq("status", "COMPLETADA")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!completedError && completedRequest) return reply({ completed: true }, 200, origin);
      return reply({ error: "No existe una autorización de cambio pendiente para esta cuenta." }, 403, origin);
    }
    if (!approvedRequest.temporary_password_salt || !approvedRequest.temporary_password_hash) {
      return reply({ error: "La autorización no tiene un verificador temporal válido." }, 403, origin);
    }

    // Reject the temporary password itself. Only a genuinely different password may clear the gate.
    const candidateHash = await deriveTemporaryPasswordHash(
      completionPassword,
      decodeBase64(approvedRequest.temporary_password_salt),
    );
    if (constantTimeBase64Equal(candidateHash, approvedRequest.temporary_password_hash)) {
      return reply({ error: "La contraseña personal debe ser distinta de la temporal entregada por Administración." }, 400, origin);
    }

    // Prove that the new password really works before clearing the mandatory gate.
    // The verified sign-in session is intentionally never returned to the browser.
    const verifier = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: proofError } = await verifier.auth.signInWithPassword({
      email: current.email,
      password: completionPassword,
    });
    if (proofError) return reply({ error: "La nueva contraseña no pudo verificarse." }, 400, origin);

    const { error } = await admin.auth.admin.updateUserById(current.id, {
      app_metadata: { ...(current.app_metadata || {}), bc_password_change_required: false },
    });
    if (error) return reply({ error: "No se pudo confirmar el cambio obligatorio." }, 500, origin);

    const { error: completionWriteError } = await admin.from("bc_password_recovery_requests")
      .update({ status: "COMPLETADA", completed_at: new Date().toISOString(), temporary_password_salt: null, temporary_password_hash: null })
      .eq("id", approvedRequest.id)
      .eq("status", "APROBADA");
    if (completionWriteError) console.warn("[bc-password-recovery-admin] completion record update failed");
    return reply({ completed: true }, 200, origin);
  }

  const actor = await authenticatedAdmin(admin, req.headers.get("authorization"));
  if (!actor) return reply({ error: "Solo Administración puede gestionar recuperaciones." }, 403, origin);

  if (action === "list") {
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("bc_password_recovery_requests")
      .select("id,target_user_id,target_username,target_name,status,requested_at,expires_at,notification_status,approved_at")
      .in("status", ["PENDIENTE", "PROCESANDO", "APROBADA"])
      .or("status.eq.APROBADA,expires_at.gt." + now)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) return reply({ error: "No se pudieron cargar las solicitudes." }, 500, origin);
    return reply({ requests: data || [] }, 200, origin);
  }

  const requestId = isUuid(body.request_id) ? body.request_id : null;
  if (!requestId) return reply({ error: "Solicitud inválida." }, 400, origin);

  if (action === "reject") {
    const { data, error } = await admin
      .from("bc_password_recovery_requests")
      .update({ status: "RECHAZADA", rejected_by: actor.authUser.id, rejected_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "PENDIENTE")
      .select("id")
      .maybeSingle();
    if (error || !data) return reply({ error: "La solicitud ya no está pendiente o expiró." }, 409, origin);
    return reply({ rejected: true }, 200, origin);
  }

  if (action === "approve") {
    const temporaryPassword = typeof body.temporary_password === "string" ? body.temporary_password : "";
    if (temporaryPassword.length < 10 || temporaryPassword.length > 128) {
      return reply({ error: "La contraseña temporal debe tener entre 10 y 128 caracteres." }, 400, origin);
    }

    const now = new Date().toISOString();
    const { data: request, error: requestError } = await admin
      .from("bc_password_recovery_requests")
      .select("id,target_user_id,target_name,status,expires_at,processing_by,processing_at")
      .eq("id", requestId)
      .in("status", ["PENDIENTE", "PROCESANDO", "APROBADA"])
      .or("status.eq.APROBADA,expires_at.gt." + now)
      .maybeSingle();
    if (requestError || !request) return reply({ error: "La solicitud ya no está pendiente o expiró." }, 409, origin);

    let lockQuery = admin.from("bc_password_recovery_requests")
      .update({ status: "PROCESANDO", processing_by: actor.authUser.id, processing_at: now })
      .eq("id", requestId);

    if (request.status === "PROCESANDO") {
      const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      if (!request.processing_at || new Date(request.processing_at).getTime() >= Date.now() - 2 * 60 * 1000) {
        return reply({ error: "La solicitud todavía se está procesando. Vuelve a intentarlo en un par de minutos." }, 409, origin);
      }
      lockQuery = lockQuery.eq("status", "PROCESANDO").lt("processing_at", staleBefore);
    } else {
      lockQuery = lockQuery.eq("status", request.status);
    }

    const { data: lock, error: lockError } = await lockQuery.select("id").maybeSingle();
    if (lockError || !lock) return reply({ error: "Otro administrador acaba de tomar esta solicitud. Actualiza la lista." }, 409, origin);

    const { data: targetPack, error: targetError } = await admin.auth.admin.getUserById(request.target_user_id);
    if (targetError || !targetPack?.user) {
      await admin.from("bc_password_recovery_requests").update({ status: "PENDIENTE", processing_by: null, processing_at: null }).eq("id", requestId);
      return reply({ error: "La cuenta dependienta ya no está disponible." }, 404, origin);
    }

    const target = targetPack.user;
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const saltEncoded = encodeBase64(saltBytes);
    const temporaryPasswordHash = await deriveTemporaryPasswordHash(temporaryPassword, saltBytes);

    const { error: passwordError } = await admin.auth.admin.updateUserById(target.id, {
      password: temporaryPassword,
      app_metadata: { ...(target.app_metadata || {}), bc_password_change_required: true },
    });
    if (passwordError) {
      await admin.from("bc_password_recovery_requests").update({ status: "PENDIENTE", processing_by: null, processing_at: null }).eq("id", requestId);
      return reply({ error: "No se pudo establecer la contraseña temporal." }, 500, origin);
    }

    const approvedAt = new Date().toISOString();
    const { error: finishError } = await admin.from("bc_password_recovery_requests")
      .update({
        status: "APROBADA",
        approved_by: actor.authUser.id,
        approved_at: approvedAt,
        temporary_password_salt: saltEncoded,
        temporary_password_hash: temporaryPasswordHash,
      })
      .eq("id", requestId)
      .eq("status", "PROCESANDO");

    if (finishError) {
      // The target is already protected by the mandatory-change flag. Keep a visible,
      // recoverable processing row instead of pretending the transaction completed.
      console.error("[bc-password-recovery-admin] approval finalization failed");
      return reply({ error: "La contraseña se estableció, pero falta cerrar el registro de aprobación. Contacta Administración antes de entregar la contraseña." }, 500, origin);
    }

    await logApproval(admin, actor, request.target_name, requestId);
    return reply({ approved: true, force_change_on_next_login: true }, 200, origin);
  }

  return reply({ error: "Acción no válida." }, 400, origin);
});
