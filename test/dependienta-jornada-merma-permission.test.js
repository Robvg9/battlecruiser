"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const migration=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261112142000_dependienta_jornada_merma_creation.sql"),"utf8");
test("Dependienta receives only the create permission to request merma in her Jornada",()=>{
 assert.match(migration,/lower\(btrim\(r\.nombre\)\) IN \('dependienta','dependientas'\)/);
 assert.match(migration,/p\.seccion='mermas'/);
 assert.match(migration,/p\.accion='crear'/);
 assert.match(migration,/SET permitido=true/);
 assert.doesNotMatch(migration,/p\.accion IN \('editar','editar_any','borrar'\)/);
});
