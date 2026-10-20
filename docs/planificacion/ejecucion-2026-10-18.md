# Plan de ejecución — alcance aprobado del 18 de octubre de 2026

Referencia normativa: [contrato aprobado](../arquitectura/contrato-aprobado-2026-10-18.md). Este plan concreta interfaces HTTP y dependencias para revisión del equipo. Estado: documentación y OpenAPI objetivo; implementación y demostración pendientes. No establece fechas nuevas ni reasigna personas automáticamente.

La [evidencia de validación documental](../evidencias/contratos-2026-10-18.md) registra las comprobaciones realmente ejecutadas sobre OpenAPI, esquemas y enlaces; no sustituye las pruebas funcionales pendientes.

## Estado observado y compatibilidad

Base publicada revisada: `b056aa4` (`main`, 19 de octubre de 2026), que ya integra el recorrido anterior de sesiones y dispositivos. La lectura de código confirmó:

| Área | Presente | Diferencia aprobada pendiente |
| --- | --- | --- |
| Auth | Cookies, CSRF, perfiles `admin|operator` | `admin|viewer`, administración de usuarios, auditoría de login |
| Ingestión | Config, heartbeat, mediciones, autenticación y deduplicación | `deviceId` explícito/contrastado, `capturedAt` obligatorio nullable, relaciones activas y cuatro IDs históricos |
| Persistencia | Sesiones por `participantCode`, mediciones en subcolección, transacciones | Pacientes duraderos, asignaciones y reservas, historial entre sesiones, auditoría e índices |
| Web API | Rutas de dispositivos/sesiones implementadas para `participantCode` y `operator` | Adaptarlas al contrato B 2.0.0, pacientes/asignaciones y permisos |
| Web | Estructura React y vistas base | CRUD, conexión a endpoints, historial por paciente, tres estados de panel |
| Simulador | Esqueleto que imprime punto de integración | Ciclo config/heartbeat/mediciones y escenarios sin cola |
| Firmware | README de hardware | Incorporar/confrontar sketch integrado externo y verificar recorrido físico |
| Entorno | npm workspaces; `engines >=22` | Alinear entorno y documentación con Node.js 24 LTS |

No se ejecutaron pruebas funcionales para producir este inventario. Presencia de módulos no acredita un flujo integrado ni un despliegue. Los OpenAPI pasan a **2.0.0** por cambios incompatibles, manteniendo `/api/v1`: describen el objetivo y marcan las operaciones pendientes. No se promete compatibilidad automática con emisores ni usuarios existentes. Coordinar una ventana de actualización; conservar Git y evidencias del contrato anterior.

## Consulta de GitHub

El 19 de octubre de 2026 se verificaron los issues existentes: #4 está cerrado; #3, #5–#12 y #20 están abiertos. Cada uno tiene un `assignee` en GitHub: respectivamente AxelHerrera11, DidhyerOrtiz, gioore, HugoX2024, Javifa2324, Lis671, Mar-03, orem6 y codsebas; #20 corresponde a Mar-03. Son responsables del **alcance anterior**, no asignaciones nuevas al trabajo del contrato 2.0.0. Los paquetes siguientes proponen continuidad técnica; la coordinación hará el reparto nuevo después de publicar y revisar este contrato.

| Paquete | Responsables del avance previo / propuesta de continuidad | Issues relacionados | Entrega / aceptación |
| --- | --- | --- | --- |
| P0 Contrato y entorno | Coordinación + integración | [#11](https://github.com/codsebas/PulsoLink/issues/11), [#12](https://github.com/codsebas/PulsoLink/issues/12) | Revisar OpenAPI 2.0.0, migración y Node 24; acordar interfaces antes de código |
| P1 Firestore y repositorios | `@gioore`, coordinación API | [#6](https://github.com/codsebas/PulsoLink/issues/6) | Modelo objetivo, reservas/transacciones, dos placas en historial de un paciente, índices y migración probados |
| P2 API de negocio e ingestión | `@DidhyerOrtiz` (asignado en #5); coordinación de ingestión `@codsebas` | [#5](https://github.com/codsebas/PulsoLink/issues/5), contrato A existente | Validar credencial/deviceId y relaciones; CRUD, sesiones y consultas; errores y concurrencia |
| P3 Auth y auditoría | `@Mar-03` + persistencia | [#10](https://github.com/codsebas/PulsoLink/issues/10) | Migrar operator a viewer sin elevar permisos; negar mutaciones/auditoría al viewer; login y apertura auditados |
| P4 CRUD y navegación | `@AxelHerrera11`, `@Lis671`; coordinación UI `@Mar-03` | [#3](https://github.com/codsebas/PulsoLink/issues/3), [#9](https://github.com/codsebas/PulsoLink/issues/9), [#20](https://github.com/codsebas/PulsoLink/issues/20) | Pacientes, placas, asignaciones, usuarios/admin; carga, validación, error y permisos visibles |
| P5 Monitoreo e historial | `@Javifa2324`, `@Lis671` | [#8](https://github.com/codsebas/PulsoLink/issues/8), [#9](https://github.com/codsebas/PulsoLink/issues/9), [#20](https://github.com/codsebas/PulsoLink/issues/20) | Tres estados de panel y tendencias entre sesiones/placas; null sin cero; intervalos sin conexión visibles |
| P6 Simulador y QA | `@HugoX2024`, `@orem6` | [#7](https://github.com/codsebas/PulsoLink/issues/7), [#11](https://github.com/codsebas/PulsoLink/issues/11) | Mismo contrato A; errores, duplicados, cambio de placa y caída sin cola reproducibles |
| P7 Firmware e integración física | `@codsebas` | [#12](https://github.com/codsebas/PulsoLink/issues/12) | Sketch integrado, HTTPS verificado y muestra real visible en web, sin secretos |

Los issues existentes describen el avance anterior: actualizar su alcance o abrir issues sucesores enlazados **después de que la coordinación confirme el reparto**. No cerrarlos ni reasignarlos por inferencia. #20 pide validación de diseño con el equipo antes de consolidar cambios visuales. Esta rama no crea ni modifica issues.

## Secuencia y entregables

1. **P0:** revisar este PR documental, campos HTTP y reservas; fijar ventana de compatibilidad y datos de prueba. Contratos antes de implementación.
2. **P1 + base P3:** implementar modelo, reservas e índices; migración explícita de roles y relaciones. Primero pruebas de exclusividad concurrente, deduplicación e historia inmutable.
3. **P2 + P3:** integrar repositorios en el servidor existente, aplicar permisos y auditoría; probar consultas por paciente y acceso manual sin privilegios. Preparar ejemplos de respuesta estables para frontend.
4. **P4 + P5 + P6:** desarrollar contra contrato acordado y después API real. Simulador y firmware se adaptan conjuntamente a los nuevos campos; no crear otro endpoint ni servidor.
5. **P6 + P7:** ejecutar demostración reproducible en emuladores y, cuando exista acceso, entorno de prueba Standard y placa física. Identificar claramente qué evidencia corresponde a cada entorno.

Cada paquete requiere rama `feat/*`, `fix/*` o `chore/*`, PR enlazado, comandos reales, resultado y evidencia breve sin secretos. Coordinar archivos compartidos (OpenAPI, tipos, índices, lockfile) y no asumir trabajo ajeno terminado. La actualización documental no implementa ni cierra paquetes P1–P7.

## Interfaces concretadas para implementación

- Sesión nueva: `{assignmentId}`; backend resuelve paciente/dispositivo/origen. Se elimina `participantCode` como entrada de identidad para nuevas sesiones. Reutilizar rutas start/finish/latest/history.
- Asignación: `{patientId,deviceId}`; dos reservas atómicas, una por paciente y placa. Cierre exige sesiones finalizadas; repetir cierre conserva fecha. Ver [modelo](../../firebase/modelo-objetivo.md).
- CRUD: creación y PATCH de paciente/placa/usuario; deshabilitar con `enabled:false`, sin borrado histórico. Cambiar origen de placa con historia queda excluido. Deshabilitar paciente/placa ocupados devuelve 409 hasta cerrar asignación.
- `deviceId` obligatorio tanto en mediciones como en heartbeat; GET config toma identidad solo de credencial. La especificación aprobada exige el campo en mediciones; incluirlo también en heartbeat concreta el requisito de identificar la placa en cada cuerpo del contrato A.
- `POST /patients/{id}/access` con `viewId` por apertura registra auditoría una sola vez por actor/paciente/apertura. Polling no llama esta operación. Login registra evento y resultado desde servidor. `GET /audit-logs` solo admin.
- Historial por paciente: grupo de colecciones, paginación por cursor ligado a filtros y orden `receivedAt DESC, ruta DESC`; from inclusivo/to exclusivo. La gráfica ordena ascendente, mantiene huecos, no une tramos desconectados y no carga todo el expediente cada 2 s.
- Panel: `deviceOnline`, `ageMs`, `stale`, calidad individual y `connectionState`. `disconnected` si no hay comunicación ≤45 s; `connected_without_valid_reading` si no hay muestra reciente ≤10 s o ninguna magnitud válida; `connected_with_recent_reading` si al menos una magnitud es válida y reciente. La validez de una magnitud no oculta la falta de contacto de otra. Una sesión finalizada se muestra como histórica.

## Migración y riesgos a resolver antes de desplegar

- Respaldar datos e inventariar perfiles/sesiones/mediciones; probar una migración repetible antes de modificar un entorno compartido.
- `operator → viewer` con aprobación operativa del reparto; ningún ascenso automático a admin. Actualizar scripts, validadores, guards web/API y sesiones/caché para aplicar el rol nuevo efectivamente.
- Mapear legado por correspondencia confirmada de paciente; no asumir que `participantCode` es único ni que una placa identifica a una persona. Aislar lo no resuelto hasta revisión y conservar historia original.
- Mantener hashes/claves de ingestión existentes. Normalizar nueva entrada sin invalidar un reintento ya almacenado; decidir compatibilidad por versión/ventana antes de activar validadores estrictos.
- Crear índices a partir de consultas implementadas y comprobarlos en Standard; el emulador no demuestra disponibilidad de índices.
- Operaciones Auth/Firestore no son una transacción única: definir compensación, reintento idempotente y auditoría de resultado antes de administración de usuarios.
- Sin aplicación móvil, alarmas clínicas, validación médica ni datos reales de pacientes en esta fase. No declarar producción lista por pasar pruebas de emulador.

## Recorrido de aceptación pendiente

- [ ] Placa no registrada/deshabilitada o credencial incorrecta: rechazo sin nuevas mediciones.
- [ ] Placa autenticada con otro `deviceId`: 403 `DEVICE_ID_MISMATCH`, sin escritura.
- [ ] Paciente/asignación/sesión incompatibles o inactivos: rechazo; concurrencia no crea doble asignación/sesión activa.
- [ ] Duplicado idéntico: 200 y misma referencia; contenido diferente: 409; también después de finalizar/reasignar para muestras ya recibidas.
- [ ] Paciente A recibe muestras de placa 1; finalizar/cerrar; asignar placa 2; historial paginado por paciente conserva ambos tramos e IDs originales. Paciente B no recibe los de A.
- [ ] Cortar red: cesan heartbeat/muestras; esperar umbrales; reconectar: hueco sin muestras atrasadas ni cola.
- [ ] Sin dedo: ópticos null/no_contact; temperatura independiente. Invalid/unavailable no se convierten en cero. Estados de conexión/calidad visibles y distintos.
- [ ] Viewer consulta pacientes/historial pero sus POST/PATCH administrativos y GET auditoría devuelven 403 aunque se llamen manualmente. Sin cookie: 401; mutación sin CSRF: 403.
- [ ] Login y apertura de expediente generan eventos mínimos; repetir viewId no duplica; refrescos de dos segundos no producen nuevos accesos. Solo admin ve logs.
- [ ] Tipos/build y pruebas apropiadas pasan; evidencia indica comandos, entorno y limitaciones. UI identifica simulación y prototipo no clínico.

Comandos base para la futura implementación, desde raíz PowerShell: `npm ci`, `npm run typecheck`, `npm run build`, `npm run lint`. Para pruebas de API con emuladores seguir [Firebase](../../firebase/README.md); no asumir que una suite omitida por falta de emulador pasó. La placa física exige evidencia adicional a cualquier prueba del simulador.
