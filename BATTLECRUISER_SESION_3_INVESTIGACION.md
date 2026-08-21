# BATTLECRUISER — SESIÓN 3/30 — INVESTIGACIÓN
## Productos + Categorías + Presentaciones (#3, #4, #5, #6)

**Fecha:** 2026-08-21  
**Repo:** `Robvg9/battlecruiser` @ `main`  
**Modo:** SOLO INVESTIGACIÓN (sin cambios de código, sin Supabase, sin commits funcionales de app)

---

## 1. RESUMEN EJECUTIVO

El modelo real de BattleCruiser **no** trata “minorista / mayorista” como presentaciones de venta. Esa dualidad vive en:

1. **Precios del producto:** `precio_normal` y `precio_mayorista`.
2. **Tipo de almacén:** `almacenes.tipo` = `venta` | `mayorista` → la venta elige el precio según el almacén.

Las **presentaciones** son un catálogo aparte (`presentaciones` + `producto_presentaciones` con `factor`) orientado sobre todo a **compras** (y conversión a unidades base en RPC de mutación). La **venta** actual opera en **unidades base** y **no** expone selector de presentación en UI.

El campo **“unidad”** del producto es un **texto libre** (con datalist de sugerencias), **no** es FK al catálogo `unidades` ni es una presentación.

Gaps principales respecto a la expectativa de prueba Android:

| # | Gap |
|---|-----|
| **#3** | UI de producto no asocia presentaciones al crear/editar; presentaciones viven en otro bloque de la misma pestaña; venta no vende “por caja”. |
| **#4** | Categoría y presentación **no** son obligatorias (FE ni BE). Se pueden crear productos incompletos. |
| **#5** | Imagen acepta JPG/PNG ≤5MB; **no** hay crop ni validación 1:1; el CSS solo fuerza cuadrado en **visualización**. |
| **#6** | Catálogos dispersos: presentaciones dentro de **Productos**; categorías/unidades en **Configuración**. No existe sección “CATÁLOGOS” unificada. |

Clasificación de trabajo:

- Mucho de #4 (validación FE), #5 (UX crop/preview) y #6 (reorganización de menú) → **GROK (frontend)**.
- Obligatoriedad real de categoría/presentación, constraints y contratos de RPC → **CLAUDE (backend)** si se exige en datos, no solo en UI.
- #3 puede ser **solo UX de descubrimiento** o un **cambio de producto** (venta por presentación); lo segundo implica backend + ventas y es mayor.

---

## 2. #3 — PRODUCTOS / PRESENTACIONES

### Estado actual

**Formulario producto** (`#form-producto` en `public/index.html` + handler en `public/js/productos.js`):

| Campo UI | Origen de datos | Obligatorio FE |
|----------|-----------------|----------------|
| Nombre | input | Sí (`required` + trim) |
| Categoría | `<select>` desde tabla `categorias` | No (`value || null`) |
| Unidad | input texto + `datalist` estático | No |
| Precio normal | number | Sí (`> 0`) |
| Precio mayorista | number | No (null permitido) |
| Imagen | file | No |
| Presentaciones | **No están en el formulario de producto** | — |

**Modelo de datos:**

```text
productos: nombre, categoria_id (nullable), unidad (text),
  precio_normal, precio_mayorista (nullable), imagen_url, activo
categorias / unidades / presentaciones: catálogos id, nombre, activo
producto_presentaciones: producto_id, presentacion_id, factor, activo (N por producto)
```

**Unidad** = etiqueta de unidad base (texto libre), no presentación ni FK a `unidades`.

**Presentaciones** = empaque con factor; UI en Productos; compras las usan; **ventas no**.

**Minorista/mayorista** = `precio_normal` / `precio_mayorista` + `almacenes.tipo`, no filas de presentaciones.

### Evidencia clave

- `productos.js`, `presentaciones.js`, `ventas.js`
- `supabase/m3-productos-editar-estado.sql`
- Cerebro §7

### Causa / gap

Modelo mental UX ≠ modelo técnico. Asociación de presentaciones es un segundo paso. Venta solo en unidades base.

### Solución propuesta

- **Opción A (recomendada):** UX/claridad + asociación visible (Grok).
- **Opción B:** venta por presentación (Grok + Claude, mayor).

### Frontend / backend

Opción A: solo Grok. Opción B: ambos.

### Sesiones estimadas

Opción A: 1–2 Grok + 1 validación. Opción B: 2–4 Grok + 1–2 Claude + 1–2 validación.

### Criterio de cierre

UI clara; asociación accesible; venta por caja solo si se aprueba B.

---

## 3. #4 — CAMPOS OBLIGATORIOS

Categoría y presentación **no** obligatorias en FE ni en `crear_producto`. Nombre sí; precio normal FE `> 0`, BE `>= 0`.

### Solución

Firmar reglas → validación Grok → constraints/RPC Claude si aplica.

### Sesiones

1 Grok (+1 Claude si BE) + validación.

---

## 4. #5 — FOTO 1:1

JPG/PNG ≤5MB; preview sí; **sin crop**; CSS `object-fit: cover` en thumbs.

**Recomendación:** opción B — crop obligatorio 1:1 en cliente antes de subir.

### Sesiones

1–2 Grok + 1 validación.

---

## 5. #6 — CATÁLOGOS

| Catálogo | Ubicación UI |
|----------|----------------|
| Categorías / Unidades | Configuración |
| Presentaciones (global) | Productos |
| Asociaciones producto–presentación | Productos |

Propuesta: catálogos admin en Configuración → CATÁLOGOS; asociaciones en flujo producto.

### Sesiones

1 Grok + 1 validación.

---

## 6. MATRIZ GROK vs CLAUDE

| Trabajo | Responsable |
|---------|-------------|
| UI formulario / validación visual | Grok |
| Reorganización catálogos | Grok |
| Crop 1:1 | Grok |
| Integración FE RPC existentes | Grok |
| RPC/constraints categoría | Claude |
| Migración datos legacy | Claude |
| Venta por presentación (Opción B) | Claude + Grok |
| Validación server imagen (opcional) | Claude |

---

## 7. DEPENDENCIAS

```text
#6 → aclara #3
#3 → define “presentación válida” para #4
#4 → puede exigir Claude
#5 → independiente
```

---

## 8. SESIONES ESTIMADAS

| Fase | Sesiones |
|------|----------|
| Investigación | 1 (esta) |
| Impl. Grok | 3–5 |
| Impl. Claude | 0–3 |
| Validación | 1–2 |

---

## 9. CRITERIOS DE CIERRE

1. Alta según reglas obligatorias.
2. Error claro si faltan campos.
3. Crop 1:1 en fotos.
4. Catálogos en lugar acordado.
5. Compra con factor OK.
6. Precio venta según tipo almacén.
7. Offline intacto.

---

## 10. CONCLUSIÓN

Presentaciones **existen** y sirven sobre todo a compras/conversión. Minorista/mayorista es **precio + almacén**. #4–#6 son obligatoriedad, imagen y organización de menú. Cerebro: capacidad marcada completa; respecto a prueba Android: **implementado pero incompleto / UX confusa**.

**Cerebro no se actualiza en esta sesión.**

---

## CHECKPOINT SESIÓN 3

```text
SESIÓN 3/30 — PASS (investigación)
ARCHIVO CREADO: BATTLECRUISER_SESION_3_INVESTIGACION.md
ARCHIVOS FUNCIONALES MODIFICADOS: 0
SUPABASE MODIFICADO: NO
COMMITS FUNCIONALES: 0
PR: NO
CAMBIOS DE CÓDIGO: NO
```
