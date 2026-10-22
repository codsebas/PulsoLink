# PL2-08 — Matriz de QA: permisos, consistencia y concurrencia de la API

Issue: [#32](https://github.com/codsebas/PulsoLink/issues/32).
Responsables: `@HugoX2024` (matriz HTTP general, contrato A, registro de defectos) y `@AxelHerrera11` (esta sección: permisos, consistencia, concurrencia y contraste con la web).
Supervisión de backend: `@codsebas`.
Estado del documento: **lista para ejecutar** (actualizada el 2026-10-21). Las rutas 2.0.0 ya están en `main` (PR #38, #41 y #49). Los casos que Hugo ya ejecutó con su matriz se marcan como *Cubierto por Hugo* y no se repiten. La ejecución automatizada de esta sección se integra en `npm run qa` de `tools/device-simulator`.

## Fuentes

Cada resultado esperado procede de estas fuentes. Si una fila no tiene una respuesta clara en ellas, se marca **Por confirmar** y no se inventa.

- [Contrato B 2.0.0](../../contracts/web.openapi.yaml): `x-roles`, cuerpos, respuestas y descripciones de cada operación.
- [Contrato A 2.0.0](../../contracts/device.openapi.yaml), solo en los casos de concurrencia que cruzan con la ingestión.
- [Contrato de arquitectura aprobado](../arquitectura/contrato-aprobado-2026-10-18.md), §1, §5 y §7.
- [Plan de ejecución vigente](../planificacion/ejecucion-2026-10-18.md): interfaces concretadas y recorrido de aceptación.

## Dependencias y bloqueos

| Bloque | Requiere | Estado al 2026-10-21 |
| --- | --- | --- |
| Persistencia de pacientes, asignaciones y auditoría | [#26](https://github.com/codsebas/PulsoLink/issues/26) | Integrada en `main` (PR #39, #43 y #49) |
| Endpoints 2.0.0 (pacientes, placas, asignaciones, sesiones) | [#27](https://github.com/codsebas/PulsoLink/issues/27) | Integrados en `main` (PR #49) |
| Rol `viewer`, usuarios y `audit-logs` | [#28](https://github.com/codsebas/PulsoLink/issues/28) | Integrados en `main` (PR #41) |
| Pantallas para el contraste web | [#29](https://github.com/codsebas/PulsoLink/issues/29), [#30](https://github.com/codsebas/PulsoLink/issues/30), [#31](https://github.com/codsebas/PulsoLink/issues/31) | Integradas parcialmente (PR #38 y #42); sección E en segunda ronda |

Los issues pueden seguir abiertos hasta su aceptación formal; eso no bloquea ejecutar esta matriz.

La línea base del contrato anterior (`df5e858`) se conserva en [la evidencia inicial](../evidencias/pl2-08-linea-base.md).

## Convenciones

- **Estados** (los de [evidencias](../evidencias/README.md)): `No ejecutado`, `Aprobado`, `Falló`, `Omitido`. Se añaden `Bloqueado (#N)` cuando falta la implementación de ese issue, y `Cubierto por Hugo` cuando el caso ya se ejecutó en su matriz.
- **Obtenido:** se completa al ejecutar con el HTTP, el `error.code` y una referencia a la evidencia. Nunca se pegan cookies, tokens, secretos ni datos reales.
- **Entorno:** cada ejecución indica si usó emuladores (`demo-pulsolink`) o el proyecto de prueba Standard.
- `401` significa `UNAUTHENTICATED`. `403` significa rol insuficiente, usuario deshabilitado, o CSRF/origen inválidos.
- Todas las respuestas de error deben traer `error.code`, `error.message` y `error.requestId` (obligatorios en `ErrorResponse`).

## Datos de prueba (fixture)

Los aprovisiona el responsable de datos indicado en el issue (Gerson). Se usan seudónimos y credenciales por entorno, fuera de Git.

| Clave | Recurso | Notas |
| --- | --- | --- |
| `ADM` | Usuario `admin` habilitado | Ejecuta las mutaciones |
| `VIE` | Usuario `viewer` habilitado | Solo consulta |
| `DIS` | Usuario deshabilitado (`enabled:false`) | Tiene cookie emitida antes de deshabilitarlo |
| `PA`, `PB` | Pacientes habilitados | Seudónimos, p. ej. `P-QA-A`, `P-QA-B` |
| `PX` | Paciente deshabilitado | |
| `D1`, `D2` | Placas `simulated` habilitadas, cada una con su credencial | Credencial solo en variables de entorno locales |
| `DX` | Placa deshabilitada | |

## A. Autenticación y CSRF transversales

| ID | Caso | Preparación | Petición | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Sin cookie en lectura protegida | Ninguna | `GET /patients` | 401 | — | No ejecutado |
| AUTH-02 | Cookie alterada o vencida | Modificar un carácter de `pulsolink_session` | `GET /auth/me` | 401 | — | No ejecutado |
| AUTH-03 | Mutación sin `X-CSRF-Token` | Sesión `ADM` | `POST /patients` sin cabecera | 403; sin documento creado | — | No ejecutado |
| AUTH-04 | Token CSRF anterior al login | Pedir CSRF, iniciar sesión (rota el token), reutilizar el anterior | `POST /patients` | 403 | — | No ejecutado |
| AUTH-05 | Origen no permitido | Sesión `ADM`, cabecera `Origin: http://evil.local` | `POST /patients` | 403 | — | No ejecutado |
| AUTH-06 | Usuario deshabilitado con cookie previa | Sesión `DIS` emitida y después `enabled:false` | `GET /patients` | 403 | — | No ejecutado |
| AUTH-07 | Logout sin sesión | Solo CSRF | `POST /auth/logout` | 204 (idempotente) | — | No ejecutado |
| AUTH-08 | Rol degradado pierde privilegios | Sesión `ADM2`; otro admin hace `PATCH /users/{ADM2} {role:viewer}` | `POST /patients` con la sesión antigua de `ADM2` | Nunca 201; 401 o 403 (**Por confirmar** P-06) | — | No ejecutado |
| AUTH-09 | Login no acepta rol del formulario | Credenciales de `VIE` + campo `role:admin` | `POST /auth/login` | 400 (`additionalProperties:false`) | — | No ejecutado |
| AUTH-10 | `requestId` en errores | Cualquiera de AUTH-01..06 | — | `error.requestId` presente | — | No ejecutado |

## B. Matriz de roles por operación

Esperado por columna: **Sin sesión / viewer / admin**. En las mutaciones, `viewer` debe recibir 403 **antes** de tocar la persistencia, aunque llame al endpoint a mano. Se comprueba después con una lectura que no haya cambiado nada.

| ID | Operación | Sin sesión | viewer | admin | Estado |
| --- | --- | --- | --- | --- | --- |
| ROL-01 | `GET /auth/me` | 401 | 200 | 200 | No ejecutado |
| ROL-02 | `GET /patients` | 401 | 200 | 200 | No ejecutado |
| ROL-03 | `POST /patients` | 401 | 403 | 201 | No ejecutado |
| ROL-04 | `GET /patients/{id}` | 401 | 200 | 200 | No ejecutado |
| ROL-05 | `PATCH /patients/{id}` | 401 | 403 | 200 | Cubierto por Hugo (B-01, viewer → 403; [Hugo](../evidencias/hugo-integrado-2026-10-21.md)) |
| ROL-06 | `GET /devices` | 401 | 200 | 200 | No ejecutado |
| ROL-07 | `POST /devices` | 401 | 403 | 201 | No ejecutado |
| ROL-08 | `GET /devices/{id}` | 401 | 200 | 200 | No ejecutado |
| ROL-09 | `PATCH /devices/{id}` | 401 | 403 | 200 | No ejecutado |
| ROL-10 | `GET /users` | 401 | 403 | 200 | No ejecutado |
| ROL-11 | `POST /users` | 401 | 403 | 201 | No ejecutado |
| ROL-12 | `GET /users/{id}` (incluido el propio) | 401 | 403 | 200 | No ejecutado |
| ROL-13 | `PATCH /users/{id}` | 401 | 403 | 200 | No ejecutado |
| ROL-14 | `GET /assignments` | 401 | 200 | 200 | No ejecutado |
| ROL-15 | `POST /assignments` | 401 | 403 | 201 | No ejecutado |
| ROL-16 | `GET /assignments/{id}` | 401 | 200 | 200 | No ejecutado |
| ROL-17 | `POST /assignments/{id}/close` | 401 | 403 | 200 | No ejecutado |
| ROL-18 | `GET /sessions` | 401 | 200 | 200 | No ejecutado |
| ROL-19 | `POST /sessions` | 401 | 403 | 201 | No ejecutado |
| ROL-20 | `GET /sessions/{id}` | 401 | 200 | 200 | No ejecutado |
| ROL-21 | `POST /sessions/{id}/start` | 401 | 403 | 200 | No ejecutado |
| ROL-22 | `POST /sessions/{id}/finish` | 401 | 403 | 200 | No ejecutado |
| ROL-23 | `GET /sessions/{id}/latest` | 401 | 200 | 200 | No ejecutado |
| ROL-24 | `GET /patients/{id}/latest` | 401 | 200 | 200 | No ejecutado |
| ROL-25 | `GET /sessions/{id}/measurements` | 401 | 200 | 200 | No ejecutado |
| ROL-26 | `GET /patients/{id}/measurements` | 401 | 200 | 200 | No ejecutado (viewer cubierto por Hugo, B-03) |
| ROL-27 | `POST /patients/{id}/access` (única mutación del viewer) | 401 | 201 | 201 | No ejecutado |
| ROL-28 | `GET /audit-logs` | 401 | 403 | 200 | Cubierto por Hugo (B-02, viewer → 403; [Hugo](../evidencias/hugo-integrado-2026-10-21.md)) |
| ROL-29 | `GET /patients?enabled=false` | 401 | 403 (P-03) | 200 con deshabilitados | No ejecutado |
| ROL-30 | viewer en mutación sobre ID inexistente (`PATCH /patients/no-existe`) | 401 | 403 (**Por confirmar** P-04) | 404 | No ejecutado |

## C. Consistencia de datos y reglas de servidor

| ID | Caso | Preparación | Petición | Esperado | Estado |
| --- | --- | --- | --- | --- | --- |
| CON-01 | Campos del servidor no se aceptan del cliente | Sesión `ADM` | `POST /patients` con `enabled`, `createdAt` | 400 `VALIDATION_ERROR` | No ejecutado |
| CON-02 | Sesión ya no acepta `participantCode` | Asignación activa `PA`+`D1` | `POST /sessions {participantCode:"P-1"}` | 400 | No ejecutado |
| CON-03 | Sesión resuelve identidad en servidor | Asignación activa `PA`+`D1` | `POST /sessions {assignmentId}` | 201; `patientId`, `deviceId` y `source` iguales a los de la asignación y la placa | No ejecutado |
| CON-04 | Actor desde la cookie | Sesión `ADM` | `POST /assignments` | `assignedBy` = id de `ADM`; el cuerpo no puede fijarlo | No ejecutado |
| CON-05 | Cierre de asignación idempotente | Asignación sin sesiones abiertas | `POST /assignments/{id}/close` ×2 | 200 ambas; mismos `endedAt` y `endedBy` | No ejecutado |
| CON-06 | Cierre con sesión abierta | Sesión `created` o `active` en la asignación | `POST /assignments/{id}/close` | 409 `ASSIGNMENT_IN_USE` | No ejecutado |
| CON-07 | Deshabilitar paciente ocupado | `PA` con asignación activa | `PATCH /patients/{PA} {enabled:false}` | 409 `ASSIGNMENT_IN_USE` | No ejecutado |
| CON-08 | Deshabilitar placa ocupada | `D1` con asignación activa | `PATCH /devices/{D1} {enabled:false}` | 409 `ASSIGNMENT_IN_USE` | No ejecutado |
| CON-09 | Asignar recurso deshabilitado | `PX` o `DX` | `POST /assignments` | Rechazo sin asignación creada; HTTP **Por confirmar** (P-05) | No ejecutado |
| CON-10 | Placa ocupada | `D1` asignada a `PA` | `POST /assignments {PB, D1}` | 409 `ASSIGNMENT_CONFLICT` | No ejecutado |
| CON-11 | Transiciones de sesión | Sesión `created` | `finish` → 409; `start` ×2 → 200 con el mismo `startedAt`; `finish` ×2 → 200 con el mismo `finishedAt`; `start` sobre `finished` → 409 | Según la descripción de start/finish | No ejecutado |
| CON-12 | Sin secretos en respuestas | `POST /users`, `GET /devices/{id}` | — | Sin `password`, secreto, hash ni tokens | No ejecutado |
| CON-13 | Toda mutación administrativa se audita | Ejecutar ROL-03, 05, 07, 09, 11, 13, 15, 17, 19, 21 y 22 como `ADM` | `GET /audit-logs?actorId={ADM}` | Un evento por mutación, con `actorId`, `action` y `targetId`; sin lecturas ni secretos | No ejecutado |
| CON-14 | Apertura de expediente deduplicada | Sesión `VIE`, `viewId` nuevo | `POST /patients/{PA}/access` ×2 con el mismo `viewId` | 201 y luego 200 `duplicate:true` con el mismo `eventId` | No ejecutado |
| CON-15 | El polling no audita | Expediente abierto | `GET /patients/{PA}/latest` ×10 | El número de eventos `patient.view` no cambia | No ejecutado |
| CON-16 | Cursor ligado al filtro | Página 1 de `GET /patients/{PA}/measurements` | Reusar su `nextCursor` con `{PB}` | 400 `VALIDATION_ERROR` | No ejecutado |
| CON-17 | Historia al cambiar de placa (con Hugo) | `PA`+`D1` con muestras → finalizar → cerrar → `PA`+`D2` con muestras | `GET /patients/{PA}/measurements` | Ambos tramos con su `deviceId` y `assignmentId` originales; `PB` no ve muestras de `PA` | Cubierto por Hugo (JOINT-CON-17, B-04, B-05; [Hugo](../evidencias/hugo-integrado-2026-10-21.md)) |
| CON-18 | `null` nunca es cero | Muestra con `spo2.status=no_contact` | `GET /patients/{PA}/latest` | `value:null` y el estado conservado | No ejecutado |

## D. Concurrencia

Cada caso se lanza con N peticiones simultáneas (N ≥ 5) y después se comprueba el estado final con una lectura. Una pasada no prueba la ausencia de carreras: se repite al menos 3 veces y se registra cuántas pasaron.

| ID | Caso | Peticiones simultáneas | Invariante esperado | Estado |
| --- | --- | --- | --- | --- |
| CONC-01 | Misma placa, pacientes distintos | `POST /assignments {PA,D1}` y `{PB,D1}` | Exactamente un 201; el resto 409 `ASSIGNMENT_CONFLICT`; `GET /assignments?deviceId=D1&status=active` devuelve 1 | No ejecutado |
| CONC-02 | Mismo paciente, placas distintas | `POST /assignments {PA,D1}` y `{PA,D2}` | Exactamente una asignación activa para `PA` | No ejecutado |
| CONC-03 | Petición idéntica repetida | N × `POST /assignments {PA,D1}` | Un 201; el resto 409; una sola asignación | No ejecutado |
| CONC-04 | Dos sesiones abiertas en la misma asignación | N × `POST /sessions {assignmentId}` | Como máximo una sesión abierta; código del rechazo **Por confirmar** (P-05) | No ejecutado |
| CONC-05 | Inicio repetido | N × `POST /sessions/{id}/start` | Todas 200 con el mismo `startedAt`; la placa queda con `activeSessionId` = id | No ejecutado |
| CONC-06 | Cierre contra nueva sesión | `POST /assignments/{id}/close` ‖ `POST /sessions {assignmentId}` | Nunca una asignación cerrada con sesión abierta: o cierre 200 + sesión 409, o sesión 201 + cierre 409 `ASSIGNMENT_IN_USE` | No ejecutado |
| CONC-07 | Deshabilitar contra asignar | `PATCH /devices/{D1} {enabled:false}` ‖ `POST /assignments {PA,D1}` | Nunca una placa deshabilitada con asignación activa | No ejecutado |
| CONC-08 | Finalizar contra muestra entrante (con Hugo) | `POST /sessions/{id}/finish` ‖ `POST /device/measurements` | La muestra se guarda antes del cierre o recibe 409 `SESSION_NOT_ACTIVE`; ninguna con `receivedAt` > `finishedAt` | Cubierto por Hugo (JOINT-CONC-08; timeout en #51; [Hugo](../evidencias/hugo-integrado-2026-10-21.md)) |
| CONC-09 | Apertura de expediente simultánea | N × `POST /patients/{PA}/access` con el mismo `viewId` | Un 201, el resto 200 `duplicate:true`; un solo evento | No ejecutado |

Herramienta propuesta: un script que dispare las peticiones en paralelo y guarde HTTP, `error.code` y la lectura final. Puede ser `ForEach-Object -Parallel` en PowerShell 7 o Node.js con `Promise.all`; se decide con Hugo para usar la misma en toda la matriz. Las pruebas de persistencia existentes ya cubren reservas concurrentes del contrato anterior (ver la línea base).

## E. Contraste API ↔ web

Comprueba que la web refleja lo que responde la API, no solo que oculte botones. La QA visual completa corresponde a [#33](https://github.com/codsebas/PulsoLink/issues/33); aquí solo se contrasta la consistencia con la API. **Se ejecuta en una segunda ronda**, después de las secciones A–D.

| ID | Caso | Esperado | Estado |
| --- | --- | --- | --- |
| UI-01 | Viewer en pantallas administrativas | No ve acciones de alta, edición ni asignación; si fuerza la URL o la petición, la API responde 403 (ROL-03 a ROL-22) | Pendiente (segunda ronda) |
| UI-02 | 401 durante el polling (cookie vencida) | La web redirige a `/login` y no sigue mostrando datos como vigentes | Pendiente (segunda ronda) |
| UI-03 | 409 de negocio | `ASSIGNMENT_CONFLICT`, `ASSIGNMENT_IN_USE` y `DEVICE_BUSY` muestran un mensaje comprensible, no un error genérico | Pendiente (segunda ronda) |
| UI-04 | `connectionState` | Los tres estados del panel coinciden con `meta.connectionState` de `latest` | Pendiente (segunda ronda) |
| UI-05 | `null` en la interfaz | Valores `null` se muestran como "sin dato" con su estado, nunca 0 | Pendiente (segunda ronda) |
| UI-06 | Logout limpia la caché | Tras cerrar sesión, volver atrás no muestra datos de pacientes | Pendiente (segunda ronda) |
| UI-07 | Horas | La API entrega UTC y la web muestra `America/Guatemala` | Pendiente (segunda ronda) |
| UI-08 | Apertura auditada una vez | Abrir un expediente genera un solo `POST /patients/{id}/access`; el polling no lo repite | Pendiente (segunda ronda) |

## Puntos por confirmar

Se plantean en el issue o en el PR correspondiente antes de ejecutar. No se marcan como defecto mientras el contrato no fije la respuesta.

| ID | Pregunta | A quién |
| --- | --- | --- |
| P-01 | El contrato describe el 403 de CSRF u origen como `FORBIDDEN`, pero la API actual devuelve `CSRF_INVALID` (`apps/api/src/modules/auth/csrf.ts`). ¿Se conserva `CSRF_INVALID` y se documenta en el contrato? **Sigue igual en `main` tras el PR #41**, y el frontend depende de ese código. | `@Mar-03`, `@codsebas` |
| P-02 | Igual con usuario deshabilitado: el contrato dice `FORBIDDEN` y la API devuelve `USER_DISABLED` (`auth.middleware.ts`). **Sigue igual en `main` tras el PR #41.** | `@Mar-03`, `@codsebas` |
| P-03 | **Resuelto en `main`:** `GET /patients?enabled=false` como viewer devuelve 403 `FORBIDDEN` (`apps/api/src/modules/patients/patients.read.routes.ts`). ROL-29 espera 403. | — |
| P-04 | Viewer en una mutación sobre un ID inexistente: ¿403 (rol antes que existencia, no revela si existe) o 404? Se propone 403. | `@DidhyerOrtiz`, `@Mar-03` |
| P-05 | Código para asignar un paciente o placa deshabilitados y para abrir una segunda sesión en la misma asignación: ¿409 con qué `error.code`? | `@DidhyerOrtiz`, `@gioore` |
| P-06 | Tras degradar un rol con `PATCH /users`, la sesión antigua ¿recibe 401 (revocada) o 403 (rol nuevo)? | `@Mar-03` |

## Registro de defectos

Cada defecto se abre como issue enlazado a #32 con: pasos, fixture, petición (sin secretos), esperado, obtenido (HTTP, `error.code`, `requestId`), entorno y commit. Tras la corrección, el caso se vuelve a ejecutar y se anota aquí.

| Defecto | Caso | Estado | Regresión |
| --- | --- | --- | --- |
| — | — | — | — |
