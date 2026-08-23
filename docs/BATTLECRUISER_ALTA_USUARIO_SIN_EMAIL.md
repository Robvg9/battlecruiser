# Alta de usuarios sin correo — contrato

**App:** v9.2.46  
**Edge Function:** `crear-usuario-sin-email`  
**Proyecto:** papxnkkjtkxsitcsvcme

## Contrato

`POST /functions/v1/crear-usuario-sin-email`  
Headers: `Authorization: Bearer <JWT admin>`, `apikey`

```json
{ "nombre": "dependienta1", "password": "******", "role_id": "<uuid>" }
```

Éxito:

```json
{ "ok": true, "id": "<uuid>", "nombre": "dependienta1", "role_id": "<uuid>", "rol": "Dependienta" }
```

Errores: `{ "error": "mensaje legible" }` (401 sesión, 403 permiso, 409 nombre duplicado, 400 validación).

## Comportamiento

1. Valida JWT y permiso `usuarios/crear`.
2. Genera email técnico interno (nunca visible en UI).
3. `auth.admin.createUser` + `email_confirm: true`.
4. Inserta `public.usuarios` con `role_id`.
5. Si falla el perfil, borra el user de Auth (anti-parcial).

## Frontend

- Módulo: `public/js/alta-usuario-sin-email.js`
- Formulario: Usuario + Contraseña + Rol (sin correo)
- Login intacto: `obtener_email_login_por_nombre` + `signInWithPassword`

## Fuente versionada

`supabase/functions/crear-usuario-sin-email/index.ts`  
Si la EF en producción difiere, desplegar esta versión para alinear contrato.
