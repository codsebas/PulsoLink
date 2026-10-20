# PulsoLink — contrato de arquitectura y plan de ejecución

**Estado:** aprobado por la coordinación del proyecto el 18 de octubre de 2026.
**Propósito:** servir como especificación de trabajo para el equipo y como contexto autónomo para una futura sesión de Codex abierta sobre el repositorio.
**Repositorio:** https://github.com/codsebas/PulsoLink

> Documento aprobado conservado como referencia normativa. Su revisión remota original no acredita el estado actual del checkout. La implementación, migración y decisiones de interfaz HTTP se detallan en [el plan vigente](../planificacion/ejecucion-2026-10-18.md) y en los OpenAPI 2.0.0.

## 1. Objetivo y límites

PulsoLink es un **prototipo académico, no clínico**. Una NodeMCU ESP8266 obtiene temperatura del DS18B20 y señales del MAX30102 para estimar BPM y SpO₂. El dispositivo envía lecturas a una API; esta valida, identifica la placa, relaciona la lectura con el paciente correcto y la guarda en Cloud Firestore. La web muestra pacientes conectados, estados y evolución histórica. Ninguna cifra del prototipo debe presentarse como diagnóstico ni como dato clínicamente validado.

La coordinación del proyecto se encarga del **firmware de NodeMCU y de comprobar la integración dispositivo → API → web**. El resto del equipo implementa persistencia, API de negocio, CRUD, autenticación, monitoreo, auditoría y pruebas. El objetivo de este documento es darles una estructura y criterios comunes, no reemplazar la planificación de entregas del equipo.

### Decisiones cerradas

1. El historial pertenece al **paciente**, aunque se le cambie la placa. Cada lectura conserva los identificadores de paciente, placa, asignación y sesión válidos cuando se recibió; nunca se reescribe por una reasignación posterior.
2. Solo placas registradas, habilitadas y autenticadas pueden enviar lecturas. El identificador físico o MAC de la NodeMCU puede ayudar a registrarla, pero **no es una credencial**.
3. La NodeMCU **no almacena ni reenvía lotes de lecturas producidas sin conexión**. Puede seguir leyendo localmente durante el corte, pero descarta esas muestras. Al reconectar solo envía lecturas nuevas y la gráfica deja visible el intervalo sin datos. Se permite únicamente resolver un reintento inmediato de la misma petición en curso mediante la idempotencia existente; no se crea cola persistente ni se reproduce un periodo desconectado.
4. El personal `admin` registra y administra pacientes, placas, asignaciones y usuarios; también consulta mediciones y auditoría. Médico/enfermería usa un rol de **solo consulta** (`viewer` propuesto) para dashboard, pacientes e historial. La API aplica estos permisos: ocultar botones en la web no basta.
5. La auditoría, visible solo para administración, registra inicios de sesión, consultas a expedientes de pacientes y cambios administrativos. Registrar la apertura de una vista de paciente, no cada refresco automático de dos segundos.
6. El panel distingue **desconectado**, **conectado sin contacto/lectura válida** y **conectado con lectura reciente**. La conexión no demuestra que haya un dedo ni que los signos calculados sean confiables.
7. La configuración de Wi-Fi la realiza personal de la clínica para este prototipo. Una aplicación móvil de aprovisionamiento queda fuera del alcance actual.

## 2. Estado del repositorio que debe respetarse

La revisión remota del repositorio encontró una base real en TypeScript/Express, React y Firebase: autenticación, dispositivos, sesiones, recepción de mediciones, persistencia, simulador y contratos OpenAPI. El [contrato de dispositivo](https://github.com/codsebas/PulsoLink/blob/main/contracts/device.openapi.yaml) define configuración, heartbeat y recepción de lecturas; la [persistencia actual](https://github.com/codsebas/PulsoLink/blob/main/firebase/README.md) usa sesiones y subcolecciones de mediciones. El [router de ingestión](https://github.com/codsebas/PulsoLink/blob/main/apps/api/src/modules/measurements/device-measurements.router.ts) y el [repositorio de mediciones](https://github.com/codsebas/PulsoLink/blob/main/apps/api/src/modules/measurements/measurements.repository.ts) ya autentican y procesan parte del recorrido. El README o la planificación antigua pueden describir un estado anterior: verificar el checkout y los issues vigentes antes de cambiar código.

**Diferencia con el alcance aprobado:** el prototipo actual se centra en `participantCode` y sesiones; aún hay que modelar el paciente duradero, el historial de asignaciones, la consulta histórica por paciente, la auditoría y el rol clínico de solo lectura. La carpeta de firmware todavía debe confrontarse con el sketch integrado probado fuera del repositorio. Se debe ampliar la base existente, no duplicar servidores ni crear una segunda ruta de ingestión.

## 3. Modelo Firestore aprobado

Firestore organiza datos en **colecciones y documentos**, no en tablas relacionales. Los identificadores de documentos son estables y opacos. Usar fechas UTC generadas o normalizadas por el backend; la interfaz puede presentarlas en hora local. Los datos de prueba deben ser seudónimos y mínimos.

| Ruta | Campos mínimos | Regla |
| --- | --- | --- |
| `users/{uid}` | `displayName`, `role: admin\|viewer`, `enabled`, `createdAt` | Perfil asociado a Firebase Authentication. Migrar el permiso `operator` existente de forma explícita. |
| `patients/{patientId}` | `code`, `displayName` o alias, `enabled`, `createdAt`, `updatedAt` | Identidad histórica del paciente; no usar la placa ni `participantCode` como llave del expediente. |
| `devices/{deviceId}` | `code`, `hardwareId` opcional, `source: real\|simulated`, `enabled`, `activeSessionId`, `lastSeenAt` | Código registrable y estado de comunicación. Un dispositivo tiene como máximo una sesión activa. |
| `deviceCredentials/{credentialId}` | `deviceId`, hash del secreto, estado/revocación, fechas | Solo servidor. No guardar ni exponer el secreto en texto claro. |
| `assignments/{assignmentId}` | `patientId`, `deviceId`, `startedAt`, `endedAt: null\|fecha`, `assignedBy`, `endedBy` | Historial de asignación. A lo sumo una asignación activa por placa y, para este prototipo, una por paciente. Cierre y alta incompatibles deben protegerse en transacción. |
| `sessions/{sessionId}` | `patientId`, `deviceId`, `assignmentId`, `status`, `createdAt`, `startedAt`, `finishedAt`, `latestMeasurement` | Periodo de monitoreo. Solo una sesión activa por placa. Se asocia a una asignación activa antes de comenzar. |
| `sessions/{sessionId}/measurements/{measurementId}` | `patientId`, `deviceId`, `assignmentId`, `sessionId`, `receivedAt`, `capturedAt`, `bootId`, `sequence`, `measurements`, `source` | Una lectura por documento. Los cuatro identificadores se fijan al guardar; no editar historia al reasignar. `receivedAt` del servidor es la hora autoritativa. |
| `ingestionKeys/{keyHash}` | hash de contenido, ID y fecha de la medición | Mantener la deduplicación transaccional existente por dispositivo + arranque + secuencia. |
| `auditLogs/{eventId}` | `actorId`, `action`, `targetType`, `targetId`, `occurredAt`, resultado y contexto mínimo | Eventos inmutables. No copiar lecturas ni secretos en el log. Solo admin consulta la colección. |

La gráfica por paciente debe consultar sus mediciones ordenadas por `receivedAt` **a través de todas sus sesiones**, con paginación y filtros de fechas. Conservar la subcolección actual y añadir `patientId` a cada medición permite una consulta de grupo de colecciones; el responsable de Firebase definirá el índice compuesto necesario y verificará esa consulta con datos de dos placas distintas. Evitar arrays crecientes dentro de `patients` o `sessions`. El resumen `latestMeasurement` sí puede seguir siendo un único objeto acotado.

## 4. Contrato dispositivo ↔ API

### Flujo

1. Personal autorizado registra la placa y provisiona su credencial; el secreto se entrega fuera de Git. No derivar autenticación de la MAC.
2. La placa consulta `GET /api/v1/device/config` para obtener `activeSessionId` e intervalos. Si no hay sesión activa, solo envía heartbeat y consulta configuración; no atribuye mediciones a un paciente por su cuenta.
3. Envía `POST /api/v1/device/heartbeat` para comunicar presencia. Envía una muestra nueva a `POST /api/v1/device/measurements` cuando hay sesión, Wi-Fi y lectura disponible. La frecuencia base existente es aproximadamente cada **2 segundos**, ajustable desde la configuración de API.
4. La API autentica la credencial, obtiene de ella el `deviceId`, comprueba que el `deviceId` declarado coincida, y verifica sesión, asignación y paciente activos antes de guardar. **El firmware no envía `patientId` ni decide la relación clínica.**
5. Un cambio de placa cierra la sesión y asignación anteriores y abre las nuevas mediante las operaciones administrativas correspondientes. Lo ya guardado queda intacto.

### Forma acordada de la muestra

El esquema existente ya exige `sessionId`, `bootId`, `sequence` y los tres objetos de medición. **Cambio de contrato pendiente de implementar:** incluir `deviceId` explícito en el JSON porque se acordó que la placa lo envíe en cada petición; el servidor debe contrastarlo con el dispositivo autenticado, nunca confiar solo en el campo. Mantener un campo `capturedAt` en el JSON: fecha UTC ISO 8601 si el reloj está sincronizado, o `null` si no lo está; el servidor siempre crea `receivedAt`. Se debe actualizar OpenAPI, validadores, simulador y pruebas de forma coordinada.

```json
{
  "deviceId": "pulsolink-001",
  "sessionId": "sesion-activa",
  "bootId": "550e8400-e29b-41d4-a716-446655440000",
  "sequence": 42,
  "capturedAt": null,
  "measurements": {
    "heartRate": { "value": 78, "unit": "bpm", "status": "valid" },
    "spo2": { "value": null, "unit": "%", "status": "invalid" },
    "skinTemperature": { "value": 27.1, "unit": "C", "status": "valid" }
  }
}
```

Los estados técnicos conservan los valores actuales `valid`, `no_contact`, `invalid` y `unavailable`. Cuando el estado no es `valid`, `value` debe ser `null`, jamás cero inventado. La API valida unidades, tipos, rangos técnicos, sesión y credencial; un número dentro del rango no equivale a una medición clínica confiable. La temperatura del DS18B20 se presenta como **temperatura del sensor/superficial**, no como temperatura corporal central.

La placa usa HTTPS con verificación del servidor para la API desplegada, evita imprimir secretos en el monitor serie y no sube credenciales a Git. En desarrollo local, documentar cómo se conecta el dispositivo al servidor de pruebas sin reemplazar la verificación de seguridad por una configuración insegura en producción.

## 5. API web, permisos y estados

La web consume exclusivamente la API, no Firestore de forma directa. El backend mantiene los permisos aunque alguien llame los endpoints manualmente.

| Capacidad | Admin | Personal de consulta |
| --- | --- | --- |
| Ver dashboard, pacientes, lecturas y gráfica | Sí | Sí |
| Crear/editar/deshabilitar pacientes y placas | Sí | No |
| Asignar/reasignar placas y controlar sesiones | Sí | No |
| Crear/deshabilitar usuarios y cambiar roles | Sí | No |
| Ver auditoría | Sí | No |

Para la siguiente versión hacen falta endpoints de pacientes, asignaciones, usuarios/auditoría y consultas de historial **por paciente**. Reutilizar rutas de dispositivos/sesiones donde sea posible, y versionar los cambios del [contrato web](https://github.com/codsebas/PulsoLink/blob/main/contracts/web.openapi.yaml). El rol `operator` actual permite operaciones de sesiones: revisar/migrar esa autorización para cumplir el permiso de solo lectura aprobado. Ninguna petición de lectura debe usar el ID de placa como sustituto de `patientId`.

El estado del panel se determina con la última comunicación (`lastSeenAt`) y la edad de la última muestra; la API actual considera conexión reciente dentro de **45 segundos** y lectura no obsoleta dentro de **10 segundos**. Añadir el estado de contacto/calidad sin confundirlo con conectividad. Los intervalos son parámetros técnicos revisables, no umbrales médicos.

## 6. Paquetes de trabajo para delegar

Las personas concretas se confirman contra las asignaciones e issues actuales del repositorio antes de repartir o reasignar. Los paquetes son independientes donde sea posible y cada entrega debe tener PR, comandos de verificación y evidencia breve. No publicar credenciales ni datos reales de pacientes.

| Paquete / responsable funcional | Resultado aceptable | Dependencia principal |
| --- | --- | --- |
| **Firmware y coordinación de integración — coordinación del proyecto** | NodeMCU con lectura integrada, JSON conforme al contrato actualizado, autenticación, config/heartbeat, envío de muestras nuevas, descarte al perder red; prueba real hasta ver la lectura en la web. | Contrato de ingestión y servidor accesible. |
| **Firestore y repositorios** | `patients`, `assignments`, identificadores históricos en sesiones/lecturas, índices y auditoría; transacciones que impiden asignaciones incompatibles; consulta paginada por paciente, probada con cambio de placa. | Modelo de esta especificación. |
| **API de negocio e ingestión** | Validaciones, contraste `deviceId`/credencial, relación sesión-asignación-paciente, endpoints administrativos y de consulta; errores claros; idempotencia y permisos probados. | Repositorios y contratos. |
| **CRUD y navegación web** | Pantallas de pacientes, PulsoLinks, asignaciones y personal/usuarios, con carga, validación, error y permisos visibles. | Endpoints web. |
| **Monitoreo e historial web** | Dashboard con estados diferenciados y vista por paciente con evolución temporal a través de distintas placas; `null` se muestra sin dato, no como cero. | Consultas por paciente. |
| **Autenticación y auditoría** | Rol admin frente a rol de consulta aplicado en API, registro de accesos a expedientes e inicios de sesión, vista de logs solo admin. | Identidades y operaciones web. |
| **Simulador y calidad/integración** | Simulador adaptado al mismo contrato; pruebas de dos placas para un paciente, reasignación, caída de red sin cola, credencial inválida, muestra duplicada y pérdida de contacto. | API y persistencia. |

### Secuencia recomendada

1. En una nueva sesión de Codex, abrir el checkout del repositorio, leer `AGENTS.md` si existe, README, contratos, estado de Git, issues y PR activos. Conservar el trabajo de otros; no asumir que esta revisión remota sigue vigente.
2. Publicar o actualizar **un contrato único**: modelo, cambios OpenAPI de dispositivo y web, responsabilidades e issues. Coordinar los campos exactos antes de implementar en paralelo.
3. Implementar persistencia e ingestión con pruebas de invariantes; después consultas por paciente y permisos; luego interfaces y firmware. El simulador debe seguir el mismo contrato que la placa real.
4. Hacer una demostración integral: paciente A con placa 1, muestras visibles; cambiarlo a placa 2; su gráfica conserva ambos tramos. Durante corte de red no aparecen muestras atrasadas. Personal de consulta no puede mutar datos ni consultar auditoría.

## 7. Criterios finales de aceptación

- Una placa no registrada, deshabilitada o con credencial incorrecta no ingresa mediciones.
- Una placa autenticada no puede suplantar otro `deviceId` en el JSON.
- Una muestra nueva solo se guarda si la sesión y asignación corresponden al dispositivo y paciente activos; queda una sola vez aunque se repita la misma petición.
- La reasignación nunca cambia la pertenencia de lecturas anteriores. El historial del paciente se ve continuo al cambiar de placa.
- La desconexión produce un hueco temporal real; no se envía una cola de datos atrasados al volver la red.
- Sin dedo o con dato inválido se almacena `null` con estado; no se muestra cero como lectura.
- El personal clínico puede consultar pero no administrar; solo admin ve auditoría.
- Se puede repetir la demostración con emuladores o un entorno de prueba sin secretos en el repositorio, y la interfaz declara que es un prototipo no clínico.

## 8. Pendientes que no bloquean este contrato

La aplicación móvil para configurar Wi-Fi, alarmas clínicas, validación médica de precisión y operación con datos de pacientes reales no forman parte de esta fase. La asignación de personas, fechas y PR concretos se hace contra el estado actual de GitHub, no se deduce automáticamente de este documento.
