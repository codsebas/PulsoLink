# Firestore Standard — modelo objetivo

Estado: diseño aprobado, pendiente de implementación. Referencia: [contrato de arquitectura](../docs/arquitectura/contrato-aprobado-2026-10-18.md). Se mantienen Firebase Admin SDK en Express y reglas de denegación total para clientes. Esta entrega no configura una instancia ni despliega índices.

| Ruta | Campos mínimos / invariantes |
| --- | --- |
| `users/{uid}` | `displayName`, `role: admin|viewer`, `enabled`, `createdAt`; identidad Auth con el mismo UID |
| `patients/{patientId}` | `code`, `displayName` (alias), `enabled`, `createdAt`, `updatedAt`; identidad histórica opaca |
| `devices/{deviceId}` | `code`, `hardwareId` opcional, `source: real|simulated`, `enabled`, `activeSessionId`, `lastSeenAt` |
| `deviceCredentials/{credentialId}` | `deviceId`, hash de secreto, habilitación/revocación y fechas; solo servidor |
| `assignments/{assignmentId}` | `patientId`, `deviceId`, `startedAt`, `endedAt`, `assignedBy`, `endedBy`; fechas/actor de cierre nulos al crear |
| `sessions/{sessionId}` | `patientId`, `deviceId`, `assignmentId`, `status: created|active|finished`, `source`, `createdAt`, `startedAt`, `finishedAt`, `latestMeasurement` |
| `sessions/{sessionId}/measurements/{measurementId}` | Los cuatro IDs históricos, `receivedAt`, `capturedAt`, `bootId`, `sequence`, `measurements`, `source` |
| `ingestionKeys/{keyHash}` | Hash del contenido normalizado, ID y fecha de medición; conservar formato/garantía existentes |
| `auditLogs/{eventId}` | `actorId`, `action`, `targetType`, `targetId`, `occurredAt`, `result`, `context` mínimo; inmutable, solo consulta admin |

No usar arrays crecientes. `latestMeasurement` es un único resumen acotado. IDs opacos, fechas ISO UTC normalizadas por backend para mantener compatibilidad con repositorios actuales; `receivedAt` es autoritativo. Datos de prueba mínimos y seudónimos.

## Transacciones e invariantes

Una consulta de asignaciones abiertas por sí sola no impide dos altas concurrentes. La implementación debe leer/escribir documentos de reserva comunes: se proponen `activeAssignmentId: string|null` en paciente y dispositivo, mantenidos junto al historial en la misma transacción. Son punteros operativos, no sustituyen los IDs históricos. Crear exige ambos habilitados y ambos punteros libres; asigna los dos y crea el historial/auditoría atómicamente. La colisión devuelve `409 ASSIGNMENT_CONFLICT`.

Cerrar exige que las sesiones de esa asignación estén finalizadas; de lo contrario devuelve `409 ASSIGNMENT_IN_USE`. Para evitar que una sesión `created` quede bloqueada al cerrar, creación/cierre/inicio deben coordinarse mediante reserva en la asignación (por ejemplo `openSessionId`, liberado al finalizar); el detalle se implementará y probará con los repositorios. No permitir varias sesiones abiertas para la misma asignación. Repetir cierre conserva fecha/actor originales. No crear sesiones sin asignación ni reabrir sesiones finalizadas.

Crear sesión recibe solo `assignmentId`; la API resuelve `patientId`, `deviceId` y `source`. Iniciar relee asignación, paciente y dispositivo habilitados y reserva dispositivo de forma atómica. Finalizar libera reservas de sesión sin terminar automáticamente la asignación. Reasignar: finalizar sesión → cerrar asignación → crear nueva asignación → crear/iniciar nueva sesión. Las operaciones conflictivas concurrentes deben producir 409, sin superposición.

Una nueva ingestión autentica credencial y contrasta `deviceId`, después valida sesión activa, asignación abierta, paciente/dispositivo habilitados y punteros coherentes dentro de la transacción. Fija los cuatro IDs; escribe medición, clave y resumen atómicamente. No aceptar `patientId`, `assignmentId`, `receivedAt` ni `source` del emisor. Duplicados idénticos conservan referencia original incluso tras finalizar/reasignar, siempre con credencial y placa habilitadas; una misma clave con otra carga produce `IDEMPOTENCY_CONFLICT`. Nunca cambiar pertenencia histórica por el puntero actual de la placa.

Deshabilitar paciente/dispositivo con asignación activa exige cerrarla antes (409); cambiar identidad `source` de una placa con historia no está permitido. No borrar expedientes, sesiones ni lecturas desde estos CRUD.

## Consulta histórica por paciente e índices

Consulta de grupo `measurements`: `where(patientId == id)`, rango opcional `receivedAt >= from` y `< to`, `orderBy(receivedAt DESC)`, `orderBy(documentId DESC)`, `limit + 1`. El desempate para grupo de colecciones usa la ruta completa de documento. El cursor opaco liga paciente, filtros, orden y ruta; no concede permisos. API devuelve `limit` predeterminado 50, máximo 100 y `pagination.nextCursor/hasMore`. Dos placas sucesivas deben aparecer en la misma consulta sin cruzar pacientes.

Índice objetivo a versionar por el responsable de Firebase al implementar:

```json
{
  "collectionGroup": "measurements",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "patientId", "order": "ASCENDING" },
    { "fieldPath": "receivedAt", "order": "DESCENDING" },
    { "fieldPath": "__name__", "order": "DESCENDING" }
  ]
}
```

Definir además índices de listados de sesiones/asignaciones por paciente/dispositivo y auditoría según filtros implementados; no inventar combinaciones sin consultas. Los emuladores prueban lógica y concurrencia, pero no acreditan necesidad/disponibilidad de índices compuestos: comprobar la consulta en Firestore Standard de prueba antes de declarar lista la demo en nube.

## Auditoría y migración

Mutaciones administrativas y su evento se guardan de forma consistente en transacción Firestore. Operaciones que también afectan Firebase Auth requieren coordinación idempotente y recuperación documentada: Auth y Firestore no comparten transacción. Deshabilitar/cambiar rol invalida acceso efectivo y revoca sesiones según el flujo de autenticación.

Acciones mínimas: `auth.login`, `patient.view`, `patient.create`, `patient.update`, `device.create`, `device.update`, `assignment.create`, `assignment.close`, `session.create`, `session.start`, `session.finish`, `user.create`, `user.update`. No guardar contraseñas, cookies, tokens, credenciales ni copias de mediciones. Registrar login exitoso/fallido con resultado; para intentos sin identidad comprobada usar actor técnico `anonymous` y no copiar el correo/cuerpo recibido.

La apertura de expediente usa `POST /patients/{id}/access` con `viewId` UUID por apertura. El servidor deduplica por actor, paciente y `viewId`; reintento no crea otro evento. Polling de `latest` e historial no crea eventos. Toda apertura de expediente desde la web registra este evento antes de mostrar su contenido; no confundirlo con auditoría exhaustiva de cada GET manual.

Antes de migrar hacer inventario y respaldo, probar en emuladores/datos seudónimos y acordar ventana sin escrituras incompatibles. Mapear `operator → viewer` explícitamente; nunca promoverlo a admin. Revisar usuarios de scripts, middleware, DTO, tests y caché/sesiones vigentes. Relacionar sesiones históricas a pacientes/asignaciones solo con correspondencia confirmada: `participantCode` no garantiza identidad única. No deducirla de la placa ni mezclar expedientes. Conservar registros no resueltos como legado fuera de consultas de pacientes hasta revisión; no borrar ni fabricar IDs o fechas. Mantener claves/hashes antiguos para no romper reintentos; definir compatibilidad de normalización antes de exigir campos nuevos.
