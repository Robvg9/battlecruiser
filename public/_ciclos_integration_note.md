# FASE 2.1 Ciclos Operativos (solo lectura)

## Ya en main (OK)
- `public/js/ciclos.js` — lecturas listar/obtener, sin mutaciones
- `public/js/navegacion.js` — hook `refrescarCiclos`
- `public/js/usuarios-permisos.js` — `TAB_A_SECCION.ciclos = "ciclos"`, SECCIONES incluye ciclos/entregas_caja
- `public/service-worker.js` — CACHE v50 + ciclos.js en SHELL_FILES

## Bloqueo
Commit `7ed4fc9` truncó `public/index.html` (556 deletions). Base correcta: `aa16271b`.

## Inserts pendientes en index.html (sobre base aa16271b)

1. Tab después de Turnos:
```html
<button class="tab-btn" data-tab="ciclos">Ciclos Operativos</button>
```

2. Panel después de `</section>` de `#tab-turnos` (ids alineados con ciclos.js):
- `#ciclos-conn-info`, `#ciclo-filtro-estado`, `#ciclo-filtro-almacen`, `#ciclos-refrescar-btn`, `#lista-ciclos`, `#ciclo-detalle`, `#msg-ciclos`

3. Script después de operacion-humana.js:
```html
<script src="js/ciclos.js"></script>
```

## No tocar
offline.js, ejecutarOperacion, sincronizarCola, IndexedDB, SQL, Supabase, mutaciones RPC.
