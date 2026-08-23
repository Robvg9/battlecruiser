// BattleCruiser — Edge Function: crear-usuario-sin-email
// Contrato canónico (v1). Desplegada en papxnkkjtkxsitcsvcme.
// El administrador NO envía correo: el backend genera un email técnico interno.
//
// POST body JSON:
//   { "nombre": string, "password": string, "role_id": uuid }
//
// Éxito 200:
//   { "ok": true, "id": uuid, "nombre": string, "role_id": uuid }
//
// Errores 4xx:
//   { "error": string }
//
// Seguridad:
//   - Requiere JWT de usuario autenticado
//   - Verifica permiso usuarios/crear
//   - Crea auth.users con service role (email técnico no visible en UI)
//   - Inserta public.usuarios + role_id
//   - Si falla el perfil tras crear Auth, intenta borrar el user de Auth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function emailTecnico(nombre: string, id: string): string {
  const slug = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40) || "user";
  const short = id.replace(/-/g, "").slice(0, 12);
  return `${slug}.${short}@users.battlecruiser.internal`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Método no permitido" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || authHeader.length < 20) {
    return json(401, { error: "Sesión inválida" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "Configuración del servidor incompleta." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: "Sesión inválida" });
  }

  const { data: puedeCrear, error: permErr } = await userClient.rpc("tiene_permiso", {
    p_seccion: "usuarios",
    p_accion: "crear",
  });
  if (permErr) {
    const { error: listErr } = await userClient.rpc("listar_usuarios_admin", {});
    if (listErr) {
      return json(403, { error: "No tenés permiso para crear usuarios." });
    }
  } else if (puedeCrear !== true) {
    return json(403, { error: "No tenés permiso para crear usuarios." });
  }

  let body: { nombre?: string; password?: string; role_id?: string; usuario?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Cuerpo JSON inválido." });
  }

  const nombre = String(body.nombre || body.usuario || "").trim();
  const password = String(body.password || "");
  const roleId = String(body.role_id || "").trim();

  if (!nombre) return json(400, { error: "El usuario es obligatorio." });
  if (nombre.length < 2) return json(400, { error: "El usuario debe tener al menos 2 caracteres." });
  if (!password || password.length < 6) {
    return json(400, { error: "La contraseña debe tener al menos 6 caracteres." });
  }
  if (!roleId) return json(400, { error: "Debés seleccionar un rol." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existentes, error: dupErr } = await admin
    .from("usuarios")
    .select("id,nombre")
    .ilike("nombre", nombre);
  if (dupErr) {
    return json(500, { error: "No se pudo validar el nombre de usuario." });
  }
  if ((existentes || []).some((u) => (u.nombre || "").toLowerCase() === nombre.toLowerCase())) {
    return json(409, { error: "Ya existe un usuario con ese nombre." });
  }

  const { data: rol, error: rolErr } = await admin
    .from("roles")
    .select("id,nombre,activo")
    .eq("id", roleId)
    .maybeSingle();
  if (rolErr || !rol) {
    return json(400, { error: "El rol seleccionado no existe." });
  }
  if (rol.activo === false) {
    return json(400, { error: "Ese rol está desactivado." });
  }

  const provisionalId = crypto.randomUUID();
  const email = emailTecnico(nombre, provisionalId);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, battlecruiser_username: nombre },
  });

  if (createErr || !created?.user?.id) {
    const msg = (createErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json(409, { error: "Ya existe una cuenta con ese identificador. Probá otro nombre." });
    }
    return json(400, {
      error: createErr?.message || "No se pudo crear el usuario en autenticación.",
    });
  }

  const newId = created.user.id;

  const { error: perfilErr } = await admin.from("usuarios").insert({
    id: newId,
    nombre,
    role_id: roleId,
    activo: true,
  });

  if (perfilErr) {
    try {
      await admin.auth.admin.deleteUser(newId);
    } catch (_) {}
    const pmsg = (perfilErr.message || "").toLowerCase();
    if (pmsg.includes("duplicate") || pmsg.includes("unique")) {
      return json(409, { error: "Ya existe un usuario con ese nombre." });
    }
    return json(500, {
      error: "No se pudo crear el perfil interno. No quedó un usuario parcial.",
    });
  }

  return json(200, {
    ok: true,
    id: newId,
    nombre,
    role_id: roleId,
    rol: rol.nombre,
  });
});
