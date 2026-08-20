// ==== Battlecruiser · js/operacion-humana.js ====
// B7 — Operación humana: turnos, cuadres, responsabilidades e incidencias.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- B7 — OPERACIÓN HUMANA: TURNOS + CUADRES + RESPONSABILIDADES + INCIDENCIAS
let _turnoActual = null; // turno abierto del usuario (cache en memoria)

// ---- B7: turno actual del usuario ----
// Consulta turno_actual_usuario (RPC B7). Si hay turno abierto, muestra
// la tarjeta con estado/hora/apertura y el botón de cerrar. Si no, botón abrir.
async function refrescarTurnoActual() {
  const el = document.getElementById("turno-actual");
  const btnAbrir = document.getElementById("btn-abrir-turno");
  const btnCerrar = document.getElementById("btn-cerrar-turno");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver turnos.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — el turno se cargará al reconectar.</p>';
    return;
  }
  try {
    const { data, error } = await client.rpc("turno_actual_usuario", {});
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    _turnoActual = data;
    renderTurnoActual(data);
    if (btnAbrir) btnAbrir.classList.toggle("hidden", !!(data && data.estado === "ABIERTO"));
    if (btnCerrar) btnCerrar.classList.toggle("hidden", !(data && data.estado === "ABIERTO"));
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar el turno actual.</p>';
    console.warn("[Battlecruiser] turno_actual_usuario:", e);
  }
}

function renderTurnoActual(t) {
  const el = document.getElementById("turno-actual");
  if (!el) return;
  if (!t) {
    el.innerHTML = '<p class="lista-estado">No tenés turno abierto. Abrí uno para empezar a registrar operaciones.</p>';
    return;
  }
  const apertura = t.apertura_real ? fechaHora(t.apertura_real) : "—";
  let cuadreHtml = "";
  if (t.cuadre) {
    const c = t.cuadre;
    cuadreHtml = '<div class="muted">Cuadre: $' + money(c.dinero_esperado || 0) + " esperado · estado " + escHtml(c.estado || "—") + "</div>";
  }
  el.innerHTML = '<div class="turno-card-info"><span class="cc-asunto-tipo">Turno ' + escHtml(t.estado || "—") + '</span><span class="muted">Apertura: ' + apertura + " · " + escHtml(t.usuario_nombre || "—") + "</span>" + cuadreHtml + "</div>";
}

// ---- B7: abrir turno ----
// Pasa por ejecutarOperacion (cola offline + idempotencia). El backend
// valida usuario activo, permiso y doble apertura.
async function abrirTurno() {
  const almacenSel = document.getElementById("turno-filtro-almacen");
  const almacen_id = almacenSel ? (almacenSel.value || null) : null;
  const r = await ejecutarOperacion("turno", {
    p_almacen_id: almacen_id,
  });
  const msg = document.getElementById("msg-turno");
  if (!r.ok) {
    if (msg) setMsg("msg-turno", "No se pudo abrir el turno: " + explicarError(r.error, "abrir turno"), false);
    return;
  }
  if (r.offline) {
    if (msg) setMsg("msg-turno", "✓ Turno guardado localmente — se sincronizará al recuperar conexión.", true);
  } else {
    if (msg) setMsg("msg-turno", "✓ Turno abierto.", true);
  }
  await refrescarTurnoActual();
}

// ---- B7: cerrar turno ----
async function cerrarTurno() {
  if (!_turnoActual || _turnoActual.estado !== "ABIERTO") {
    setMsg("msg-turno", "No hay turno abierto para cerrar.", false);
    return;
  }
  // Detectar operaciones pendientes (cola offline) antes de cerrar.
  const ops = await obtenerOperacionesPorEstado("PENDIENTE");
  const atencion = await obtenerOperacionesPorEstado("REQUIERE_ATENCION");
  let aviso = "";
  if (ops.length > 0) aviso += " Tenés " + ops.length + " operación(es) pendiente(s) de sincronizar.";
  if (atencion.length > 0) aviso += " Tenés " + atencion.length + " operación(es) que requieren atención.";
  const r = await ejecutarOperacion("turno_cerrar", {
    p_turno_id: _turnoActual.id,
  });
  if (!r.ok) {
    setMsg("msg-turno", "No se pudo cerrar el turno: " + explicarError(r.error, "cerrar turno"), false);
    return;
  }
  if (r.offline) {
    setMsg("msg-turno", "✓ Cierre guardado localmente — se sincronizará al recuperar conexión." + aviso, true);
  } else {
    setMsg("msg-turno", "✓ Turno cerrado." + aviso, true);
  }
  await refrescarTurnoActual();
  await refrescarListaTurnos();
}

// ---- B7: lista de turnos (historial) ----
async function refrescarListaTurnos() {
  const el = document.getElementById("lista-turnos");
  const cuadresEl = document.getElementById("lista-cuadres");
  if (!el || !appShell || !appShell.classList.contains("visible")) return;
  if (!tienePermiso("turnos", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver turnos.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — historial de turnos no disponible.</p>';
    return;
  }
  setLoading("lista-turnos", "Cargando turnos…");
  const estadoSel = document.getElementById("turno-filtro-estado");
  const estado = estadoSel ? (estadoSel.value || null) : null;
  try {
    const { data, error } = await client.rpc("listar_turnos", {
      p_estado: estado, p_limite: 50, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderTurnos(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar turnos.</p>';
  }
  // Cargar cuadres también.
  if (cuadresEl) await refrescarListaCuadres();
}

function renderTurnos(filas) {
  const el = document.getElementById("lista-turnos");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin turnos registrados.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((t) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (t.estado || "").toLowerCase();
    const apertura = t.apertura_real ? fechaHora(t.apertura_real) : "—";
    const cierre = t.cierre_real ? fechaHora(t.cierre_real) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(t.estado || "—") + '</span><span class="muted">' + escHtml(t.usuario_nombre || "—") + " · " + (t.fecha || "—") + " · abre " + apertura + " · cierra " + cierre + "</span></span>";
    el.appendChild(div);
  });
}

// ---- B7: lista de cuadres ----
async function refrescarListaCuadres() {
  const el = document.getElementById("lista-cuadres");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) { el.innerHTML = ""; return; }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión.</p>';
    return;
  }
  try {
    const { data, error } = await client.rpc("listar_cuadres", { p_limite: 20, p_offset: 0 });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Cuadres no disponibles (falta aplicar SQL B7).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderCuadres(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar cuadres.</p>';
  }
}

function renderCuadres(filas) {
  const el = document.getElementById("lista-cuadres");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin cuadres registrados.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (c.estado || "").toLowerCase();
    const dif = Number(c.diferencia || 0);
    const difTxt = dif === 0 ? "exacto" : (dif < 0 ? "faltante $" + money(Math.abs(dif)) : "sobrante $" + money(dif));
    let acciones = "";
    if (c.estado === "PENDIENTE" && tienePermiso("turnos", "crear")) {
      acciones = '<button type="button" class="cc-accion cuadre-declarar-btn" data-id="' + c.id + '" data-esperado="' + c.dinero_esperado + '">Declarar</button>';
    }
    if ((c.estado === "CON_DIFERENCIA" || c.estado === "EN_REVISION") && tienePermiso("turnos", "editar_any")) {
      acciones += '<button type="button" class="cc-accion cuadre-revisar-btn" data-id="' + c.id + '">Revisar</button>';
    }
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(c.estado || "—") + '</span><span class="muted">Esperado $' + money(c.dinero_esperado || 0) + " · Declarado $" + money(c.dinero_declarado || 0) + " · " + difTxt + "</span>" + acciones + "</span>";
    if (c.comentario_revision) {
      div.innerHTML += '<div class="muted">Revisión: ' + escHtml(c.comentario_revision) + "</div>";
    }
    el.appendChild(div);
  });
}

// ---- B7: declarar cuadre (modal simple via prompt) ----
async function declararCuadre(cuadre_id, esperado) {
  const input = prompt("Dinero a declarar (esperado: $" + money(esperado) + "):", String(esperado));
  if (input === null) return;
  const declarado = parseFloat(input);
  if (!Number.isFinite(declarado) || declarado < 0) {
    setMsg("msg-cuadre", "El monto declarado no es válido.", false);
    return;
  }
  const r = await ejecutarOperacion("cuadre", {
    p_cuadre_id: cuadre_id, p_dinero_declarado: declarado,
  });
  if (!r.ok) {
    setMsg("msg-cuadre", "No se pudo declarar el cuadre: " + explicarError(r.error, "declarar cuadre"), false);
    return;
  }
  setMsg("msg-cuadre", "✓ Cuadre declarado.", true);
  await refrescarListaCuadres();
}

// ---- B7: revisar cuadre (aprobar/rechazar) ----
async function revisarCuadre(cuadre_id) {
  const decision = confirm("¿Aprobar el cuadre? (Cancelar = rechazar)");
  const comentario = prompt("Comentario de revisión:", "");
  const r = await ejecutarOperacion("cuadre_revisar", {
    p_cuadre_id: cuadre_id, p_decision: decision ? "aprobar" : "rechazar",
    p_comentario: comentario || null,
  });
  if (!r.ok) {
    setMsg("msg-cuadre", "No se pudo revisar: " + explicarError(r.error, "revisar cuadre"), false);
    return;
  }
  setMsg("msg-cuadre", "✓ Cuadre " + (decision ? "aprobado" : "rechazado") + ".", true);
  await refrescarListaCuadres();
}

// ---- B7: orquestador de la pestaña Turnos ----
async function refrescarTurnos() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const conn = document.getElementById("turnos-conn-info");
  if (conn) conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión" : "🟢 Conectado";
  // Poblar select de almacenes con _cache.
  const sel = document.getElementById("turno-filtro-almacen");
  poblarSelectAlmacenes(sel);
  await refrescarTurnoActual();
  await refrescarListaTurnos();
}

// ---- B7: responsabilidades ----
async function refrescarListaResponsabilidades() {
  const el = document.getElementById("lista-responsabilidades");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) { el.innerHTML = ""; return; }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión.</p>';
    return;
  }
  setLoading("lista-responsabilidades", "Cargando responsabilidades…");
  const estadoSel = document.getElementById("resp-filtro-estado");
  const estado = estadoSel ? (estadoSel.value || null) : null;
  try {
    const { data, error } = await client.rpc("listar_responsabilidades", {
      p_estado: estado, p_limite: 50, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderResponsabilidades(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar responsabilidades.</p>';
  }
}

function renderResponsabilidades(filas) {
  const el = document.getElementById("lista-responsabilidades");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin responsabilidades.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((r) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (r.estado || "").toLowerCase();
    let acciones = "";
    if (r.estado !== "COMPLETADA" && r.estado !== "CANCELADA") {
      if (tienePermiso("turnos", "crear")) {
        acciones += '<button type="button" class="cc-accion resp-estado-btn" data-id="' + r.id + '" data-estado="COMPLETADA">Completar</button>';
        acciones += '<button type="button" class="cc-accion resp-estado-btn" data-id="' + r.id + '" data-estado="EN_PROGRESO">En progreso</button>';
      }
      if (tienePermiso("turnos", "editar_any")) {
        acciones += '<button type="button" class="cc-accion resp-estado-btn" data-id="' + r.id + '" data-estado="CANCELADA">Cancelar</button>';
      }
    }
    const limite = r.fecha_limite ? new Date(r.fecha_limite).toLocaleDateString("es", { day: "2-digit", month: "2-digit" }) : "";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(r.titulo) + '</span><span class="muted">' + escHtml(r.estado || "—") + " · " + escHtml(r.prioridad || "normal") + (limite ? " · límite " + limite : "") + "</span>" + acciones + "</span>";
    if (r.descripcion) div.innerHTML += '<div class="muted">' + escHtml(r.descripcion) + "</div>";
    if (r.observacion_final) div.innerHTML += '<div class="muted">Obs: ' + escHtml(r.observacion_final) + "</div>";
    el.appendChild(div);
  });
}

async function crearResponsabilidad(titulo, descripcion, prioridad) {
  const r = await ejecutarOperacion("responsabilidad", {
    p_titulo: titulo, p_descripcion: descripcion || null, p_prioridad: prioridad || "normal",
  });
  if (!r.ok) {
    setMsg("msg-resp-crear", "No se pudo crear: " + explicarError(r.error, "crear responsabilidad"), false);
    return false;
  }
  setMsg("msg-resp-crear", r.offline ? "✓ Guardada localmente — se sincronizará." : "✓ Responsabilidad creada.", true);
  await refrescarListaResponsabilidades();
  return true;
}

async function actualizarResponsabilidad(id, estado) {
  const r = await ejecutarOperacion("responsabilidad_actualizar", {
    p_responsabilidad_id: id, p_estado: estado,
  });
  if (!r.ok) {
    setMsg("msg-resp-crear", "No se pudo actualizar: " + explicarError(r.error, "actualizar responsabilidad"), false);
    return;
  }
  setMsg("msg-resp-crear", "✓ Responsabilidad actualizada.", true);
  await refrescarListaResponsabilidades();
}

// ---- B7: incidencias ----
async function refrescarListaIncidencias() {
  const el = document.getElementById("lista-incidencias");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) { el.innerHTML = ""; return; }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión.</p>';
    return;
  }
  setLoading("lista-incidencias", "Cargando incidencias…");
  try {
    const { data, error } = await client.rpc("listar_incidencias", { p_limite: 30, p_offset: 0 });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderIncidencias(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar incidencias.</p>';
  }
}

function renderIncidencias(filas) {
  const el = document.getElementById("lista-incidencias");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin incidencias.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((i) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (i.estado || "").toLowerCase();
    let acciones = "";
    if (i.estado === "ABIERTA" && tienePermiso("turnos", "editar_any")) {
      acciones = '<button type="button" class="cc-accion inc-resolver-btn" data-id="' + i.id + '">Resolver</button>';
    }
    const fecha = i.creado_en ? fechaHora(i.creado_en) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(i.tipo || "—") + '</span><span class="muted">' + escHtml(i.descripcion) + " · " + escHtml(i.estado || "—") + " · " + escHtml(i.usuario_nombre || "—") + " · " + fecha + "</span>" + acciones + "</span>";
    if (i.resolucion) div.innerHTML += '<div class="muted">Resolución: ' + escHtml(i.resolucion) + "</div>";
    el.appendChild(div);
  });
}

async function crearIncidencia(tipo, descripcion) {
  const r = await ejecutarOperacion("incidencia", {
    p_tipo: tipo, p_descripcion: descripcion,
  });
  if (!r.ok) {
    setMsg("msg-inc-crear", "No se pudo reportar: " + explicarError(r.error, "reportar incidencia"), false);
    return false;
  }
  setMsg("msg-inc-crear", r.offline ? "✓ Reportada localmente — se sincronizará." : "✓ Incidencia reportada.", true);
  await refrescarListaIncidencias();
  return true;
}

async function resolverIncidencia(id) {
  const resolucion = prompt("¿Cómo se resolvió la incidencia?", "");
  if (!resolucion) return;
  const r = await ejecutarOperacion("incidencia_resolver", {
    p_incidencia_id: id, p_resolucion: resolucion,
  });
  if (!r.ok) {
    setMsg("msg-inc-crear", "No se pudo resolver: " + explicarError(r.error, "resolver incidencia"), false);
    return;
  }
  setMsg("msg-inc-crear", "✓ Incidencia resuelta.", true);
  await refrescarListaIncidencias();
}

// ---- B7: orquestador de la pestaña Operación ----
async function refrescarOperacion() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const conn = document.getElementById("operacion-conn-info");
  if (conn) conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión" : "🟢 Conectado";
  await refrescarListaResponsabilidades();
  await refrescarListaIncidencias();
}

// ---- B7: alertas para el Centro de Mando ----
// Deriva alertas reales de turnos/cuadres/responsabilidades/incidencias.
// No inventa: si los RPC no existen o no hay conexión, no agrega alertas.
let _b7CacheAlertas = { turnosAbiertos: 0, cuadresPendientes: 0, cuadresDiferencia: 0, respPendientes: 0, incAbiertas: 0 };

async function refrescarAlertasB7() {
  if (!navigator.onLine || !tienePermiso("turnos", "ver")) return;
  try {
    // Turnos abiertos.
    const { data: turnos } = await client.rpc("listar_turnos", { p_estado: "ABIERTO", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.turnosAbiertos = (turnos || []).length;
    // Cuadres pendientes / con diferencia.
    const { data: cuadresP } = await client.rpc("listar_cuadres", { p_estado: "PENDIENTE", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.cuadresPendientes = (cuadresP || []).length;
    const { data: cuadresD } = await client.rpc("listar_cuadres", { p_estado: "CON_DIFERENCIA", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.cuadresDiferencia = (cuadresD || []).length;
    // Responsabilidades pendientes.
    const { data: resp } = await client.rpc("listar_responsabilidades", { p_estado: "PENDIENTE", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.respPendientes = (resp || []).length;
    // Incidencias abiertas.
    const { data: inc } = await client.rpc("listar_incidencias", { p_estado: "ABIERTA", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.incAbiertas = (inc || []).length;
  } catch (e) {
    // Si los RPC no existen o fallan, no agregar alertas (no inventar).
  }
}

function construirAlertasB7() {
  const a = [];
  if (_b7CacheAlertas.cuadresDiferencia > 0) {
    a.push({ nivel: "critico", tipo: "Cuadre con diferencia", texto: _b7CacheAlertas.cuadresDiferencia + " cuadre(s) con diferencia requieren revisión.", op: null });
  }
  if (_b7CacheAlertas.incAbiertas > 0) {
    a.push({ nivel: "critico", tipo: "Incidencias abiertas", texto: _b7CacheAlertas.incAbiertas + " incidencia(s) abierta(s).", op: null });
  }
  if (_b7CacheAlertas.cuadresPendientes > 0) {
    a.push({ nivel: "atencion", tipo: "Cuadres pendientes", texto: _b7CacheAlertas.cuadresPendientes + " cuadre(s) pendiente(s) de declarar.", op: null });
  }
  if (_b7CacheAlertas.respPendientes > 0) {
    a.push({ nivel: "atencion", tipo: "Responsabilidades pendientes", texto: _b7CacheAlertas.respPendientes + " responsabilidad(es) pendiente(s).", op: null });
  }
  if (_b7CacheAlertas.turnosAbiertos > 0) {
    a.push({ nivel: "normal", tipo: "Turnos abiertos", texto: _b7CacheAlertas.turnosAbiertos + " turno(s) abierto(s).", op: null });
  }
  return a;
}

// Hook: integrar las alertas B7 en el Centro de Mando.
function construirAlertasMandoB7Completo(ops) {
  const base = (typeof construirAlertasMandoCompleto === "function") ? construirAlertasMandoCompleto(ops) : [];
  return base.concat(construirAlertasB7()).sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] != null ? orden[a.nivel] : 3) - (orden[b.nivel] != null ? orden[b.nivel] : 3);
  });
}

// Inicialización de las pestañas Turnos y Operación.
safeInit("b7-turnos", () => {
  const btnAbrir = document.getElementById("btn-abrir-turno");
  const btnCerrar = document.getElementById("btn-cerrar-turno");
  const refrescar = document.getElementById("turnos-refrescar-btn");
  if (btnAbrir) btnAbrir.addEventListener("click", abrirTurno);
  if (btnCerrar) btnCerrar.addEventListener("click", cerrarTurno);
  if (refrescar) refrescar.addEventListener("click", () => refrescarListaTurnos());
  // Filtro de estado.
  const estadoSel = document.getElementById("turno-filtro-estado");
  if (estadoSel) estadoSel.addEventListener("change", () => refrescarListaTurnos());
  // Delegación de clicks en cuadres.
  const cuadresEl = document.getElementById("lista-cuadres");
  if (cuadresEl) {
    cuadresEl.addEventListener("click", (e) => {
      const declBtn = e.target.closest(".cuadre-declarar-btn");
      const revBtn = e.target.closest(".cuadre-revisar-btn");
      if (declBtn) declararCuadre(declBtn.dataset.id, parseFloat(declBtn.dataset.esperado));
      if (revBtn) revisarCuadre(revBtn.dataset.id);
    });
  }
});

safeInit("b7-operacion", () => {
  const formResp = document.getElementById("form-responsabilidad");
  if (formResp) {
    formResp.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = document.getElementById("resp-titulo").value.trim();
      const desc = document.getElementById("resp-desc").value.trim();
      const prioridad = document.getElementById("resp-prioridad").value;
      if (!titulo) return;
      const ok = await crearResponsabilidad(titulo, desc, prioridad);
      if (ok) formResp.reset();
    });
  }
  const formInc = document.getElementById("form-incidencia");
  if (formInc) {
    formInc.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tipo = document.getElementById("inc-tipo").value;
      const desc = document.getElementById("inc-desc").value.trim();
      if (!desc) return;
      const ok = await crearIncidencia(tipo, desc);
      if (ok) formInc.reset();
    });
  }
  // Filtro de responsabilidades.
  const respFiltro = document.getElementById("resp-filtro-estado");
  if (respFiltro) respFiltro.addEventListener("change", () => refrescarListaResponsabilidades());
  // Delegación de clicks en responsabilidades e incidencias.
  const respEl = document.getElementById("lista-responsabilidades");
  if (respEl) {
    respEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".resp-estado-btn");
      if (btn) actualizarResponsabilidad(btn.dataset.id, btn.dataset.estado);
    });
  }
  const incEl = document.getElementById("lista-incidencias");
  if (incEl) {
    incEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".inc-resolver-btn");
      if (btn) resolverIncidencia(btn.dataset.id);
    });
  }
});

