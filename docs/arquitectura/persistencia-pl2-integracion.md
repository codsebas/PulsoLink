# Persistencia y monitoreo por paciente — entrega de Gerson

Relacionada con #25, #26, #29 y la parte de Gerson de #34. Basada en `df5e858` y OpenAPI 2.0.0. Esta entrega amplía los repositorios existentes; no crea otro servidor ni otro endpoint de ingestión. Firestore Standard y reglas de denegación total se conservan.

## Firmas para Didhyer, Marielos y Javier

Todos los repositorios reciben opcionalmente `() => Firestore`, por defecto `getDb`. La API debe validar identidad y permisos antes de invocarlos. Los actores proceden del usuario verificado, nunca de un cuerpo HTTP.

| Repositorio | Firmas disponibles |
| --- | --- |
| `PatientsRepository` | `create({code,displayName},actorId)`, `update(id,{code?,displayName?,enabled?},actorId)`, `getById`, `list({enabled?,limit?,cursor?})` |
| `DevicesRepository` | Se conservan `list`, `listEnabled`, `getById`, `heartbeat`; se añaden `create({code,source,hardwareId?},actorId)` y `update(id,{code?,hardwareId?,enabled?},actorId)` |
| `AssignmentsRepository` | `create({patientId,deviceId},actorId)`, `close(id,actorId)`, `getById`, `list({patientId?,deviceId?,status?,from?,to?,limit?,cursor?})` |
| `SessionsRepository` | `createForAssignment(assignmentId,actorId)`, `start(sessionId,actorId)`, `finish(sessionId,actorId)`; `list` acepta filtros patientId/assignmentId además de los anteriores |
| `MeasurementsRepository` | `ingest(authenticatedDeviceId,payload)`, `listByPatient(patientId,{from?,to?,limit?,cursor?})`; se conservan lecturas por sesión |
| `AuditRepository` | `append(input,operationIdUUID)`, `recordPatientView`, `recordPatientAccess` (ACK HTTP), `list` solo para servicios autorizados admin; sin update/delete |

Los documentos internos conservan punteros operativos. Usar DTO para no devolver `activeAssignmentId`, `openSessionId`, `status` derivado de asignación u otros campos internos no definidos por el contrato. `participantCode` y `operatorId` del legado no identifican a un paciente. El creador interno `operatorId` de una nueva sesión representa al actor; no concede al viewer permiso de modificación.

### Invariantes

- La creación de asignación lee/escribe en una transacción paciente y dispositivo; no hay dos asignaciones activas para la misma persona o placa. Error `ASSIGNMENT_CONFLICT`.
- Una asignación contiene `openSessionId` desde la creación, aun antes del inicio. Crear otra sesión o cerrar una asignación con sesión abierta se rechaza. Para cerrar: iniciar/finalizar cualquier sesión creada, luego cerrar. La finalización no termina automáticamente la asignación.
- Crear/iniciar/finalizar/cerrar coordinan las mismas reservas. Las transiciones repetidas conservan fechas/actor y no duplican auditoría. No hay borrado histórico, reasignación implícita ni cambio de origen por PATCH de una placa.
- Cada nueva lectura de sesión por paciente fija `patientId/deviceId/assignmentId/sessionId`, exige la correspondencia activa y habilitación, y se escribe con clave, resumen y última comunicación en una transacción.
- La clave de ingestión y el hash del payload conservan el formato anterior. `deviceId` explícito se contrasta, pero no se añade al hash histórico: ya forma parte de la clave. La normalización anterior de capturedAt/null y propiedades se mantiene. Un duplicado original sigue válido tras finalizar/cambiar de placa con dispositivo habilitado.
- El historial usa grupo `measurements`, paciente y fechas; desempate por **ruta completa**, incluso con el mismo ID de medición en dos sesiones. Cursor ligado a paciente/filtros/orden; límite predeterminado 50 y máximo 100.
- La auditoría administrativa se crea junto a la mutación. Login/apertura HTTP pueden usar operaciones idempotentes. El contexto solo admite campos explícitos; no admite secretos, cuerpos ni mediciones. Las consultas periódicas no crean eventos.

## Lecturas HTTP necesarias para el dashboard

Ya conectadas en el servidor existente:

- `GET /patients`, `GET /patients/{id}`, `GET /patients/{id}/latest`, `GET /patients/{id}/measurements`.
- `POST /patients/{id}/access`: auth admin/viewer + CSRF + origen; un `viewId` por apertura. Devuelve 201 nuevo y 200 duplicado con el mismo eventId.
- El listado existente `GET /sessions` admite filtros patientId/assignmentId. El viewer consulta y no puede crear/iniciar/finalizar sesiones.

Los errores se traducen con `PersistenceError`: conflictos a 409, ausentes a 404, recursos deshabilitados/suplantación a 403 y validaciones/cursor a 400. Las lecturas `/patients` exigen admin/viewer. Listar pacientes deshabilitados exige admin. No se publican en esta entrega los CRUD HTTP administrativos ni GET de auditoría: corresponden a los módulos de Didhyer/Marielos.

`latest` lee una transacción consistente del paciente/asignación/placa/sesión y su resumen. Nunca usa el historial de la placa anterior para acreditar el estado de la actual. Sin sesión activa devuelve data:null; sin asignación también deviceOnline:false. Conexión reciente ≤45 s; muestra reciente ≤10 s; la calidad individual siempre es independiente.

## Ventana de compatibilidad que debe coordinar Sebastián

La API de ingestión aún importa el validador **legado** `measurementInputSchema`. No se cambia silenciosamente el contrato de emisores existentes. Para el corte de #27:

1. Usar `patientMeasurementInputSchema` en el router: requiere deviceId y capturedAt (nullable), y contrastar la identidad también en heartbeat.
2. Crear sesiones HTTP desde `{assignmentId}` mediante `createForAssignment`; pasar siempre actorId verificado a start/finish.
3. Adaptar simulador/firmware en la misma ventana. Mantener las claves de ingestión; no crear un endpoint alternativo ni una cola offline.
4. Migrar perfiles operator explícitamente. El runtime los reconoce temporalmente; todo perfil viewer es de consulta. El flujo anterior de creación por participantCode se conserva solo en placas sin asignación para no romper la API previa durante la integración. Debe retirarse al activar el contrato 2.0.0 completo.

La entrega no afirma que el contrato A nuevo, CRUD administrativos o auditoría de login ya estén integrados. Marielos mantiene Auth/usuarios/auditoría de accesos; los repositorios y el registro de apertura se reutilizan, no se duplican.

## Migración con respaldo y recuperación

`apps/api/src/scripts/migrate-legacy.ts` realiza inventario por páginas y **dry-run por defecto**. El manifest contiene correspondencias confirmadas a pacientes y asignaciones **ya existentes y cerradas**. No crea asignaciones ni fechas para interpretar historia ambigua.

Ejemplo sin datos reales, guardado fuera de Git:

```json
{
  "version": 1,
  "actorId": "UID_ADMIN_QUE_CONFIRMA",
  "migrateOperators": true,
  "sessions": [
    { "sessionId": "SESION_CONFIRMADA", "patientId": "PACIENTE_CONFIRMADO", "assignmentId": "ASIGNACION_CONFIRMADA" }
  ]
}
```

Desde `apps/api`, con entorno configurado y escritura de aplicaciones detenida:

```powershell
npx tsx src/scripts/migrate-legacy.ts '--manifest=C:/ruta-privada/manifest.json'
npx tsx src/scripts/migrate-legacy.ts '--manifest=C:/ruta-privada/manifest.json' --apply '--backup-dir=C:/ruta-privada/respaldos'
```

Antes de cualquier modificación, `--apply` exige guardar fuera del checkout un respaldo lógico exclusivo de las colecciones inventariadas. Un fallo del respaldo impide las mutaciones. En nube se exige además `--allow-cloud`; solo usar después de aprobación operativa, respaldo del servicio y ventana de mantenimiento. Las pruebas de esta entrega no aplican migraciones a la nube.

El inventario incluye perfiles, pacientes, dispositivos, asignaciones, sesiones, subcolecciones, claves de ingestión, auditoría y journals. Los registros sin correspondencia permanecen sin patientId, fuera de consultas de pacientes, y aparecen como no resueltos en el informe de la función; la CLI solo imprime cantidades. El respaldo conserva los originales para revisión. No se copian credenciales administrativas ni se borran claves de ingestión.

Cada lectura conserva ID, deviceId, sessionId, fechas, valores y hash original; solo se completan los dos IDs confirmados. La aplicación puede reanudarse tras un fallo y no debe ser visible a usuarios mientras esté parcial. Un journal registra cada sesión resuelta y su actor. `operator → viewer` es una degradación explícita con auditoría y journal; se revocan tokens en Auth después de guardar el rol. Si Auth falla, el perfil ya es viewer y el journal queda pendiente; repetir reintenta la revocación. No se promueve ninguna cuenta a admin ni se reactivan cuentas.

## Índices y pruebas de Standard

Se versionan índices para las combinaciones de filtros admitidas por los builders de sesiones/asignaciones/auditoría, listado de pacientes y consulta de grupo por patientId/receivedAt/ruta. El emulador prueba lógica y concurrencia, **no disponibilidad de índices compuestos en nube**. Verificar estos índices en una instancia de prueba Standard antes de cerrar los criterios de despliegue. Consultar [entorno reproducible](../setup/firebase-pl2.md).
