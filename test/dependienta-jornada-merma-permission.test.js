"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const migration=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261112142000_dependienta_jornada_merma_creation.sql"),"utf8");
test("Dependienta receives only the create permission to request merma in her Jornada",()=>{
 assert.match(migration,/INSERT INTO public\.permisos\(role_id,seccion,accion,permitido\)/);
 assert.match(migration,/SELECT r\.id,'mermas','crear',true/);
 assert.match(migration,/lower\(btrim\(r\.nombre\)\) IN \('dependienta','dependientas'\)/);
 assert.match(migration,/ON CONFLICT \(role_id,seccion,accion\)/);
 assert.match(migration,/DO UPDATE SET permitido=true/);
 assert.doesNotMatch(migration,/editar_any|borrar|UPDATE public\.stock/i);
});
