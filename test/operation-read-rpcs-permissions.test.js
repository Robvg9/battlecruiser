"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261030120000_bc4_harden_operation_read_rpcs_permissions.sql"),
  "utf8"
);

test("operational list RPCs require turnos.ver before returning user-scoped rows", () => {
  for (const fn of ["listar_incidencias", "listar_responsabilidades"]) {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION public." + fn);
    assert.notEqual(start, -1, "migration must replace " + fn);
    const end = migration.indexOf("$function$;", start);
    assert.notEqual(end, -1, fn + " definition must be complete");
    const body = migration.slice(start, end);

    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path TO 'public', 'pg_temp'/);
    assert.match(body, /public\._validar_usuario_operacion\('turnos', 'ver'\)/);
    assert.match(body, /public\.tiene_permiso\('turnos', 'editar_any'\)/);
    assert.match(body, /ORDER BY .*\.creado_en DESC/);
    assert.doesNotMatch(body, /auth\.uid\(\)\s+IS\s+NOT\s+NULL/i,
      fn + " must not use authentication alone as its authorization gate");
  }
});

test("list RPCs preserve owner scoping and bounded paging", () => {
  const incidencias = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.listar_incidencias"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.listar_responsabilidades")
  );
  const responsabilidades = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.listar_responsabilidades")
  );

  assert.match(incidencias, /admin OR i\.usuario_id = uid/);
  assert.match(incidencias, /p_estado IS NULL/);
  assert.match(incidencias, /p_tipo IS NULL/);
  assert.match(incidencias, /p_turno_id IS NULL/);
  assert.match(incidencias, /p_limite > 200/);
  assert.match(responsabilidades, /admin OR r\.usuario_id = uid OR r\.creador_id = uid/);
  assert.match(responsabilidades, /p_usuario_id IS NULL/);
  assert.match(responsabilidades, /p_turno_id IS NULL/);
  assert.match(responsabilidades, /p_estado IS NULL/);
  assert.match(responsabilidades, /p_limite > 200/);
});

test("the permission hardening migration changes functions only, not role or operational data", () => {
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 2);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+)?(?:public\.)?(?:permisos|roles|usuarios|turnos|turno_sesiones|stock|gastos|mermas)\b/i);
  assert.doesNotMatch(migration, /GRANT\s+EXECUTE/i);
});
