# BATTLECRUISER — CEREBRO V2.2
### Documento maestro único del proyecto (reemplaza a V2.1 — no borrar versiones viejas del historial de archivos, pero usar este como referencia vigente)

**Titular del proyecto:** Roberto Carlos Verdecia Gonzalez
**Fecha de creación de V1.0:** 2026-08-09
**Fecha de esta actualización (V2.2 + Sesión 14):** 2026-08-10
**Estado:** El login sigue confirmado funcionando de verdad. Roberto reportó que cambió la
contraseña desde la app y no quedó cambiada de verdad — Sesión 14 encontró la causa raíz
(desfase de caché del service worker, ver Bitácora) y la corrigió, junto con 6 mejoras
chicas al front-end de Productos/Almacenes/Transferencias/Vales. Código escrito y
entregado (`v2.2`), **todavía no confirmado por Roberto en uso real** (regla de oro
Sección 0.2) — esta vez la confirmación pendiente #1 es específicamente cambiar la
contraseña y volver a entrar con la nueva, de punta a punta.

---

## 0. LÉEME PRIMERO — INSTRUCCIONES PARA CUALQUIER IA QUE RECIBA ESTE DOCUMENTO

Este archivo es la **memoria persistente** del proyecto Battlecruiser. Roberto lo va a
pegar/subir al principio de cada sesión nueva con cualquier IA (Claude, ChatGPT, Gemini,
etc.) para que esa IA arranque sabiendo todo lo que ya se decidió, sin repetir trabajo ni
perder contexto.

**Reglas para cualquier IA que trabaje sobre este documento:**

1. **No inventes que algo está hecho si no está confirmado en la Sección 7 (Bitácora)**
   con fecha y resultado de prueba real. Las secciones 1-6 son la base de referencia
   (visión, spec funcional, arquitectura, reglas) — la Sección 7 es la única fuente de
   verdad sobre qué se implementó realmente y qué falta.
2. **Regla de oro (heredada de CuevaCoin, ya probada):** antes de asumir que algo sigue
   pendiente, verificar contra el código real del proyecto (si hay código para revisar
   en esa sesión) — la narrativa de este documento puede quedar un paso atrás.
3. **Nunca borres información vieja de la Sección 7** — si algo se decidió mal y se
   corrigió después, se anota el cambio con fecha, no se reescribe la historia.
4. **Cuando termine tu sesión de trabajo**, si tuviste avances, agregá una entrada nueva
   en la Sección 7 (Bitácora de sesiones) con fecha, qué se hizo, qué se confirmó
   probando de verdad, y qué queda pendiente para la próxima sesión.
5. **Regla de compresión de bitácora (definida 2026-08-09):** comprimir las entradas
   viejas de la Sección 7 a 1-2 líneas cada una **cada 9 sesiones de IA, o antes si la
   sección crece mucho** (lo que ocurra primero). Llevar la cuenta de sesión en el
   encabezado de cada entrada (Sesión 1, Sesión 2, ...). Nunca comprimir las últimas
   ~10 tandas sin permiso explícito de Roberto.
6. **Al final de cada sesión**, además de la entrada en la Sección 7, dar a Roberto un
   **resumen corto (5-10 líneas)** en el chat para que pueda leer rápido sin abrir todo
   el documento.
7. **Este documento reemplaza** a `especificacion-pos-soluciones360.md` y
   `reglas-estrategia-cuevacoin.md` (ya fusionados desde V1.0). No hace falta volver a
   leer esos dos archivos.
8. **Regla de versionado sincronizado (definida 2026-08-09):** cada vez que se entregue
   código/build del proyecto, el número de versión del archivo entregado (ej.
   `battlecruiser-v1.4.zip`) y el de este documento maestro (`Cerebro V1.4`) deben
   coincidir exactamente. Nunca entregar uno sin el otro actualizado a la par.
9. **Regla de entrega (definida Sesión 13, pedido explícito de Roberto):** cada vez que se
   entregue un archivo o código nuevo, se entrega junto con este documento maestro
   actualizado (mismo turno, no después). Cuando el cambio es solo en 1-3 archivos de
   código chicos, se puede entregar como bloques de código para copiar y pegar (además del
   `.md` actualizado), no hace falta armar un `.zip` nuevo salvo que Roberto lo pida.

---

## 1. VISIÓN Y ALCANCE DEL PROYECTO

- **Nombre:** Battlecruiser
- **Qué es:** software propio de punto de venta + inventario, para **PC (Windows) y
  Android**, inspirado funcionalmente en el POS comercial "Soluciones 360" que Roberto
  ya usa y tiene licenciado a su nombre en su negocio **La Cueva**.
- **No es una copia visual** de Soluciones 360 — es una reconstrucción funcional propia,
  con diseño/marca propios.
- **Relación con CuevaCoin:** proyecto hermano (mismo dueño), pero es una app aparte —
  no comparten base de datos ni código por ahora.
- **Plataforma técnica: 🟢 CONFIRMADA — PWA** (mismo enfoque que CuevaCoin: un solo
  código para PC y Android, empaquetable como `.apk` vía TWA). Motivo: gratis (Supabase +
  Cloudflare, plan free alcanza), un solo código a mantener, y ya hay patrones de
  seguridad/caching probados de CuevaCoin. Se reevalúa nativo/Flutter solo si aparece una
  necesidad concreta de hardware que la PWA no pueda resolver.
- **Escala real del negocio — 🟢 CONFIRMADA (2026-08-09):**
  - **2 puntos operando hoy:** La Cueva (venta al público) + "TuMejor Opción" (almacén —
    antes fue punto de venta mayorista, hoy solo funciona como almacén que abastece a La
    Cueva y mueve mercancía para ventas mayoristas).
  - **1 sola caja (punto de cobro)** activa a la vez en La Cueva.
  - **6 o más vendedores/dependientes** trabajando hoy.
  - Es **probable que se sumen más puntos de venta a futuro** — no es un caso hipotético
    lejano, hay que dejar la arquitectura preparada para multi-almacén desde el día 1
    (ver nota de impacto abajo).
  - **Prioridad de costo:** debe salir gratis para uso básico; funciones de pago quedan
    como posibilidad futura, no como bloqueo de arranque.

  **⚠️ Nota de impacto (agregada en Sesión 2):** como ya existen 2 puntos reales moviendo
  mercancía entre sí, **Transferencias entre almacenes no es una función secundaria a
  postergar** — es necesaria desde el arranque, junto con el modelo multi-almacén básico
  (Almacenes, Movimientos de inventario). Ajustar prioridad de construcción en
  consecuencia cuando se arranque a codear.

---

## 2. GLOSARIO / ENTIDADES YA CONOCIDAS

- **La Cueva** — negocio de venta al público de Roberto, 1 caja activa, 6+ vendedores.
- **TuMejor Opción** — almacén propio de Roberto (antes punto de venta mayorista, hoy
  solo almacén) que abastece a La Cueva y mueve mercancía para ventas mayoristas.
  **Confirmado: sí aplica a Battlecruiser**, no es solo un ejemplo ajeno.
- **Soluciones 360** — el POS comercial de terceros que Roberto usa hoy y que sirvió de
  referencia funcional (licencia activa a nombre de Roberto Carlos Verdecia Gonzalez).
- **CuevaCoin** — proyecto hermano (banco digital interno de trabajadoras de La Cueva).

---

## 3. ESPECIFICACIÓN FUNCIONAL DE REFERENCIA
### (reconstruida por ingeniería inversa de 30 capturas de Soluciones 360 — usar como inspiración, no como copia obligatoria)

Leyenda: 🟢 Confirmado · 🟡 Inferido · 🔴 Desconocido/hueco a diseñar propio.

*(Secciones 3.1, 3.2, 3.5 sin cambios respecto a V1.0 — ver ese documento para el
detalle completo de arquitectura observada, mapa de navegación y reglas heredadas de
CuevaCoin. La 3.4 queda reemplazada por el modelo de datos definitivo de abajo.)*

### 3.4 Modelo de datos DEFINITIVO — 🟢 CERRADO (Sesión 3, reemplaza el modelo de referencia de V1.0)

- **Categoría** — nombre. Definida por Roberto, usada para reportes de más vendido por
  categoría (día/semana/mes).
- **Producto** — nombre, **Categoría**, unidad/presentación, costo (viene del FIFO por
  lotes, no es un campo fijo), **dos precios: precio normal (venta en La Cueva) y precio
  mayorista (venta en TuMejor Opción)**, estado. Búsqueda por nombre — sin código de
  barras.
- **Almacén** — nombre, tipo (**"venta"** → La Cueva, aplica precio normal | **"almacén/
  mayorista"** → TuMejor Opción, aplica precio mayorista). El tipo de almacén determina
  automáticamente qué precio se usa al vender, no se elige a mano.
- **Stock** — por combinación **Producto + Almacén**: cantidad actual y **stock mínimo
  propio de esa combinación** (no un mínimo general único por producto).
- **Lote de compra** (sostiene el costeo FIFO) — Producto, Almacén, cantidad, costo
  unitario, fecha de compra. Las ventas consumen primero el lote más viejo.
- **Transferencia** — almacén origen, almacén destino, líneas de productos con cantidad,
  fecha, estado. Prioridad de arranque (no opcional) por el movimiento real de mercancía
  entre La Cueva y TuMejor Opción.
- **Vale de salida** — producto, almacén, tipo (merma/donación/regalo/vencido), cantidad,
  fecha, estado. Uso frecuente confirmado — prioridad real, no opcional.
- **Venta** — caja/sesión, almacén, líneas de productos, precio aplicado (según tipo de
  almacén), total, fecha.
- **Usuario** — nombre, rol asignado (rol = plantilla de permisos con nombre libre, ver
  Sección 3.3).

### 3.6 Identidad visual — 🟢 BASE APROBADA (Sesión 5), 🟡 pendiente de profundizar
Roberto compartió 8 imágenes de referencia del juego **Hollow Knight: Silksong** como
dirección visual deseada para Battlecruiser (solo estilo de dibujo/arte — Battlecruiser
sigue siendo software de punto de venta, no un juego). Elementos del estilo tomados como
inspiración, en palabras propias (no se copian diseños de personajes ni arte con
derechos de autor de ese juego, solo el lenguaje visual general):
- Ilustración a mano tipo tinta/acuarela, líneas orgánicas y expresivas.
- Fondos atmosféricos y oscuros, con iluminación direccional suave (rayos de luz, faroles)
  y partículas/polvo en el aire para dar profundidad.
- Paleta de colores apagada y fría (azules, verdes musgo) combinada con acentos cálidos
  puntuales (ámbar, dorado, rojo) para elementos importantes.
- Composición cinematográfica, uso generoso de espacio negativo/silueta.

**Concepto base aprobado (Sesión 5) y ya aplicado al login real:**
- Gancho conceptual: el negocio se llama *La Cueva* — se usa un farol colgante como
  elemento de firma (glow real, no decorativo), reutilizado como indicador de conexión
  con el servidor.
- Paleta: `#0b111a` fondo, `#141d2b` paneles, `#d99a43` acento/farol, `#5f8c6b`
  éxito/musgo, `#b5453f` error/ámbar quemado, `#7d8ba0` texto secundario/niebla.
- Tipografía: Spectral (serif, títulos) + Inter (cuerpo/formularios) + IBM Plex Mono
  (números, precios, cantidades — alineación tabular real para datos de POS).
- Detalles atmosféricos sutiles: estalactitas en las esquinas superiores, partículas de
  polvo flotando (respeta `prefers-reduced-motion`).

**⚠️ Pendiente explícito (Sesión 5) — no perder esto:** Roberto quiere que, más adelante,
se profundice **mucho más** de lo aplicado hasta ahora — no solo paleta de colores y un
ícono de farol, sino que la app implique visualmente más las herramientas y el estilo de
dibujo real de las imágenes de referencia (ilustración a mano, texturas, atmósfera). Lo
de la Sesión 5 es una base aceptada para seguir trabajando, no la versión final de la
identidad visual. Retomar cuando Roberto lo pida explícitamente.

### 3.3 Roles y permisos — 🟢 ACTUALIZADO (Sesión 2, reemplaza roles fijos de V1.0)
Soluciones 360 usa roles fijos (admin/dueño/vendedor). **Para Battlecruiser se decidió
un modelo distinto y más flexible:**
- **Nombres de rol personalizables** — Roberto define el nombre de cada rol/plantilla
  (ej. "Cajera turno tarde"), no hay nombres fijos en el código.
- **Permisos granulares por sección Y por acción** — para cada sección del sistema
  (Productos, Ventas, Reportes, Gastos, etc.), el admin marca por separado: puede **ver
  / crear / editar / borrar**. No alcanza con un simple "ve la sección sí/no".
- Roberto como admin/dueño tiene control total para armar y asignar estas plantillas de
  permisos a cada persona.

---

## 4. CASOS DE PRUEBA SUGERIDOS
*(sin cambios respecto a V1.0 — agregar cuando se empiece a codear: caso de
Transferencias entre La Cueva y TuMejor Opción, dado que ahora es prioridad de arranque)*

---

## 5. ARQUITECTURA Y REGLAS DE DESARROLLO
### (heredadas de la experiencia real con CuevaCoin — ya probadas en producción)

*(Secciones 5.1, 5.3, 5.4, 5.5 sin cambios respecto a V1.0.)*

### 5.2 Arquitectura — 🟢 DECISIÓN TOMADA (Sesión 2)
- **PWA confirmada** (index.html + manifest.json + service-worker.js), empaquetada como
  `.apk` vía TWA para Android, usable directo en navegador/escritorio para PC.
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions + Realtime).
- **Hosting:** Cloudflare.
- **Regla dura sin cambios:** cualquier operación que mueva stock, dinero o dato sensible
  pasa por una Edge Function/RPC atómica del servidor, nunca por `.update()` directo del
  cliente.

---

## 6. CRITERIO DE ALCANCE / PRIORIZACIÓN — 🟢 DEFINIDO (Sesión 2)

**Escala real confirmada:** 2 puntos (La Cueva + almacén TuMejor Opción), 1 caja activa,
6+ vendedores, prioridad de costo cero para uso básico, expansión a más puntos probable
a futuro.

**Usar este criterio como filtro** antes de construir cualquier función: si "suena bien
pero no aplica a este tamaño" (ej. multi-caja simultánea con más de 1 punto de cobro,
antifraude nivel banco, testing automatizado formal), se anota como descartada/pospuesta
en la Sección 7, no se construye — igual que se hizo con CuevaCoin.

**Funciones confirmadas como prioridad real (no opcionales):**
- Multi-almacén básico + Transferencias (La Cueva ↔ TuMejor Opción) — necesario desde el
  arranque, no es función futura.
- Vales de salida (merma/donación/vencido) — uso frecuente confirmado, prioridad real.
- Costeo FIFO — mantenido, heredado de Soluciones 360.

**Funciones confirmadas como NO prioritarias para el arranque:**
- Impresión de tickets físicos (impresora térmica) — puede esperar.
- Migración de datos históricos de Soluciones 360 — decisión abierta, no urgente, Roberto
  puede cambiar de opinión más adelante.

---

## 7. BITÁCORA DE SESIONES (única fuente de verdad de lo que realmente se hizo)
### Instrucción: cada sesión nueva agrega una entrada acá abajo con fecha. No borrar entradas viejas. Comprimir cada 9 sesiones o antes si crece mucho.

**[2026-08-09] SESIÓN 1 — Creación del documento.**
- Se recibieron 30 capturas de pantalla del POS "Soluciones 360" y se generó la
  especificación funcional completa (Sección 3).
- Se recibió el documento maestro de memoria de CuevaCoin y se extrajeron reglas y
  patrones reutilizables (Secciones 5-6).
- Se bautizó el proyecto **Battlecruiser**.
- Se creó el documento único V1.0.
- Nada de código se escribió todavía.

**[2026-08-09] SESIÓN 2 — Definición de arranque (preguntas de direccionamiento).**
- Se confirmó plataforma técnica: **PWA** (gratis, un solo código PC+Android, mismo
  enfoque que CuevaCoin), tras comparar con nativo (Electron+Android) y Flutter.
- Se definió la escala real del negocio: **2 puntos** (La Cueva = venta, TuMejor Opción =
  almacén/mayorista), **1 caja** activa, **6+ vendedores**, más puntos probables a futuro.
  Esto elevó Transferencias entre almacenes a prioridad de arranque (no era evidente en
  V1.0, que asumía "un solo local por ahora").
- Se definió el modelo de roles: nombres personalizables + permisos granulares por
  sección y por acción (ver/crear/editar/borrar), reemplazando los roles fijos
  heredados de Soluciones 360.
- Se confirmó: mantiene costeo FIFO; vales de salida es función de uso frecuente/
  prioritaria; migración de datos históricos y impresión térmica quedan como no
  prioritarias para el arranque.
- Se definieron reglas de proceso del propio documento: comprimir bitácora cada 9
  sesiones o antes si crece mucho; entregar resumen corto (5-10 líneas) al final de
  cada sesión además de este documento.
- **Nada de código se escribió todavía.**

**[2026-08-09] SESIÓN 3 — Modelo de datos definitivo.**
- Se confirmó catálogo de productos único/compartido entre La Cueva y TuMejor Opción
  (mismo producto, stock distinto por almacén).
- Se confirmó que un producto tiene **dos precios** (normal y mayorista), y que el precio
  a aplicar se decide automáticamente **según el tipo de almacén** donde se vende (no se
  elige a mano en cada venta).
- Se confirmó: sin código de barras (búsqueda por nombre); stock mínimo por combinación
  producto+almacén (no uno general); categorías de productos desde el arranque (para
  reportes de más vendido por categoría).
- Se cerró el modelo de datos definitivo (Sección 3.4): Categoría, Producto, Almacén,
  Stock, Lote de compra, Transferencia, Vale de salida, Venta, Usuario.
- **Nada de código se escribió todavía.**

**[2026-08-09] SESIÓN 4 — Tanda 1 (base de datos) + referencia visual.**
- Se creó el proyecto real de Supabase (`battlecruiser`, plan gratuito $0/mes,
  organización de Roberto) — se liberó espacio pausando el proyecto duplicado
  "CuevaCoin Devin" que ocupaba uno de los 2 cupos gratis de la cuenta.
- Se crearon en Supabase las tablas base con RLS activado: `categorias`, `almacenes`,
  `productos`, `stock` (columnas según el modelo de datos definitivo de la Sección 3.4).
- Se cargaron los 2 almacenes reales: **La Cueva** (tipo "venta") y **TuMejor Opción**
  (tipo "mayorista").
- Se guardó la referencia visual deseada (Sección 3.6): estilo de dibujo inspirado en
  Hollow Knight: Silksong (ilustración a mano, atmósfera oscura, paleta apagada con
  acentos cálidos) — pendiente de traducir a paleta/UI concreta.
- **Falta probar en dispositivo real** (regla de la Sección 5.1: Integración → Pruebas →
  Intercambio) — lo de hoy es solo backend, todavía no hay nada para que Roberto pruebe
  en pantalla.

**[2026-08-09] SESIÓN 5 — Identidad visual base + decisión de despliegue.**
- Se probó Tanda 1 en dispositivo real (captura de pantalla de Roberto): login con
  Supabase Auth funcionando de verdad (entra con cuenta real, muestra "Bienvenido").
- Se diseñó y aprobó (como base, no versión final) la identidad visual descrita en la
  Sección 3.6, y se aplicó al `index.html`/`style.css`/`app.js` reales del proyecto.
- Se agregó un indicador de conexión real (no decorativo): el farol/status-line refleja
  el estado real de `navigator.onLine` del dispositivo.
- **Decisión de despliegue (superada en Sesión 7, ver abajo):** por ahora Roberto prueba
  localmente abriendo el `.html` directo, en vez de subir a Cloudflare Pages cada vez —
  más rápido para iterar. El despliegue a Cloudflare Pages se retoma cuando haya algo
  estable para uso diario o para que lo prueben los vendedores.
- Queda anotado en Sección 3.6 el pedido explícito de profundizar mucho más la parte
  visual en una sesión futura.

**[2026-08-09] SESIÓN 6 — Bug real de carga de CSS, corregido.**
- Roberto mandó captura del `.html` abierto directo desde el gestor de archivos del
  celular (URL tipo `content://media/external/file`, sin carpeta/servidor): se veía sin
  ningún estilo — tipografía por defecto del navegador, el ícono del farol enorme sin su
  tamaño fijado, y "Cerrar sesión" visible sin haber iniciado sesión.
- **Causa real:** el `style.css` externo no cargaba en ese modo de apertura (probable
  problema de tipo MIME al servir el archivo vía `content://`), mientras que el
  `app.js` sí lo hacía. Como todas las reglas que ocultan pantallas viven en el CSS, sin
  él se veían login y "Bienvenido" al mismo tiempo.
- **Corrección aplicada:** `index.html` ahora es autocontenido (CSS y JS inline, sin
  archivos externos propios) — más confiable para el flujo de prueba local que eligió
  Roberto (abrir el `.html` suelto en vez de subir a Cloudflare). Se agregó también
  `showLogin()` explícito al cargar la página (antes de esperar la respuesta de
  Supabase) para eliminar el parpadeo de ver ambas pantallas a la vez, y ancho/alto
  fijos en el SVG del farol como respaldo aunque el CSS fallara igual.
- `manifest.json` y `service-worker.js` se mantienen como archivos aparte — solo tienen
  efecto real en un despliegue con servidor (Cloudflare Pages), no en la prueba local.

**[2026-08-10] SESIÓN 7 — Código separado (V1.6) + cambio de estrategia de despliegue.**
- Roberto decidió pasar de "todo unido en un solo `.html`" (parche puntual de la Sesión
  6 para el modo de apertura directa desde el celular) a **código separado de verdad**
  (`index.html` + `style.css` + `app.js` como archivos aparte) — es la forma correcta de
  construir el proyecto a largo plazo a medida que crezca (Ventas, Reportes, etc.), y
  además permite que el navegador cachee CSS/JS por separado de la lógica de cada
  pantalla.
- **Cambio de decisión de despliegue:** de acá en más Roberto sube el proyecto a
  **Cloudflare Pages** para probarlo (en vez de abrir el `.html` suelto desde el gestor
  de archivos) — con servidor real, así el problema de MIME/carga de CSS que motivó el
  parche de la Sesión 6 no debería repetirse.
- Se separó `index.html` (V1.5, autocontenido) en `index.html` + `style.css` + `app.js`
  reales, manteniendo intacta toda la lógica y estilos ya probados (login/logout con
  Supabase Auth, `showLogin()` explícito, indicador de conexión real vía
  `navigator.onLine`). Se agregó un `<style>` inline mínimo de respaldo en el
  `<head>` (solo oculta `.app-shell`/`.card.hidden`/`.lantern-wrap.hidden` por defecto)
  para que, si `style.css` fallara en cargar en algún escenario, al menos no se vean
  login y "Bienvenido" superpuestos — no reemplaza el resto del diseño visual.
- `manifest.json` y `service-worker.js` no necesitaron cambios: el `service-worker.js`
  ya listaba `./style.css` y `./app.js` como archivos del shell desde antes.
- **Falta probar de verdad en Cloudflare Pages** (regla de la Sección 5.1: Integración →
  Pruebas → Intercambio) — lo de hoy es la separación de archivos, todavía no se
  confirmó el despliegue real.

**[2026-08-10] SESIÓN 8 — Roles y permisos granulares (SQL escrito, no corrido).**
- Se diseñaron 3 tablas nuevas: `roles` (nombre libre), `permisos` (matriz rol × sección ×
  acción: ver/crear/editar/borrar, secciones = productos/categorias/almacenes/stock/
  transferencias/vales_salida/ventas/reportes/usuarios), `usuarios` (1 a 1 con
  `auth.users`, con su rol asignado).
- Se creó la función `tiene_permiso(seccion, accion)` (security definer) que cualquier
  política RLS puede usar para chequear el permiso real del usuario logueado.
- Se armaron las políticas RLS reales por sección/acción para `categorias`, `almacenes`,
  `productos`, `stock`, reemplazando la política temporal `temp_authenticated_all`
  mencionada en pendientes de la Sesión 6-7. Se agregó también el rol inicial "Dueño"
  con todos los permisos, para asignárselo a Roberto (requiere que él reemplace su email
  real en el script antes de correrlo).
- Archivo: `sql/08_roles_y_permisos.sql`. **✅ Corrido y confirmado contra el proyecto
  real de Supabase** (se habilitó acceso en vivo más tarde en la misma jornada) — se
  verificó con una consulta que el usuario `robvg9@gmail.com` (cuenta creada para
  Roberto) quedó con el rol "Dueño" y todos los permisos. Además se endureció un detalle
  de seguridad que no estaba en el script original: se revocó el permiso `EXECUTE` de las
  funciones RPC (`registrar_compra`, `registrar_transferencia`, `registrar_vale_salida`,
  `tiene_permiso`) al rol `anon`, dejándolo solo para `authenticated` — por las dudas,
  aunque las funciones ya rechazaban internamente a quien no tuviera permiso.

**[2026-08-10] SESIÓN 9 — Productos + Almacenes (SQL y front-end escritos, no corridos).**
- Se agregó la tabla `lotes_compra` (sostiene el costeo FIFO ya definido en el modelo de
  datos) y la función `registrar_compra(...)` — RPC atómica que crea el lote y suma stock
  en una sola transacción, respetando la regla dura de la Sección 5 (nunca `.update()`
  directo del cliente sobre stock).
- Se agregó al `index.html`/`app.js`/`style.css` el panel principal post-login con
  navegación por pestañas y las pantallas reales de **Productos** (alta + listado con
  categoría y ambos precios) y **Almacenes** (alta + listado + vista de stock actual con
  aviso visual cuando está bajo el mínimo).
- Archivo: `sql/09_lotes_compra.sql`. **✅ Corrido y confirmado contra el proyecto real.**

**[2026-08-10] SESIÓN 10 — Transferencias (SQL y front-end escritos, no corridos).**
- Se agregaron las tablas `transferencias` y `transferencias_lineas`, y la función
  `registrar_transferencia(...)` — RPC atómica que valida stock suficiente en el origen,
  consume los lotes FIFO más viejos del origen, crea lotes espejo en el destino
  preservando el costo unitario real (no promedia costos), y mueve el stock en ambos
  almacenes en una sola transacción.
- Se agregó la pantalla de Transferencias (selección de origen/destino/producto/cantidad
  + historial de las últimas 20).
- Archivo: `sql/10_transferencias.sql`. **✅ Corrido y confirmado contra el proyecto real.**

**[2026-08-10] SESIÓN 11 — Vales de salida (SQL y front-end escritos, no corridos).**
- Se agregó la tabla `vales_salida` (tipo: merma/donación/regalo/vencido) y la función
  `registrar_vale_salida(...)` — RPC atómica que valida stock suficiente, consume lotes
  FIFO y descuenta el stock, igual que una venta.
- Se agregó la pantalla de Vales de salida (alta + historial de los últimos 20).
- Archivo: `sql/11_vales_salida.sql`. **✅ Corrido y confirmado contra el proyecto real.**
- Se empaquetó todo como `battlecruiser-v2_0.zip` (incluye carpeta `sql/` con los 4
  scripts en orden) y se actualizó este documento a V2.0.
- Se creó la cuenta de acceso de Roberto en Supabase Auth (`robvg9@gmail.com`, rol
  "Dueño") directamente por SQL, sin pasar por el formulario de registro de la app.

**[2026-08-10] SESIÓN 12 — Despliegue vía GitHub + Cloudflare Pages (logrado, con vueltas).**
- Roberto decidió pasar de subir el zip a mano en Cloudflare ("Upload assets", que ya
  funcionaba) a **desplegar automático conectando un repositorio de GitHub** — así cada
  actualización futura se sube una sola vez a GitHub y Cloudflare la despliega sola, sin
  entrar al dashboard de Cloudflare cada vez.
- Se creó el repo privado `Robvg9/battlecruiser` en GitHub y se instaló la app
  "Cloudflare Workers and Pages", limitada solo a ese repo (no a todos los repos de la
  cuenta).
- **Problema 1 — loop de autorización:** conectar GitHub desde Cloudflare en el celular
  entraba en bucle infinito entre la pantalla de permisos de GitHub y la de Cloudflare.
  Causa: la app de GitHub ya estaba instalada de una vuelta anterior, así que al
  reintentar te mandaba directo a "administrar instalación" en vez de completar el flujo.
  **Solución:** desinstalar la app "Cloudflare Workers and Pages" desde GitHub
  (Settings → Applications) y reconectar desde cero desde Cloudflare.
- **Problema 2 — error de build "Could not detect a directory containing static
  files":** Cloudflare unificó Pages dentro de "Workers", y ahora despliega con
  `npx wrangler deploy`, que necesita un archivo `wrangler.jsonc` en la raíz del repo
  diciéndole dónde están los archivos estáticos. Sin eso, no encuentra nada que
  desplegar aunque el repo tenga los archivos. **Solución:** se agregó
  `wrangler.jsonc` en la raíz con `{ "name": "battlecruiser", "compatibility_date":
  "2026-08-10", "assets": { "directory": "./" } }`. Este archivo se sube **una sola
  vez** — no cambia con las actualizaciones normales del proyecto.
- **Problema 3 — 404 después de un deploy "exitoso":** Roberto había subido el
  `battlecruiser-v2_0.zip` completo como un solo archivo al repo (no lo pudo
  descomprimir antes, porque desde el navegador del celular no se puede extraer un
  zip). Cloudflare desplegó "bien" en el sentido de que no dio error, pero el repo no
  tenía `index.html` real en la raíz, solo un `.zip` — de ahí el 404. **Solución:**
  borrar el `.zip` del repo, descomprimirlo en el celular con un gestor de archivos
  (Files by Google / ZArchiver), y subir los 5 archivos sueltos (`index.html`,
  `style.css`, `app.js`, `manifest.json`, `service-worker.js`) individualmente — la
  carpeta `sql/` del zip **no** se sube a GitHub, es solo para Supabase.
- Con eso resuelto, Roberto confirmó que la corrección quedó hecha (repo con los
  archivos sueltos + `wrangler.jsonc`). **Falta la confirmación final de que el sitio
  carga bien y el login funciona** después de este último ajuste — todavía no llegó
  captura de la página funcionando, solo la confirmación de que subió los archivos
  correctos.

**[2026-08-10] SESIÓN 13 — Cambiar contraseña + botón "Actualizar app" (código escrito, no confirmado en uso real).**
- **Confirmado por Roberto (probado de verdad):** el login carga bien y funciona en el
  sitio real desplegado — cierra el pendiente #1 de la Sesión 12.
- Roberto marcó dos faltantes del front-end: no había forma de cambiar la contraseña
  desde la app, y no había un botón para forzar traer la última versión subida a
  Cloudflare borrando caché vieja (esto último se lo había pedido a la IA de la sesión
  anterior y no había quedado hecho).
- Se agregó **"Cambiar contraseña"** en el header de la app (junto a "Cerrar sesión"):
  abre un panel con contraseña nueva + repetir, valida que coincidan y que tengan al
  menos 6 caracteres, y llama a `client.auth.updateUser({password})` de Supabase Auth
  (no pide la contraseña actual — así es como funciona ese método para un usuario ya
  logueado).
- Se agregó **"Actualizar app"** en el header: al tocarlo, borra todos los cachés del
  Service Worker (`caches.delete`), desregistra el Service Worker
  (`getRegistrations().unregister()`) y recarga la página — fuerza traer todo de red,
  sin esperar a que el stale-while-revalidate del `service-worker.js` se dé cuenta solo.
- Se subió el número de caché del Service Worker (`battlecruiser-shell-v1` →
  `battlecruiser-shell-v2`) porque cambió el shell (`index.html`/`app.js`/`style.css`).
- Se investigó si existe alguna forma de que Roberto no tenga que tocar manualmente el
  paso de subir archivos a GitHub para que se despliegue. **Resultado: no, todavía no.**
  No existe ningún conector de GitHub disponible para conectar en este chat (se buscó en
  el directorio de conectores y no aparece ninguno). El conector de Cloudflare que
  Roberto ya tiene conectado solo permite **leer** información de Workers (listar, ver
  detalle, ver código) — no tiene ninguna función para subir/desplegar código nuevo. Con
  las herramientas disponibles hoy, el paso manual de "Upload files" en GitHub sigue
  siendo necesario; una vez subido ahí, el despliegue a Cloudflare sí sigue siendo
  automático (eso ya estaba resuelto desde la Sesión 12). Queda anotado para revisar de
  nuevo más adelante si aparece un conector de GitHub en el directorio.
- Archivos entregados: `index.html`, `style.css`, `app.js`, `service-worker.js`
  (contenido completo para copiar y pegar, no `.zip`) — versión de la app subida a
  **v2.1** (footnote del login) para mantener sincronía con este documento.
- **Falta que Roberto confirme en uso real** que ambos botones funcionan bien después de
  subirlos a GitHub — regla de oro de la Sección 0.2.

**[2026-08-10] SESIÓN 14 — Bug de contraseña (causa raíz encontrada y corregida) + 6 mejoras chicas al front-end (código escrito, no confirmado en uso real).**
- **Reporte de Roberto:** cambió la contraseña desde el botón nuevo de la Sesión 13, y no
  quedó cambiada de verdad (siguió pidiendo o aceptando la vieja).
- **Causa raíz encontrada (no es un bug del botón en sí):** el `service-worker.js` servía
  el shell (`index.html`/`style.css`/`app.js`) con estrategia "stale-while-revalidate" —
  es decir, devolvía SIEMPRE lo que ya estaba en caché primero, y recién actualizaba el
  caché en segundo plano para la próxima carga. Resultado: cada vez que se sube una
  versión nueva a GitHub/Cloudflare, la primera apertura de la app después de eso todavía
  mostraba/ejecutaba la versión vieja — y en el peor caso, una mezcla desincronizada (un
  `index.html` nuevo cargado junto a un `app.js` viejo, o al revés). Como todo el `app.js`
  era un solo script sin aislar sus partes, un solo `document.getElementById(...)` que
  apuntara a un elemento que no existía en esa combinación desincronizada **cortaba la
  ejecución de todo el resto del archivo** — pudiendo dejar sin funcionar código que no
  tenía nada que ver con el error real (el mismo patrón del bug "Cannot read properties of
  null" ya visto antes en CuevaCoin).
- **Corrección aplicada:**
  1. `service-worker.js`: el shell pasa de "stale-while-revalidate" a **"network-first"**
     (intenta la red primero con timeout corto, usa caché solo si no hay conexión real) —
     ya no puede quedar una combinación vieja/nueva desincronizada. Caché subido a
     `battlecruiser-shell-v3`.
  2. `app.js`: cada bloque de inicialización (login, logout, actualizar app, cambiar
     contraseña, tabs, cada uno de los 5 formularios, carga inicial de cada pantalla) se
     aisló con una función `safeInit()` (try/catch) — si un elemento falta o algo falla en
     un bloque, se avisa por consola y los demás bloques se inician igual, en vez de que
     todo el script se corte en la primera línea que falle.
  3. El flujo de cambiar contraseña ahora chequea que haya sesión activa antes de intentar
     (mensaje claro si no la hay) y deja rastro en consola (éxito/error) para depurar más
     fácil la próxima vez que algo así se reporte.
- **6 mejoras chicas agregadas al mismo tiempo (pedido explícito de Roberto: "las seis
  cosas más rápidas y pequeñas"), todas en Productos/Almacenes/Transferencias/Vales:**
  1. Los 5 formularios de datos deshabilitan su botón mientras la operación está en curso
     (ya existía en login/contraseña, faltaba acá) — evita duplicados por doble clic o
     conexión lenta.
  2. Validación de que cantidad/costo/precio sean mayores a 0 antes de enviar (`min="0.01"`
     en los inputs + chequeo en JS) — evita registros con 0 o negativos que romperían el
     costeo FIFO o el stock.
  3. Montos y cantidades formateados siempre con 2 decimales (`$12.50` en vez de `$12.5`).
  4. Mensaje "Todavía no hay X" en cada lista (productos, almacenes, stock, transferencias,
     vales) cuando está vacía, en vez de verse en blanco sin explicación.
  5. Indicador "Cargando…" en cada lista mientras se traen los datos por primera vez.
  6. Confirmación (`¿Seguro?`) antes de registrar una Transferencia o un Vale de salida,
     ya que ambas mueven stock real y no tienen forma de deshacerse desde la app.
- Archivos entregados: `index.html`, `style.css`, `app.js`, `service-worker.js`
  (contenido completo, no `.zip`) — versión subida a **v2.2**, documento actualizado a la
  par. `wrangler.jsonc` no cambió, no hace falta volver a subirlo.
- **Falta que Roberto confirme en uso real:** (a) que cambiar la contraseña ahora sí
  funciona de punta a punta (cambiarla, cerrar sesión, entrar con la nueva), (b) que ya no
  hace falta tocar "Actualizar app" a mano para ver una versión recién subida, (c) las 6
  mejoras chicas en las 4 pantallas.

### Resumen corto de la Sesión 14 (para leer rápido):
- Causa raíz del bug de contraseña: el service worker servía versiones viejas/mezcladas
  del sitio por su estrategia de caché — corregido a "network-first" para el shell.
- Se blindó `app.js` para que un elemento faltante en una parte no corte el resto del
  script (mismo patrón de bug que ya se vio en CuevaCoin).
- Se agregaron 6 mejoras chicas: botones deshabilitados durante envío, validación de
  cantidades/precios > 0, montos con 2 decimales, mensajes de "vacío", "Cargando…", y
  confirmación antes de mover stock (transferencias/vales).
- Entregado como código completo (no zip), versión v2.2, documento actualizado a la par.
- Pendiente: que Roberto confirme en uso real que la contraseña ya cambia de verdad y
  las 6 mejoras chicas.

### Resumen corto de la Sesión 13 (para leer rápido):
- Confirmado: el login del sitio desplegado funciona de verdad.
- Agregado (código listo, falta que Roberto lo pruebe subido): botón para cambiar
  contraseña y botón para forzar actualización de la app borrando caché vieja.
- Investigado: no hay forma de automatizar el paso de subir a GitHub con las
  herramientas disponibles hoy (no hay conector de GitHub; el de Cloudflare es de
  solo lectura). El resto del despliegue (Cloudflare tomando lo que hay en GitHub)
  ya era automático desde antes.
- Entregado como código para copiar/pegar (no zip), versión v2.1, documento
  actualizado a la par.

### Pendiente para la próxima sesión (prioridad, en orden):
1. **Confirmar en uso real** que el cambio de contraseña de la Sesión 14 ya funciona de
   punta a punta (cambiarla, cerrar sesión, entrar con la nueva) — regla de oro Sección
   0.2. Si Roberto sube los 4 archivos y el problema sigue, revisar consola del navegador
   (ahora deja rastro de errores) antes de asumir cualquier otra causa.
2. **Confirmar en uso real** el botón "Actualizar app" de la Sesión 13 y las 6 mejoras
   chicas de la Sesión 14 (botones deshabilitados, validaciones, formato de montos,
   mensajes de vacío, "Cargando…", confirmaciones antes de mover stock).
3. **Probar de verdad en pantalla** cada pantalla nueva (Productos, Almacenes,
   Transferencias, Vales de salida) — regla de oro de la Sección 0.2: nada de esto se
   anota como "hecho" hasta que Roberto lo pruebe y lo confirme con captura o descripción
   real. El back-end (SQL) ya está confirmado corriendo; falta el front-end en uso real.
4. Retomar la identidad visual en profundidad cuando Roberto lo pida (Sección 3.6) — el
   panel principal nuevo usa la misma paleta pero es visualmente básico (tablas/listas
   simples), no se le dio pulido de diseño todavía.
5. Pantalla de Ventas (aún no construida) y flujo de reportes.
6. Para próximas actualizaciones del proyecto: recordarle a Roberto en cada entrega que
   solo sube a GitHub los archivos que cambiaron (no vuelve a tocar `wrangler.jsonc` ni
   sube la carpeta `sql/`), y que si en algún momento tiene la laptop con internet
   estable, el resto del flujo de Git es idéntico pero sin los problemas de navegador
   móvil que aparecieron hoy.
