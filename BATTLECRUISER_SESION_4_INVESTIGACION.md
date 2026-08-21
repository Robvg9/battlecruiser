# BATTLECRUISER — SESIÓN 4/30 — INVESTIGACIÓN
## Control operativo de almacén en ventas (#9, #10)

**Fecha:** 2026-08-21  
**Repo:** `Robvg9/battlecruiser` @ `main`  
**Modo:** SOLO INVESTIGACIÓN (sin código funcional, sin Supabase, sin PR)

---

## 1. RESUMEN EJECUTIVO

La regla de negocio deseada es:

```text
USUARIO → SESIÓN OPERATIVA → TURNO → ALMACÉN OPERATIVO → VENTAS
```

**En el código real de `main` esa cadena NO gobierna las ventas.**

| Eslabón | Estado real |
|---------|-------------|
| **Usuario** | Auth Supabase + `cargarContextoUsuario` (perfil/permisos) |
| **“Sesión”** | Solo sesión **Auth** (JWT). **No** existe entidad “sesión de almacén” |
| **Turno** | Tabla `turnos` + RPC B7; puede tener `almacen_id` **opcional** |
| **Almacén en turno** | Se puede abrir turno con `p_almacen_id` null o cualquiera del filtro UI |
| **Ventas** | Selector **libre** `#venta-almacen`; el FE envía `p_almacen_id` arbitrario |

**Conclusiones confirmadas:**

1. El usuario **sí puede elegir manualmente** el almacén de venta (#9 y #10: gap real).
2. El FE **no** amarra ventas a `_turnoActual.almacen_id`.
3. El backend de venta **recibe** `almacen_id` del cliente; no hay evidencia en el repo de que `registrar_venta` exija turno abierto ni que fuerce el almacén del turno.
4. Los permisos de venta son **genéricos** (`ventas` / `crear`), no “vender en este almacén”.
5. Autoridad final deseada = backend → **BACKEND PENDIENTE → CLAUDE** para validación dura; UI → **GROK**.

---

## 2. ESTADO ACTUAL DE VENTAS

**Archivos:** `public/js/ventas.js`, `public/index.html` (`#tab-ventas`), `offline.js` (`RPC_POR_TIPO.venta → registrar_venta`).

| Aspecto | Implementación |
|---------|----------------|
| Selector de almacén | `<select id="venta-almacen">` **libre**, poblado con **todos** los almacenes de `cargarAlmacenes()` |
| Cambio de almacén | Usuario cambia el select; si hay líneas en carrito, se vacía (porque el precio depende del tipo de almacén) |
| Precio | Según `almacenes.tipo`: `venta` → `precio_normal`; `mayorista` → `precio_mayorista` |
| Payload venta | `ejecutarOperacion("venta", { p_almacen_id, p_lineas })` — **sin** `turno_id` |
| Turno | **No consultado** en el flujo de venta |
| Bloqueo sin turno | **No** |
| Bloqueo almacén ≠ turno | **No** |

Respuestas A–I (frontend):

| | Pregunta | Respuesta |
|---|----------|-----------|
| A | ¿Puede elegir almacén manualmente? | **Sí** |
| B | ¿Almacén auto-seleccionado? | **No** (placeholder “Almacén”) |
| C | ¿Qué determina el almacén? | Valor del `<select>` elegido por el usuario |
| D | ¿FE confía en valor del usuario? | **Sí** |
| E | ¿Se puede modificar antes de registrar? | **Sí** (UI y DevTools) |
| F | ¿Bloqueo visual por permiso de almacén? | Solo permiso genérico de sección ventas vía tabs; **no** por almacén |
| G | ¿Conoce turno activo? | Variable `_turnoActual` existe en otro módulo; **ventas no la usa** |
| H | ¿Conoce “sesión” operativa de almacén? | **No** (solo Auth) |
| I | ¿Conoce almacén de sesión/turno? | Turno puede traer `almacen_id` vía RPC; **ventas no lo lee** |

---

## 3. ESTADO ACTUAL DE ALMACENES

- Catálogo `almacenes` (id, nombre, tipo `venta`\|`mayorista`, activo).
- CRUD en `almacenes.js`; listados en selects de ventas, compras, transferencias, turnos.
- **No** hay asignación usuario↔almacén en el frontend auditado.
- **No** hay permiso “almacén X” en la matriz FE (`tienePermiso("ventas","crear")` es global).

---

## 4. ESTADO ACTUAL DE SESIONES

| Concepto | Realidad |
|----------|----------|
| Sesión Auth | `client.auth` / `getSession` / `onAuthStateChange` |
| Sesión operativa de almacén | **No existe** como tabla ni variable de dominio |
| Limpieza al logout | `limpiarContextoUsuario()` limpia usuario, permisos, caches; **no** hay “sesión de almacén” que limpiar |

La cadena deseada “sesión → almacén” **no está modelada**. Lo más cercano es **turno** con `almacen_id` opcional.

---

## 5. ESTADO ACTUAL DE TURNOS

**Backend** (`supabase/b7-operacion-humana.sql`):

- Tabla `turnos`: `usuario_id`, `almacen_id` (**nullable**), estados PROGRAMADO/ABIERTO/CERRADO/CANCELADO.
- `abrir_turno(p_almacen_id, p_idempotency_key, p_observacion)`: valida permiso `turnos/crear` y un solo turno ABIERTO; **acepta `almacen_id` null**.
- `turno_actual_usuario()`: devuelve JSON con `id`, `estado`, **`almacen_id`**, apertura, nombre, cuadre.
- Cierre crea cuadre; dinero esperado suma ventas por **período** y, si el turno tiene almacén, filtra por ese `almacen_id` (comentario en SQL: ventas no tienen `usuario_id`).

**Frontend** (`operacion-humana.js`):

- `_turnoActual` en memoria; se carga con `refrescarTurnoActual()` (arranque vía `showApp` parcheado + pestaña Turnos).
- `abrirTurno()` toma `p_almacen_id` del select **`#turno-filtro-almacen`** (filtro de listado), no de un selector dedicado de “almacén del turno”; puede ir **null**.
- `renderTurnoActual` **no muestra** el nombre del almacén del turno.
- **Ningún enlace** desde ventas hacia `_turnoActual`.

---

## 6. ESTADO ACTUAL DE PERMISOS

| Acción | Mecanismo |
|--------|-----------|
| Ver/crear ventas (UI) | `tienePermiso` / tabs (`ventas` → sección ventas) |
| Ejecutar venta | `ejecutarOperacion` → `usuarioPuedeOperar()` (usuario activo) + RPC `registrar_venta` |
| Turnos | sección `turnos` (ver/crear/editar/editar_any) |
| Almacenes admin | sección `almacenes` |

**No existe** diferencia entre:

- “tiene permiso para vender”, y  
- “tiene permiso para vender **en este almacén**”.

Es un permiso **genérico de venta**.

---

## 7. CADENA REAL: usuario → sesión → turno → almacén → venta

```text
[IMPLEMENTADO]  auth.uid() / _usuarioActual
       ↓
[IMPLEMENTADO]  sesión Auth (JWT) — NO es sesión de almacén
       ↓
[IMPLEMENTADO PARCIAL]  turno ABIERTO opcional (_turnoActual / turnos.almacen_id nullable)
       ↓
[ROTURA]  ventas IGNORAN el turno
       ↓
[IMPLEMENTADO PERO INSEGURO]  p_almacen_id elegido en UI → registrar_venta
```

Cadena deseada vs real:

| Paso deseado | ¿Implementado? |
|--------------|----------------|
| Usuario autenticado | Sí |
| Sesión operativa en un almacén | **No** |
| Turno obliga almacén | **No** (almacén opcional) |
| Venta usa solo almacén del turno | **No** |
| Backend rechaza otro almacén | **No evidenciado en repo** → tratar como pendiente Claude |

---

## 8. ANÁLISIS DE LOS CASOS A–G

| Caso | Qué ocurre hoy (según código) | FE | BE (evidencia repo) | ¿Protegido? |
|------|-------------------------------|----|---------------------|-------------|
| **A** Sesión/turno La Cueva, vende TuMejorOpcion | Puede elegir TuMejorOpcion en el select y confirmar | No bloquea | Acepta `p_almacen_id` del cliente | **NO** |
| **B** Sin turno, intenta vender | Puede vender igual | No exige turno | Sin vínculo venta↔turno en FE | **NO** (regla de negocio) |
| **C** Turno La Cueva, cambia `almacen_id` en UI | Select libre | No | Cliente controla almacén | **NO** |
| **D** Dos “sesiones” en almacenes distintos | No hay sesión de almacén; un solo turno ABIERTO por usuario en BE | N/A | Un turno ABIERTO máx. | Parcial (turno), irrelevante para ventas |
| **E** DevTools cambia select / payload | Efectivo | No | Confía en parámetro | **NO** |
| **F** RPC directa con otro `almacen_id` | Posible si el RPC solo valida permiso genérico | N/A | **BACKEND PENDIENTE** validar contra turno | **NO** (asumido hasta Claude confirme producción) |
| **G** Turno cierra / expira a mitad de venta | Carrito local sigue; al confirmar no revalida turno en FE | No | Depende de RPC | **NO** en FE |

**Comportamiento deseado (referencia):**

- A/C/E/F → rechazo UX + rechazo RPC.  
- B → “No puedes vender sin turno operativo válido”.  
- G → revalidar turno al confirmar; rechazar si cerró.

---

## 9. CAUSAS CONFIRMADAS

1. **Selector libre de almacén en ventas** (`#venta-almacen`) — causa directa de #9/#10.  
2. **Desacoplamiento total ventas ↔ `_turnoActual`**.  
3. **No existe “sesión de almacén”**; solo Auth + turno opcional.  
4. **`abrir_turno` permite `almacen_id` null** y el FE puede enviarlo null.  
5. **Permiso de venta no es por almacén**.  
6. **Payload de venta incluye `p_almacen_id` controlado por el cliente** → autoridad no está en el servidor para la regla de negocio deseada (pendiente endurecer en Claude).

---

## 10. HIPÓTESIS PENDIENTES

| ID | Hipótesis | Probabilidad | Qué falta |
|----|-----------|--------------|-----------|
| H1 | Producción ya valida turno en `registrar_venta` aunque el SQL del repo no lo muestre actualizado | Baja–media | Introspección Claude en proyecto real |
| H2 | RLS en `ventas` limita por almacén de usuario | Baja (RPC SECURITY DEFINER suele ser el camino) | Claude |
| H3 | Producto espera “sesión” = turno; solo falta cablear FE | Media | Decisión de producto |

---

## 11. SOLUCIÓN ARQUITECTÓNICA PROPUESTA (sin implementar)

```text
1. Al abrir turno: almacén OBLIGATORIO (UI + RPC).
2. turno_actual_usuario / _turnoActual siempre con almacen_id válido cuando ABIERTO.
3. Ventas:
   - Quitar selector libre.
   - Mostrar solo: "📍 Vendiendo desde: {nombre almacén}".
   - Si no hay turno ABIERTO con almacén: bloquear venta + mensaje claro.
4. Payload FE: puede omitir p_almacen_id o enviarlo solo como eco;
   el BE debe IGNORAR el almacén del cliente y usar el del turno (o validar igualdad).
5. registrar_venta (Claude):
   - Requiere turno ABIERTO del auth.uid().
   - Fija almacen_id = turnos.almacen_id.
   - Rechaza si no hay turno o almacén null.
6. Offline: encolar solo si hay contexto de turno conocido en cliente;
   al sincronizar, BE vuelve a validar (no confiar en payload viejo).
```

Frontend muestra contexto; **backend es autoridad final**.

---

## 12. MATRIZ GROK vs CLAUDE

| Problema | Grok | Claude |
|----------|------|--------|
| Quitar selector libre de almacén | Sí | — |
| Mostrar almacén operativo (label) | Sí | — |
| Cargar/usar `_turnoActual` en ventas | Sí | — |
| Exigir almacén al abrir turno (UI) | Sí | — |
| Mensajes UX sin turno / sin almacén | Sí | — |
| `abrir_turno`: almacén NOT NULL | — | Sí |
| `registrar_venta`: almacén desde turno; ignorar/validar cliente | — | Sí |
| Rechazar venta sin turno ABIERTO | — | Sí |
| Constraints / tests SQL | — | Sí |
| Pruebas Android/UI | Sí | — |
| Pruebas RPC/adversariales | — | Sí |

Si Claude confirma que producción ya valida turno, Grok igual debe alinear UI (no dejar selector libre engañoso).

---

## 13. DEPENDENCIAS

- B7 turnos deben estar aplicados en el proyecto Supabase real.  
- Decisión de producto: ¿venta sin turno alguna vez permitida a roles admin? (por defecto: no para vendedor).  
- Cuadres ya asumen ventas por almacén de turno cuando `almacen_id` no es null — endurecer almacén en turno **mejora** coherencia de cuadres.  
- Offline/cola: no romper `ejecutarOperacion` / idempotencia.

---

## 14. RIESGOS

| Riesgo | Mitigación |
|--------|------------|
| Dueños/admins que hoy venden sin turno | Excepción de permiso explícita (`ventas` + flag) acordada, no selector libre |
| Turnos históricos con `almacen_id` null | Migración/datos Claude |
| Ventas offline con turno cerrado al sync | BE rechaza; FE marca REQUIERE_ATENCION |
| Confundir filtro `#turno-filtro-almacen` con almacén del turno | Selector dedicado al abrir turno |

---

## 15. SESIONES DE IMPLEMENTACIÓN ESTIMADAS

| Bloque | Sesiones |
|--------|----------|
| Investigación #9/#10 | **1** (esta — 4/30) |
| Grok: UI ventas sin selector + turno obligatorio + copy | **1–2** |
| Grok: abrir turno con almacén obligatorio + mostrar almacén en tarjeta | **0.5–1** |
| Claude: RPC `abrir_turno` + `registrar_venta` | **1–2** |
| Validación Android (Grok/Roberto) | **1** |
| Validación backend adversarial (Claude) | **0.5–1** |

**Subtotal orientativo:** 4–7 sesiones de trabajo tras esta investigación.

---

## 16. CRITERIOS DE CIERRE

Pruebas concretas:

1. Usuario con turno en **La Cueva** ve “Vendiendo desde: La Cueva” y **no** puede elegir TuMejorOpcion.  
2. Sin turno ABIERTO: no puede confirmar venta; mensaje claro.  
3. DevTools / request con otro `almacen_id`: **backend rechaza** (o ignora y graba el del turno).  
4. Abrir turno exige elegir almacén; no quedan turnos ABIERTO sin almacén.  
5. Tras cerrar turno, venta bloqueada hasta nuevo turno.  
6. Regresión: precio normal/mayorista según **tipo** del almacén del turno.  
7. Offline: no introduce agujero que permita otro almacén al sincronizar.

---

## COMPARACIÓN CON EL CEREBRO

| Tema | Cerebro | Código | Clasificación |
|------|---------|--------|---------------|
| Ventas completadas | Sí | UI + offline + RPC | IMPLEMENTADO PERO INCOMPLETO (sin control de almacén operativo) |
| Almacenes M13 | Sí | CRUD almacenes | IMPLEMENTADO Y CORRECTO (como catálogo) |
| Turnos B7 | Implementado en producción | FE + SQL en repo | IMPLEMENTADO PERO INCOMPLETO respecto a ventas |
| Cadena usuario→turno→almacén→venta | No afirmada como cerrada | **No existe** | NO IMPLEMENTADO / CONTRADICCIÓN si se interpreta el Cerebro como “operación completa segura multi-almacén” |
| Permisos por almacén | No documentados | No existen | NO IMPLEMENTADO |
| Seguridad multi-almacén en POS | No detallada | Selector libre | BUG de producto / gap de seguridad operativa |

**Cerebro no se modifica en esta sesión.**

---

## CHECKPOINT SESIÓN 4

```text
SESIÓN 4/30 — PASS
ARCHIVO CREADO: BATTLECRUISER_SESION_4_INVESTIGACION.md
ARCHIVOS FUNCIONALES MODIFICADOS: 0
SUPABASE MODIFICADO: NO
COMMITS FUNCIONALES: 0
PR: NO
CAMBIOS DE CÓDIGO: NO
```
