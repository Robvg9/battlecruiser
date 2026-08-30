# CHATBENDING — Micro-misión M53: Rediseño profesional de Inventario

**Estado:** 🟡 IMPLEMENTADO / PENDIENTE VALIDACIÓN DE ROBERT  
**Fecha:** 2026-08-30  
**Versión FE:** v9.4.32  
**Commit:** `a0188fefc90219a955c47498c2d62ebb90fa1792`  
**HEAD previo:** `90c55213e968fd2d88e0b5471e76c1129d0f81b7`

---

## Objetivo

Convertir la sección Inventario en un centro de control de stock profesional:
resumen primero → alertas accionables → filtros → cards → detalle bajo demanda.

## Auditoría (pre-cambio)

| Ítem | Hallazgo |
|------|----------|
| Ownership | `nucleo-operativo.js` escribía `#inv-resumen` + `#inv-detalle` |
| Complementos | `inventario-detalle.js` (modal), `mision-d-stock-reposicion.js` (stock bajo) — sin pelea de DOM |
| RPC | `inventario_enriquecido(p_almacen_id)` |
| Campos | producto_id, producto, almacen, cantidad, minimo, estado, costo_promedio, valor_inventario |
| Permiso | `reportes.ver` |
| Offline | Vista enriquecida online-only; stock bajo con fallback local |

## Implementación

### Archivos

| Archivo | Acción |
|---------|--------|
| `public/js/m53-inventario-centro.js` | **Creado** — autoridad visual única |
| `public/app.js` | Versionado a 9.4.32 + carga `m53-inventario-centro.js?v=53.1` |

### No modificados

- Movimientos, Productos, Reportes, Turnos
- `inventario-detalle.js`, `mision-d-stock-reposicion.js` (reutilizados)
- Supabase / RPC
- IndexedDB / cola offline

### Comportamiento

1. **Hero** — título + subtítulo + estado de conexión  
2. **Métricas** — Valor inventario · Unidades · Productos · Agotados · Bajo mínimo (sobre todas las filas del almacén)  
3. **Alertas** — chips accionables Agotados / Bajo mínimo (filtran) + acceso a modal de reposición  
4. **Filtros** — Almacén · Estado · Buscar + Aplicar / Limpiar + chips  
5. **Cards** — imagen (`_cache.productos.imagen_url` si existe), nombre, stock, almacén, mín, valor, badge de estado  
6. **Detalle** — click en card → modal existente (`inventario-detalle.js` vía `.rep-fila[data-inv-producto]` + `_invFilas`)  
7. **Stock bajo** — botón mision-d reubicado en toolbar; modal intacto  
8. **Estados** — loading / empty / error + Reintentar  
9. **Hooks** — sobrescribe `refrescarInventario` y `renderInventario` (como M51 con Movimientos)

### Supabase

**Sin cambios.**

## Checklist Robert

- [ ] Abrir Inventario → métricas coherentes con datos reales  
- [ ] Cambiar almacén → métricas + cards + alertas cambian juntos  
- [ ] Filtrar Bajo mínimo / Agotados  
- [ ] Buscar por nombre  
- [ ] Chips y Limpiar filtros  
- [ ] Click producto → modal de detalle con datos correctos  
- [ ] Botón / alerta Reposición → modal stock bajo  
- [ ] Sin conexión → mensaje claro  
- [ ] Desktop + móvil sin overflow  
- [ ] Movimientos / Productos / Reportes / Turnos sin regresión  
- [ ] Versión visible **v9.4.32**

## Criterio de cierre

🟢 solo cuando Robert valide en runtime real.
