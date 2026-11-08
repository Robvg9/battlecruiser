// BattleCruiser — Edge Function: crear-usuario-sin-email
// Creates an Auth identity and its application profile with a separate short
// login username and the role selected by the administrator.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function normalizarUsuario(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function emailTecnico(username: string, id: string): string {
  const slug = username.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "user";
  const short = id.replace(/-/g, "").slice(0, 12);
  return `${slug}.${short}@users.battlecruiser.internal`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || authHeader.length < 20) {
    return json(401, { error: "Sesión inválida." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "Configuración del servidor incompleta." });
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: "Sesión inválida." });

  const { data: allowed, error: permissionError } = await caller.rpc("tiene_permiso", {
    p_seccion: "usuarios",
    p_accion: "crear",
  });
  if (permissionError || allowed !== true) {
    return json(403, { error: "No tienes permiso para crear usuarios." });
  }

  let body: { nombre?: unknown; username?: unknown; password?: unknown; role_id?: unknown };
  try { body = await req.json(); }
  catch { return json(400, { error: "Solicitud inválida." }); }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const username = typeof body.username === "string" ? normalizarUsuario(body.username) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const roleId = typeof body.role_id === "string" ? body.role_id.trim() : "";

  if (nombre.length < 2 || nombre.length > 120) {
    return json(400, { error: "El nombre completo debe tener entre 2 y 120 caracteres." });
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
    return json(400, { error: "El usuario corto debe tener 3–24 caracteres: letras, números, punto, guion o guion bajo." });
  }
  if (password.length < 6 || password.length > 256) {
    return json(400, { error: "La contraseña debe tener entre 6 y 256 caracteres." });
  }
  if (!roleId) return json(400, { error: "Selecciona un rol." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: role, error: roleError } = await admin
    .from("roles").select("id,nombre,activo").eq("id", roleId).maybeSingle();
  if (roleError || !role || role.activo === false) {
    return json(400, { error: "El rol seleccionado no existe o está desactivado." });
  }

  const { data: profiles, error: profilesError } = await admin
    .from("usuarios").select("username");
  if (profilesError) return json(503, { error: "No se pudo validar el usuario y su alias." });
  const duplicateUsername = (profiles || []).some((row: any) =>
    String(row.username || "").trim().toLowerCase() === username
  );
  if (duplicateUsername) return json(409, { error: "Ese usuario corto ya está ocupado. Prueba otro alias." });

  const provisionalId = crypto.randomUUID();
  const email = emailTecnico(username, provisionalId);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, username, battlecruiser_username: username },
  });
  if (createError || !created?.user?.id) {
    const message = (createError?.message || "").toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return json(409, { error: "No se pudo reservar ese usuario. Elige otro alias." });
    }
    return json(400, { error: createError?.message || "No se pudo crear la cuenta." });
  }

  const userId = created.user.id;
  const { data: profile, error: profileError } = await admin
    .from("usuarios")
    .upsert({
      id: userId,
      nombre,
      username,
      role_id: roleId,
      activo: true,
      archivado: false,
    }, { onConflict: "id" })
    .select("id,nombre,username,role_id")
    .single();

  if (profileError || !profile || profile.role_id !== roleId || profile.username !== username) {
    try { await admin.from("usuarios").delete().eq("id", userId); } catch (_) {}
    try { await admin.auth.admin.deleteUser(userId); } catch (_) {}
    const duplicate = String(profileError?.code || "").toUpperCase() === "23505";
    return json(duplicate ? 409 : 500, {
      error: duplicate
        ? "Ese usuario corto acaba de ser reservado por otra cuenta. Elige otro alias."
        : "No se pudo guardar el perfil, el alias y el rol. No quedó una cuenta parcial.",
    });
  }

  return json(200, {
    ok: true,
    id: userId,
    nombre,
    username,
    role_id: roleId,
    rol: role.nombre,
    message: "Usuario creado correctamente.",
  });
});
