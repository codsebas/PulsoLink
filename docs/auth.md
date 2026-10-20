# Módulo de autenticación, autorización y usuarios

Documento del bloque de Autenticación y autorización (`@Mar-03`) con la
integración de usuarios y auditoría de PL2-04 (issue #28). Implementa la sección
9 del `README.md` y el contrato B 2.0.0 descrito en
[`contracts/web.openapi.yaml`](../contracts/web.openapi.yaml).

Estado: implementado en `feat/auth` y probado con emuladores de Firebase Auth y
Firestore. La evidencia reproducible está en
[`docs/evidencias/auth-pl2-2026-10-20.md`](evidencias/auth-pl2-2026-10-20.md).

- No usa Google Sign-In.
- No usa el SDK cliente de Firebase en el navegador.
- Las credenciales se verifican con Firebase Auth REST; la cookie de sesión se
  crea y verifica con el Admin SDK.
- Los roles se leen de Firestore en cada petición, nunca del formulario de login.
- El frontend no usa `localStorage` ni `sessionStorage` para la sesión.

## Roles y reglas de acceso

La API pública solo acepta los roles `admin` y `viewer`:

| Rol persistido o legado | Rol efectivo | Alcance |
| --- | --- | --- |
| `admin` | `admin` | Consulta y administración completa |
| `viewer` | `viewer` | Solo consulta |
| `operator` (legado) | `viewer` | Solo consulta; no se eleva ni se migra automáticamente |
| Cualquier otro valor | Sin acceso | Perfil inválido; se trata como no autenticado |

Reglas aplicadas por el servidor:

- Solo `admin` administra usuarios, crea/inicia/finaliza sesiones y consulta
  `/audit-logs`.
- `viewer` puede consultar sesiones y recursos autorizados. La única mutación
  permitida es registrar su propia apertura de expediente cuando esa operación
  esté habilitada.
- Una cookie válida con perfil `enabled:false` responde `403 USER_DISABLED`.
- Si un admin es degradado a viewer, sus peticiones posteriores se evalúan con
  el rol vigente; las sesiones emitidas antes del cambio se revocan al aplicar
  el `PATCH`.
- El middleware no guarda en caché el rol. El adaptador consulta el perfil
  actual en cada petición autenticada.
- Login y logout son las únicas operaciones que no exigen un rol previo.

## Flujo de acceso

```mermaid
sequenceDiagram
    participant N as Navegador
    participant A as API
    participant F as Firebase Auth REST
    participant S as Admin SDK
    participant D as Firestore

    N->>A: GET /api/v1/auth/csrf
    A-->>N: 200 { data.csrfToken } + cookie pulsolink_csrf
    N->>A: POST /api/v1/auth/login (X-CSRF-Token, email, password)
    A->>A: valida origen y CSRF
    A->>F: signInWithPassword
    F-->>A: idToken
    A->>S: createSessionCookie(idToken)
    A->>D: lee users/{uid} y registra auth.login
    A-->>N: 200 { data:{id,displayName,role} } + cookie pulsolink_session
    Note over A,N: la rotación de CSRF invalida el token anterior
    N->>A: GET /api/v1/auth/me
    A->>D: lee el perfil vigente
    A-->>N: 200 { data:{id,displayName,role} }
    N->>A: POST /api/v1/auth/logout (X-CSRF-Token)
    A-->>N: 204; borra la sesión y rota el CSRF
```

El login nunca devuelve `idToken`, cookie, contraseña, hash ni datos internos de
Firebase. La sesión vive en una cookie `HttpOnly`, `SameSite=Lax`, `Path=/` y
`Secure` salvo en desarrollo local explícito.

## Endpoints

| Método y ruta | Acceso | Respuesta |
| --- | --- | --- |
| `GET /api/v1/auth/csrf` | Ninguno | 200 `{ data: { csrfToken } }` |
| `POST /api/v1/auth/login` | CSRF + origen | 200 `{ data: { id, displayName, role } }` + cookie |
| `POST /api/v1/auth/logout` | CSRF + origen | 204; borra la cookie de sesión |
| `GET /api/v1/auth/me` | Cookie | 200 `{ data: { id, displayName, role } }` |
| `GET /api/v1/users` | `admin` | 200 lista paginada de usuarios |
| `GET /api/v1/users/{id}` | `admin` | 200 usuario |
| `POST /api/v1/users` | `admin` + CSRF | 201 usuario creado o recuperado |
| `PATCH /api/v1/users/{id}` | `admin` + CSRF | 200 usuario actualizado o recuperado |
| `GET /api/v1/audit-logs` | `admin` | 200 eventos paginados |

Los listados usan paginación por cursor y los filtros documentados en el
contrato. Los DTO de usuario nunca incluyen contraseña ni hashes.

## Códigos de error

| HTTP | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Cuerpo, parámetros, cursor o filtros inválidos |
| 401 | `INVALID_CREDENTIALS` | Correo inexistente, contraseña incorrecta o usuario deshabilitado en Auth |
| 401 | `UNAUTHENTICATED` | Sin cookie, cookie inválida/vencida/revocada o perfil inexistente |
| 403 | `USER_DISABLED` | Perfil con `enabled:false` |
| 403 | `FORBIDDEN` | Rol insuficiente |
| 403 | `CSRF_INVALID` | Token CSRF ausente/inválido u origen no permitido |
| 404 | `USER_NOT_FOUND` | El UID solicitado no tiene perfil |
| 409 | `IDEMPOTENCY_CONFLICT` | La operación previa no coincide o el correo pertenece a otra identidad |
| 409 | `USER_ALREADY_EXISTS` | Identidad o perfil incompatible con la creación solicitada |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo mayor a 8 KiB |
| 429 | `TOO_MANY_ATTEMPTS` | Límite de intentos o Firebase `TOO_MANY_ATTEMPTS_TRY_LATER` |
| 503 | `AUTH_UNAVAILABLE` | Firebase Auth no responde o devuelve 5xx |
| 503 | `AUTH_SYNC_PENDING` | El perfil quedó guardado, pero la identidad aún no se sincronizó |
| 503 | `AUDIT_UNAVAILABLE` | No se pudo registrar una auditoría obligatoria |

Formato de error:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "No hay una sesión activa.",
    "requestId": "..."
  }
}
```

## Modelo `users/{uid}`

El repositorio de usuarios añade metadatos internos para idempotencia y
recuperación. Los DTO públicos solo exponen `id`, `displayName`, `role`,
`enabled` y `createdAt`, conforme a `contracts/web.openapi.yaml`. Ni `email` ni
`profileVersion` forman parte del DTO ni del cuerpo de `PATCH`.

Campos internos relevantes:

| Campo | Uso |
| --- | --- |
| `role` | `admin`, `viewer` u `operator` legado |
| `enabled` | Habilitación lógica; no se borra historia |
| `profileVersion` | Contador interno incrementado en cada cambio de perfil |
| `pendingOperationId` | Operación de Auth pendiente de finalizar |
| `authSyncedAt` | Última sincronización conocida con Firebase Auth |
| `authSyncOwner` | Propietario temporal del lock de sincronización por usuario |
| `authSyncExpiresAt` | Vencimiento del lock de sincronización |

`userOperations/{operationId}` es un diario durable de creación/actualización.
Guarda el estado (`pending`, `completed`, `superseded`), el UID reservado, el
hash de la petición idempotente, `auditRecorded` y, si fue reemplazada,
`supersededBy`/`supersededAt`. Nunca guarda la contraseña ni un hash de ella.

## Creación de usuarios

El flujo es idempotente por correo normalizado:

1. Se calcula `operationId = SHA-256("user.create", correo)`.
2. Se reserva un UID y se prepara el perfil y la operación en una transacción.
3. Se crea la identidad en Firebase Auth con ese UID.
4. Se completa la operación y se registra la auditoría.

Reglas:

- Repetir la misma creación devuelve `201` con el mismo usuario y no duplica
  identidad, perfil, operación ni auditoría, siempre que el perfil conservado
  mantenga el mismo `displayName`, `role` y `enabled` solicitados.
- Si el usuario creado cambió después (por ejemplo, fue deshabilitado o
  renombrado), el reintento idempotente responde `409 IDEMPOTENCY_CONFLICT`; no
  devuelve un perfil que ya no coincide con la petición.
- Un correo ya asociado a otra identidad responde `409 IDEMPOTENCY_CONFLICT` y
  no adopta la identidad existente.
- Si dos peticiones compiten, la que pierde comprueba el UID reservado por la
  operación. Solo continúa si la identidad tiene el mismo correo; en otro caso
  descarta el perfil/operación y responde `409`.
- El hash idempotente incluye correo, nombre y rol, no la contraseña, porque la
  contraseña no se persiste ni se deriva. Un cambio de contraseña con el mismo
  correo, nombre y rol no se detecta como conflicto de idempotencia.
- Las respuestas y la auditoría no contienen la contraseña.

## Actualización de usuarios

`PATCH /users/{id}` acepta `displayName`, `role` y `enabled`. El cuerpo es
estricto y debe incluir al menos un campo. No se envía `profileVersion`: el
servidor resuelve la concurrencia dentro de una transacción y la última
petición válida prevalece.

- El servidor guarda perfil + nueva versión + operación pendiente y la
  auditoría `user.update` en la misma transacción. La auditoría no queda para
  después de Auth.
- Si ya existe otra operación pendiente para el usuario, se marca `superseded`
  y se registra `supersededBy`; la nueva operación reemplaza el objetivo
  anterior. Así un `PATCH` de `enabled:false` no queda bloqueado por un cambio
  de nombre fallido.
- Repetir exactamente el mismo `PATCH` mientras sigue pendiente reutiliza la
  operación existente; no crea otra auditoría.
- Después se sincroniza la identidad de Auth desde el **perfil vigente**
  (`displayName`, `disabled`, rol) y se solicitan revocaciones de sesión.
- Si Auth falla, la operación queda pendiente y la API responde
  `503 AUTH_SYNC_PENDING`. Reintentar el mismo `PATCH` o ejecutar la
  recuperación retoma la sincronización.
- Un `PATCH` sin cambios devuelve el usuario actual solo si no queda ninguna
  sincronización pendiente. Otro admin que repite valores ya aplicados retoma
  la sincronización sin duplicar auditoría; si falla, también recibe 503.
- No se borra historia ni se elimina la identidad.

## Recuperación de operaciones

La recuperación se ejecuta al arrancar y mediante
`apps/api/src/scripts/recover-user-operations.ts`.

- El reclamo es por usuario (`authSyncOwner` + `authSyncExpiresAt`, 60 s), no por
  operación. Evita trabajadores concurrentes mientras el reclamo siga vigente.
- Cada intento relee el perfil vigente y aplica ese estado, no el snapshot
  `desired` de la operación. La finalización comprueba también la versión
  realmente enviada. Si una llamada termina después de vencer su reclamo y
  sobrescribe Auth con un estado anterior, se registra una reconciliación durable
  contra el perfil actual, aunque otra operación ya haya terminado. Se repara
  sin duplicar auditoría administrativa; un fallo deja 503 y trabajo pendiente.
  Firestore sigue siendo la autoridad de permisos durante esa reconciliación.
- Solo completa la operación si sigue siendo `pending` y sigue siendo
  `pendingOperationId` del usuario; si fue reemplazada, no la completa.
- Una actualización pendiente se puede completar porque no necesita contraseña.
- Una creación solo se recupera si la identidad existe con el correo esperado y
  el perfil actual coincide con nombre, rol y habilitación solicitados. Si no,
  se omite para que el cliente reintente con la contraseña.
- Una identidad que aún no aparece de forma momentánea no se considera fallo
  definitivo.
- Un fallo de Firebase no bloquea el arranque del servidor.
- La recuperación pagina por `createdAt ASC, ID ASC`; las creaciones que esperan
  contraseña no impiden alcanzar actualizaciones posteriores. Cada lote es
  acotado y devuelve un cursor interno. El arranque y la CLI continúan los lotes
  hasta terminar el recorrido. Los journals nuevos llevan `version:1`, distinta
  de `profileVersion`, y no se devuelve ninguno de esos metadatos al navegador.

## Auditoría

Eventos implementados:

- `auth.login` con resultado de éxito o fallo.
- Las mutaciones administrativas de usuarios: `user.create` y `user.update`.
- La apertura de expediente cuando el módulo correspondiente la invoca.

Reglas:

- `user.update` se escribe en la misma transacción que el cambio de perfil, con
  `auditRecorded:true` en la operación. Si Auth falla después, la auditoría ya
  está persistida y no se duplica al recuperar.
- `user.create` se audita al completar la operación; las operaciones antiguas
  sin `auditRecorded` reciben la auditoría al completarse una sola vez.
- El actor es el UID autenticado; si no se comprobó identidad, se usa
  `anonymous`.
- No se guardan correo, contraseña, tokens, cookies, cuerpos completos ni
  lecturas.
- Si falla la auditoría obligatoria de un login exitoso, no se entrega la
  sesión y se responde `503 AUDIT_UNAVAILABLE`.
- `GET /audit-logs` es solo para admin, con filtros por `actorId`, `action`,
  `targetType`, `targetId`, `from`, `to` y cursor. No existen endpoints de
  edición o borrado.

## Integración en Express

- `authRouter`, `usersRouter` y `auditRouter` se montan en `app.ts`.
- `requireUser` deja `req.user` con `{ id, displayName, role }` y sin caché.
- `csrfProtection` se aplica a mutaciones web; en sesiones va después de
  `requireUser` para que una petición sin sesión responda 401 y no 403.
- Las rutas de usuarios y auditoría vuelven a comprobar el rol `admin`; no
  dependen solo de que el frontend oculte controles.
- El manejador global traduce `AuthError`, JSON malformado y cuerpos demasiado
  grandes.
- Los repositorios son la única vía de acceso a Firestore; el frontend no usa
  SDK cliente.

## Aprovisionamiento

Las identidades se crean o actualizan con:

```powershell
npx tsx src/scripts/provision-auth-users.ts
```

Requiere las variables `PROVISION_*` documentadas en `apps/api/.env.example`.
El script solo escribe en Firebase Auth, imprime correo, UID y rol, y nunca
muestra contraseñas. Los perfiles `users/{uid}` y los dispositivos de demo se
crean con `provision-demo.ts`.

Las contraseñas solo se envían a Firebase Auth; nunca se guardan en Firestore,
en `.env` ni en los registros de los scripts.

## Frontend web

- `AuthCard` solicita CSRF, envía el login y muestra errores accesibles.
- `ProtectedRoute` usa `GET /auth/me` como fuente de verdad. Un `401` redirige a
  `/login`; un `5xx` o un fallo de red no se interpreta como ausencia de sesión.
- El retorno tras login solo acepta rutas internas.
- `Header` muestra el nombre y rol vigentes y cierra sesión con CSRF.
- Logout cancela consultas, limpia `queryClient`, renueva el CSRF y redirige.
- La SPA no guarda cookies ni tokens en `localStorage`.

## Variables de entorno

Presentes en `apps/api/.env.example`:

```text
FIREBASE_WEB_API_KEY=<api-key>
FIREBASE_PROJECT_ID=<project-id>
CORS_ORIGIN=http://localhost:5173
CSRF_SECRET=<secreto-de-32-caracteres-o-mas>
COOKIE_SECURE=true
SESSION_TTL_HOURS=8
LOGIN_RATE_LIMIT_MAX=10
LOGIN_RATE_LIMIT_WINDOW_MS=900000
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

- `FIREBASE_WEB_API_KEY` es opcional al arrancar; sin ella, el login responde
  `503 AUTH_UNAVAILABLE`.
- En producción, `CSRF_SECRET` debe tener al menos 32 caracteres y no puede ser
  el valor de desarrollo.
- `COOKIE_SECURE` está activo por defecto. Solo se desactiva con
  `COOKIE_SECURE=false` en desarrollo local por HTTP.

## Decisiones de seguridad

- CSRF double-submit firmado con HMAC-SHA256 y rotación tras login/logout.
- Mismo `401 INVALID_CREDENTIALS` para correo inexistente y contraseña
  incorrecta, para no revelar cuentas.
- El rol se lee de Firestore y no de claims del cliente.
- Revocación de sesiones al cambiar rol o habilitación.
- Los errores no exponen detalles del SDK ni valores sensibles.
- No hay recuperación ilimitada de operaciones ni cola de reintentos de
  contraseñas.

## Verificación y límites

La suite de API con emuladores cubre autenticación, CSRF, roles, usuarios,
auditoría, sesiones y persistencia. Los comandos y resultados concretos están
en la evidencia enlazada.

Límites conocidos:

- El emulador no demuestra la disponibilidad real de índices en Firestore
  Standard.
- Con Auth Emulator de Firebase CLI 15.34.0 se comprobó la revocación dejando
  1,2 s entre emisión y cambio de rol: la cookie antigua responde 401 sin
  deshabilitar la identidad. La prueba anterior sin separación temporal no
  demostraba que el emulador ignorase la revocación. Esta evidencia local no
  acredita configuración, IAM ni comportamiento del despliegue en nube.
- La creación no puede detectar un cambio de contraseña como conflicto de
  idempotencia porque la contraseña no se persiste.
- Una creación pendiente sin identidad Auth requiere que el cliente reintente
  con la contraseña.
- La verificación en un proyecto Firebase real y el despliegue siguen fuera de
  este alcance.
- El PR #38 está integrado en la base local `1385d23`: se reutilizan sus vistas
  administrativas y `useSessionUser`, con la misma caché de autenticación para
  Header, ProtectedRoute y AdminRoute. La validación de UI se documenta aparte
  de las pruebas de API.
