# BATTLECRUISER — ADDENDUM 2026-08-16

## ESTADO REAL DE SUPABASE — CERRADO B4/B5/B7/B8

Proyecto: `papxnkkjtkxsitcsvcme`

### Cambios aplicados realmente en producción

- B3/B6: ya estaban blindados antes de esta tanda.
- B4: `auditoria_operaciones` + `registrar_auditoria` + `listar_auditoria_admin`.
- B5: reportes ejecutivos, ventas, transferencias, vales, stock y movimiento de inventario.
- B7: turnos, cuadres, responsabilidades e incidencias + RPC operativos y de lectura.
- B8: conversaciones, participantes y mensajes + RPC de comunicación.

### Correcciones importantes realizadas durante la aplicación

1. Se ampliaron las secciones de permisos para incluir `auditoria`, `turnos` y `comunicacion`.
2. Se añadió `turnos.editar_any`, necesario por el modelo administrativo de B7.
3. Las nuevas RPC operativas requieren sesión autenticada y las RPC de escritura no quedan ejecutables por `anon`.
4. `registrar_auditoria` dejó de ser un endpoint público y exige sesión cuando se invoca directamente.
5. B7 calcula el dinero esperado usando `ventas.creado_por = turno.usuario_id` además del período y almacén. No se usa el total de ventas de todo el almacén para un trabajador.
6. Las operaciones de escritura B7 requieren `idempotency_key` y usan `private.reclamar_idempotencia`.
7. `enviar_mensaje` y `crear_conversacion` B8 requieren `idempotency_key`; `mensajes.idempotency_key` tiene UNIQUE parcial.
8. El helper interno B8 `_es_participante` no queda expuesto como RPC público.
9. RLS quedó habilitado en las 8 tablas nuevas.
10. Las tablas nuevas no tienen escritura directa desde el cliente; la escritura se realiza mediante RPC SECURITY DEFINER.

### Migraciones reales creadas en Supabase

- `b4_b5_auditoria_reportes_y_permisos`
- `b7_operacion_humana_corregida`
- `b8_comunicacion_corregida`

Estas son las migraciones que representan el estado aplicado real. Los SQL originales B4/B5/B7/B8 del repositorio deben considerarse especificaciones históricas; las correcciones de producción de este addendum tienen prioridad para futuras sesiones.

### Verificación posterior

- Tablas nuevas confirmadas: `auditoria_operaciones`, `turnos`, `cuadres`, `responsabilidades`, `incidencias`, `conversaciones`, `participantes_conversacion`, `mensajes`.
- RPC de B5/B7/B8 confirmadas por introspección en `pg_proc`.
- RLS confirmado activo en las 8 tablas nuevas.
- `contar_no_leidos_global()` sin sesión devuelve `0`.
- Los reportes requieren permiso `reportes.ver`.
- `Dueño` tiene permisos para `auditoria`, `turnos`, `comunicacion` y `turnos.editar_any`.
- Las migraciones aparecen registradas en `supabase_migrations.schema_migrations`.

## LIMITACIONES QUE SIGUEN ABIERTAS

- No se ha hecho todavía una prueba real multiusuario con cuentas operativas separadas.
- No se ha probado concurrencia real de ventas/turnos en producción.
- No se ha probado una venta/turno/cuadre real de extremo a extremo en navegador después de aplicar B7/B8.
- B5 sigue documentando correctamente que no existe historial independiente de compras ni una tabla histórica adicional de costos; no se inventa margen.
- Realtime para `visto/escribiendo` se mantiene fuera de esta fase, tal como decidió Roberto.

## PRÓXIMO PASO

No seguir agregando tablas por inercia.

Primero: auditoría de compatibilidad **frontend ↔ RPC B7/B8**, después prueba real controlada de los flujos, y solo entonces nuevas funciones.

Regla: código versionado ≠ SQL aplicado ≠ despliegue ≠ prueba real. Los cuatro estados deben quedar confirmados por separado.
