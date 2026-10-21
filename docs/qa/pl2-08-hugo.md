# PL2-08: matriz HTTP y escenarios de Hugo

Responsable: HugoX2024. Issues #32 y #44; apoyo #33 y #35.
Fuentes: contratos A/B 2.0.0, arquitectura aprobada y AGENTS.md.
Complementa [la matriz de Axel](pl2-08-matriz-api-permisos.md); no sustituye sus casos de permisos/CSRF/concurrencia.

## Ejecución y fixture

Se elige Node.js 24.15.0 (`fetch` y `Promise.all`) para ejecutar la misma colección desde Windows/PowerShell y macOS.
Es una decisión de implementación de esta entrega; no se afirma que Axel haya aprobado el reparto.
La matriz usa IDs A-/B-/JOINT- para evitar colisiones con AUTH-/ROL-/CON-/CONC-/UI-.

Preparación reproducible, desde la raíz, en PowerShell:

```powershell
npm ci
# Terminal 1: proyecto desechable independiente de la suite de pruebas
npx -y firebase-tools@15.34.0 emulators:start --config firebase/emulators.test.json --project demo-pulsolink-hugo --only firestore,auth
```

Terminal 2 (Node 24.15.0, Java 21; guardar las variables solo en esta sesión):

```powershell
$env:FIREBASE_PROJECT_ID='demo-pulsolink-hugo'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:18080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099'
$env:COOKIE_SECURE='false'
$env:FIREBASE_WEB_API_KEY='demo-local'
$env:DEMO_FIXTURE_PASSWORD=(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))")
$env:DEMO_DEVICE_SECRET=(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
npx tsx apps/api/src/scripts/seed-simulator-qa.ts
```

El aprovisionamiento es del backend, protegido por `assertDisposableEmulators`: solo ambos hosts locales y proyecto `demo-`; sin cuenta de servicio. Reutiliza las funciones existentes, no sobrescribe identidades ni rota credenciales. Repetir con las mismas variables. Para reiniciar con otras, utilizar emuladores desechables nuevos, nunca borrar un proyecto compartido. El ID usado al arrancar Firebase CLI debe coincidir con FIREBASE_PROJECT_ID para el login REST.

Fixture: admin/viewer, pacientes `demo-patient-a`/`demo-patient-b`, historial de A con dos placas y 48 lecturas; `demo-device-2` autenticada por `demo-credential-2`, sesión `demo-session-2` activa; `monitor-patient` contiene 240 lecturas en dos placas para paginación. Usuario/paciente/placa deshabilitados adicionales quedan a coordinar con Axel/Gerson para su matriz.

Arrancar API (`npm run dev:api`) con las variables anteriores en otra terminal y web (`npm run dev:web`). En la terminal que conserva los secretos:

```powershell
$env:DEVICE_ID='demo-device-2'
$env:DEVICE_CREDENTIAL_ID='demo-credential-2'
$env:DEVICE_SECRET=$env:DEMO_DEVICE_SECRET
$env:QA_JOINT_DEVICE_SECRET=$env:DEMO_DEVICE_SECRET
$env:QA_ALLOW_WRITES='true'
$env:QA_ADMIN_EMAIL='demo-admin@example.invalid'
$env:QA_VIEWER_EMAIL='demo-viewer@example.invalid'
$env:QA_PASSWORD=$env:DEMO_FIXTURE_PASSWORD
$env:QA_ENVIRONMENT='Windows; emuladores locales; demo-pulsolink-hugo'
$env:QA_REPORT=Join-Path (Get-Location) 'docs/evidencias/hugo-pl2-http.json'
npm run qa --workspace=tools/device-simulator
```

Cada ejecución genera un bootId nuevo. Puede escribir muestras sintéticas; usar exclusivamente fixtures. Código de salida: 0 todo aprobado, 1 fallos, 2 bloqueos sin fallos. El JSON registra esperado, obtenido, estado y requestId cuando está disponible en formato seguro; excluye cuerpos, mensajes arbitrarios, contraseñas, cookies y tokens. No convertir una validación rechazada por el esquema antiguo en un falso positivo de una prueba negativa: A-08–17 requieren primero A-07 aprobado.

## Matriz

Resultados efectivamente obtenidos: [JSON HTTP](../evidencias/hugo-pl2-http.json). Preparación común: fixture anterior y credenciales de entorno. En A-07–17 la sesión debe estar activa y ligada a la placa autenticada.

| ID | Petición / entrada | Esperado |
| --- | --- | --- |
| A-01 | GET config sin Authorization | 401 UNAUTHENTICATED |
| A-02 | GET config credencial incorrecta | 401 UNAUTHENTICATED |
| A-03 | GET config credencial vigente | 200, identidad/sesión e intervalos |
| A-04 | POST heartbeat con otra deviceId | 403 DEVICE_ID_MISMATCH |
| A-05 | POST heartbeat oficial | 200, data.serverTime sin campos extra |
| A-06 | POST medición con otra deviceId | 403 DEVICE_ID_MISMATCH |
| A-07 | POST MeasurementInput normal | 201, referencia/fecha y duplicate:false |
| A-08 | Repetir exactamente A-07 | 200, misma referencia/fecha, duplicate:true |
| A-09 | Misma clave A-07 con pulso cambiado | 409 IDEMPOTENCY_CONFLICT |
| A-10 | no_contact, ópticos null, temperatura válida | 201 |
| A-11 | unavailable con valores null | 201 |
| A-12 | invalid con valores null | 201 |
| A-13 | Pulso con unidad C | 400 VALIDATION_ERROR |
| A-14 | patientId añadido por emisor | 400 VALIDATION_ERROR |
| A-15 | sequence decimal | 400 VALIDATION_ERROR |
| A-16 | no_contact con valor numérico | 400 VALIDATION_ERROR |
| A-17 | 3 rondas de 5 POST idénticos concurrentes | En cada ronda 1 creación, 4 duplicados y una referencia |
| B-01 | PATCH paciente como viewer | 403; no escritura |
| B-02 | GET audit-logs como viewer | 403 |
| B-03 | GET historia A como viewer | 200 |
| B-04 | GET historia A, páginas de 10 hasta agotar | Dos placas, cuatro IDs, sin duplicados ni pérdida |
| B-05 | GET historia B | No contiene lecturas de A |
| B-06 | GET assignments como admin | 200; precondición para ciclo de reasignación |

## Escenarios conjuntos y pendientes explícitos

Los dos casos ya están automatizados en `tools/device-simulator/src/qa-joint.ts` e integrados en `npm run qa`. El seed crea también `qa-joint-device-1/2` y `qa-joint-credential-1/2`, separados del historial presembrado. Se habilitan con QA_JOINT_DEVICE_SECRET; no se usa Firebase desde el ejecutor.

Antes de cualquier mutación comprueban listado de asignaciones, identidad autenticada, placas simuladas habilitadas, ausencia de sesión y asignaciones activas. Un fallo de precondición produce BLOCKED con el HTTP observado. Una vez iniciado el ciclo, un incumplimiento produce FAIL, no un bloqueo que oculte el defecto. Solo se finalizan/cierran recursos creados por esa ejecución; se conserva la historia para inspección. Una limpieza incompleta se reporta y detiene la siguiente prueba. Las credenciales están fuera del reporte.

**JOINT-CON-17:** admin crea paciente A y asigna D1, crea/inicia sesión por API; simulador emite; finalizar y cerrar asignación; asignar D2 y repetir. Consultar todas las páginas del historial; comparar IDs y fechas del primer tramo con los originales y verificar aislamiento B. Repetir A-08/A-09 después de finalizar/reasignar: referencia original/conflicto respectivamente. B-04 prueba historia presembrada, no acredita estas mutaciones. Bloqueado por CRUD #27 e ingestión 2.0.0.

**JOINT-CONC-08:** con sesión nueva por cada ronda, lanzar `finish` y cinco muestras nuevas mediante `Promise.all`; tres rondas. Admitir escritura previa al cierre o 409 SESSION_NOT_ACTIVE; leer estado final e historia, verificar ninguna receivedAt posterior a finishedAt ni escritura huérfana. No ejecutar sobre sesiones de otro integrante. Bloqueado por el mismo corte HTTP. Los tests de repositorios existentes pasan este invariante, pero no sustituyen el recorrido oficial.

La implementación espera las seis respuestas con `Promise.allSettled` antes de limpiar recursos. Cada ronda exige primero una ingestión válida y coteja los ACK/rechazos con las lecturas persistidas. CON-17 también reasigna D1 al paciente B y confirma que no cambia la pertenencia histórica de A. Se usan páginas de una lectura para obligar a verificar cursores. Seis pruebas con un doble deliberado comprueban el propio ejecutor: bloqueo sin mutaciones, fixture ocupado, ambos órdenes de carrera, corrupción de IDs históricos y escritura posterior a finishedAt. Esas pruebas no acreditan el backend real.

Ejecución actual: [reporte ampliado](../evidencias/hugo-pl2-http-extended.json). Ambos casos detectaron GET /assignments → 404 antes de mutar. [Evidencia de ampliación y corrección de interfaz](../evidencias/hugo-pl2-ampliacion-2026-10-20.md).

**Corte real:** ejecutar `random_disconnect` con 60 s online y 50 s de corte. Verificar a >10 s stale y a >45 s disconnected; después del corte solo una muestra nueva, sin ráfaga ni historia atrasada. El cliente se verificó con reloj controlado y transporte HTTP; integración de este escenario está bloqueada por A-05/A-07. También probar timeout, credencial revocada/placa deshabilitada, ausencia de sesión, comienzo y fin desde la web. El simulador se detiene con 401/403 y Ctrl+C aborta peticiones pendientes.

## Registro de defectos / regresión

| ID | Casos | Obtenido sobre ad4dede | Dependencia y regresión |
| --- | --- | --- | --- |
| H-01 | A-04–07 | 400 al incluir deviceId; config sí funciona | #27: adaptar validadores/ruta y repositorio. Reejecutar matriz hasta 201/200/403/409 correctos |
| H-02 | A-01–02 | 401 UNAUTHORIZED, contrato exige UNAUTHENTICATED | #27: acordar códigos y envoltorio; repetir ambas credenciales negativas |
| H-03 | B-01/B-06 | 404 en PATCH paciente y GET assignments | #27: rutas/roles; luego casos conjuntos y regresión con viewer/admin |

No se declara corregido ningún defecto externo. Los seis puntos P-01–P-06 de Axel mantienen su proceso de coordinación; esta entrega no decide cambios de contrato ni modifica sus resultados históricos.

Seguimiento publicado: [#45 — H-01/H-02, ingestión y autenticación](https://github.com/codsebas/PulsoLink/issues/45), [#46 — H-03, rutas CRUD](https://github.com/codsebas/PulsoLink/issues/46). Entrega para revisión: [PR #47](https://github.com/codsebas/PulsoLink/pull/47).

## Apoyo físico #35

El mismo payload y los escenarios normal/no_contact/unavailable/invalid/corte sirven como referencia a NodeMCU. Antes de aceptar hardware: registrar modelo/librerías, compilación/carga real, HTTPS verificado, sesión/asignación activas y lectura física persistida visible en el paciente correcto; temperatura superficial y SpO₂ estimada. No hubo placa conectada en esta ejecución, por lo que esos criterios siguen pendientes de Sebastián.
