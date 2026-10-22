# Revisión independiente de Didhyer — contrato, negocio y concurrencia

**Fecha:** 22 de octubre de 2026. **Base final:** `main` `394b3a3`, rama local `fix/didhyer-contract-qa`. Windows PowerShell, Node 24.19.0, Java 21.0.10, Auth y Firestore Standard **emulados** en un proyecto `demo-`. Ninguna escritura de esta revisión fue a cloud ni a una NodeMCU real. No se cerró ni reabrió ningún issue.

## Contrato #27 y decisiones integradas durante la revisión

Los PR [#66](https://github.com/codsebas/PulsoLink/pull/66) y [#65](https://github.com/codsebas/PulsoLink/pull/65) avanzaron `main` mientras se verificaba el corte anterior. **No se envía una interpretación competidora del contrato:** #66 decidió aceptar `capturedAt` con offset y normalizarlo a UTC, además de prohibir `.` y `..` en OpenAPI y documentar los códigos reales. Se descartaron los cambios locales que exigían solo `Z` en `capturedAt`. Esta rama añade:

- **Regresiones HTTP:** un offset llega normalizado al repositorio; un `sessionId` o `assignmentId` igual a `.` o `..` responde 400 sin crear datos.
- **Regresiones HTTP con emuladores** en `pl2-business-api.test.ts`: asignación con paciente deshabilitado → 403 `RESOURCE_DISABLED`; cerrar una asignación en uso → 409 `ASSIGNMENT_IN_USE`; finalizar una sesión `created` → 409 `INVALID_SESSION_STATE`; cursor de otro paciente → 400 `INVALID_CURSOR`. Las pruebas de #66 validan el mapeo de códigos, pero no estos casos por HTTP real.
- **Ubicación de códigos en el catálogo OpenAPI**, sin cambiar códigos ni comportamiento: cada código queda bajo el HTTP que devuelve `error-handler.ts`. `INVALID_SESSION_STATE` sale de 400 (es 409); `RESOURCE_DISABLED` sale de 409 (es 403, ya listado allí); en el contrato web `DEVICE_DISABLED` pasa de 401 a 403 (`web-routes.ts`) y `DEVICE_ID_MISMATCH` sale de 403 porque solo aplica a la API de dispositivo; se documentan `TOO_MANY_ATTEMPTS` (429), `AUTH_UNAVAILABLE` y `AUTH_SYNC_PENDING` (503), que el login ya devuelve.

## Comprobaciones ejecutadas

```powershell
npm ci --offline --no-audit
npm run typecheck
npm run build
npm run test --workspace=apps/api -- test/device-api.test.ts test/sessions-api.test.ts test/contract-alignment.test.ts
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx --offline -y firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api -- --maxWorkers=2'
```

`npm ci` con auditoría de red quedó esperando dos veces; desde la caché, sin cambiar lockfile, instaló las dependencias. Tipos y compilación pasaron; Vite advirtió un bundle web mayor a 500 KiB. Las pruebas HTTP y de contrato focales: **48 aprobadas, una de Firestore omitida sin emuladores**. Con los emuladores: **253/253 API aprobadas en 28 archivos**, incluida la nueva carrera transaccional de #65 bajo 5000 ms. La prueba con identidades ficticias de aprovisionamiento físico también pasó; no se creó ninguna credencial para una placa real.

### Navegador y administración, sin respuestas fabricadas

Una ejecución independiente de `tools/firebase/verify-patient-integration.ps1 -SkipChecks` usó Edge, Vite, API real y ambos emuladores desechables. Recorrió **1120 lecturas distintas, máximo 1000 filas visibles**, regreso a recientes, dos placas, tres estados de conexión, viewer 403, apertura auditada, logout y las dos pruebas web HTTP autenticadas. Una segunda ejecución con `PULSOLINK_UI_ACCEPTANCE_ONLY=true` aprobó **17 comprobaciones** de los verificadores versionados: 360/768/1440 px, teclado/Escape/foco, selectores con más de 100 pacientes, crear/iniciar/finalizar sesión, reasignación sin alterar IDs históricos, conflictos de deshabilitación, usuarios y auditoría. Las capturas y el JSON resultante quedaron solo en un directorio temporal externo al checkout. No se modifica el issue #33, que ya estaba cerrado.

## #51: contraste HTTP independiente tras el merge de #65

La prueba transaccional de #65 pasó bajo 5000 ms en esta máquina, pero no equivale al presupuesto **HTTP del emisor**. Se volvió a ejecutar el escenario oficial `runJointCases` con la API y los emuladores reales mediante `tools/qa/didhyer-concurrency-budget.cjs`. Este wrapper solo modifica **en memoria el límite del caso QA**, no el timeout del producto, el ejecutor normal ni los repositorios. Exige ambos hosts locales, API local, proyecto `demo-`, `QA_ALLOW_WRITES=true` y las variables de fixture de [la guía de Hugo](../qa/pl2-08-hugo.md).

| Presupuesto QA | Corridas independientes | JOINT-CON-17 | JOINT-CONC-08 | A-17 |
| --- | --- | --- | --- | --- |
| 5000 ms | 3 fixtures nuevos | PASS 3/3 | **FAIL 3/3**: alguna respuesta no llegó a tiempo; la carrera queda sin resultado verificable | PASS 2; BLOCKED 1 |
| 30000 ms | 1 fixture nuevo | PASS | PASS, 3 rondas y ACK/historial cotejados | BLOCKED con presupuesto general de 5000 ms |

Los reportes de estas cuatro ejecuciones permanecen fuera del repositorio en el directorio temporal local `opencode/pl2-concurrency-newmain-*.json`; no guardan cookies, contraseñas ni secretos. Para reproducir, preparar el fixture `seed-simulator-qa.ts` según la guía de Hugo, compilar simulador/API y levantar la API apuntando al mismo emulador. Con las variables privadas del fixture ya cargadas, `QA_PERMISSIONS=false` y `QA_REPORT` apuntando **fuera del checkout**, ejecutar:

```powershell
$env:QA_CONCURRENCY_TIMEOUT_MS = '5000'
node tools/qa/didhyer-concurrency-budget.cjs
# En otro emulador desechable nuevo, control:
$env:QA_CONCURRENCY_TIMEOUT_MS = '30000'
node tools/qa/didhyer-concurrency-budget.cjs
```

Un timeout de cliente no demuestra corrupción, deadlock o la causa exacta del tiempo de respuesta. La observación aplica al emulador local y **requiere revisión de Sebastián**, responsable de #51; el issue figura cerrado por el PR #65 y no se cambió su estado en esta revisión. No modificar de nuevo las transacciones sin acordar el criterio y conservar atomicidad, idempotencia y cuatro IDs históricos.

## Aceptación y límites externos

- **#25/#26/#28:** se reprodujeron pruebas de Auth/persistencia en emulador y navegación local. La evidencia cloud de Gerson (#63) existe, pero en este equipo no hay `FIREBASE_PROJECT_ID`, ADC ni clave web configurados para una nueva ejecución de nube. La aceptación formal de cada responsable y el entorno final siguen siendo decisiones del equipo.
- **#30:** el verificador de administración cargó opciones más allá de 100 pacientes y conservó el historial tras cambiar de placa. No se ejecutó aquí la escala de más de 50 asignaciones activas; no se duplicaron pantallas ni repositorios de Lis.
- **#35:** el aprovisionamiento seguro real está documentado en `docs/setup/placa-fisica-aprovisionamiento.md`. Solo se ejecutaron sus regresiones sintéticas en emuladores; faltan identificar la NodeMCU concreta, cargar el secreto por canal privado y validar firmware/HTTPS/lectura física junto a Gerson y Sebastián.
- El [PR #60](https://github.com/codsebas/PulsoLink/pull/60) de Javier modifica políticas de historial y automatización, pero seguía pendiente de integración al ejecutar esta QA. No se mezcló con esta rama ni se declararon aprobados criterios futuros basados en ese PR.
