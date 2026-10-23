# PL2-08 — QA de Hugo en Windows y contraste web

- Fecha de ejecución: 2026-10-22.
- Responsable: `@HugoX2024`.
- Revisión probada: `origin/main` en `553c3860b92c9eeda5cfa9995f06a974f05ffac8`.
- Entorno: Windows PowerShell, Node.js 24.19.0, Java 21.0.6, Firebase CLI 15.34.0; emuladores locales Auth/Firestore Standard. Sin nube ni hardware.

## Preparación

- Fixture desechable del simulador con `demo-pulsolink-hugo-20261022`; emuladores en `127.0.0.1:19099` (Auth) y `127.0.0.1:18080` (Firestore).
- Para la sección E se reiniciaron los emuladores limpios con el proyecto desechable `demo-pulsolink-hugo-ui-20261022`.
- La contraseña del fixture y el secreto de placa se generaron aleatoriamente en la sesión de PowerShell y solo existieron en variables de entorno. No se registraron sus valores.
- Para repetir la matriz completa se inició la API con `LOGIN_RATE_LIMIT_MAX=200`, según la nota operativa del módulo QA. Este límite solo se cambió en el proceso local de pruebas.
- El reporte incluye 25 casos A/B/JOINT de Hugo y 65 AUTH/ROL/CON/CONC de Axel.

## Comandos ejecutados

En terminales PowerShell separadas, desde la raíz del repositorio:

```powershell
# Emuladores desechables
npx.cmd -y firebase-tools@15.34.0 emulators:start --config firebase/emulators.test.json --project demo-pulsolink-hugo-20261022 --only firestore,auth

# Preparar el fixture con variables de entorno locales
npx.cmd tsx apps/api/src/scripts/seed-simulator-qa.ts
$env:LOGIN_RATE_LIMIT_MAX='200'
npm.cmd run dev:api

# Ejecutar la matriz completa (repetida con emuladores reiniciados)
$env:DEVICE_ID='demo-device-2'
$env:DEVICE_CREDENTIAL_ID='demo-credential-2'
$env:DEVICE_SECRET=$env:DEMO_DEVICE_SECRET
$env:QA_JOINT_DEVICE_SECRET=$env:DEMO_DEVICE_SECRET
$env:QA_ALLOW_WRITES='true'
$env:QA_ADMIN_EMAIL='demo-admin@example.invalid'
$env:QA_VIEWER_EMAIL='demo-viewer@example.invalid'
$env:QA_PASSWORD=$env:DEMO_FIXTURE_PASSWORD
npm.cmd run qa --workspace=tools/device-simulator

# Preparar el verificador de navegador y compilar sus módulos API
$playwrightTemp = Join-Path $env:TEMP 'pulsolink-playwright-module'
npm.cmd --prefix $playwrightTemp install --no-save --no-package-lock --ignore-scripts playwright
npx.cmd -y firebase-tools@15.34.0 emulators:start --config firebase/emulators.test.json --project demo-pulsolink-hugo-ui-20261022 --only firestore,auth
npm.cmd run build --workspace=apps/api
$env:FIREBASE_PROJECT_ID='demo-pulsolink-hugo-ui-20261022'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:18080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099'
$env:PULSOLINK_PLAYWRIGHT_MODULE=(Join-Path $env:TEMP 'pulsolink-playwright-module\node_modules\playwright')
$env:PULSOLINK_UI_CONTRAST_ONLY='true'
$env:PULSOLINK_BROWSER_CHANNEL='msedge'
$env:PULSOLINK_EVIDENCE_DIR=(Join-Path (Get-Location) 'docs/evidencias/pl2-08-hugo-ui-contrast-windows-2026-10-22')
node tools/firebase/verify-patient-browser.cjs
```

El ejecutor de navegador usó Playwright 1.64.1 desde una carpeta temporal fuera del repositorio y Microsoft Edge 155.0.4283.62. No se modificaron los manifiestos npm del proyecto.

## Resultados

| Comprobación | Resultado | Evidencia observable |
| --- | --- | --- |
| Matriz completa, primer intento | 89/90 PASS; A-17 quedó BLOCKED por falta de respuesta en concurrencia; salida 2 | [Reporte r1](pl2-08-hugo-windows-2026-10-22-r1.json) |
| Matriz completa, segundo intento con emuladores reiniciados | 90/90 PASS; salida 0 | [Reporte r2](pl2-08-hugo-windows-2026-10-22-r2.json) |
| Timeout base de QA | 5000 ms en ambos reportes | `requestTimeoutMs` |
| Carrera conjunta JOINT-CONC-08 | 30000 ms según el alcance acordado; los demás casos conservaron 5000 ms | `jointConcurrencyTimeoutMs` |
| Contraste de navegador, sección E | UI-02, UI-03a, UI-03b, UI-06 y UI-07 PASS; UI-03c SKIPPED por no ser alcanzable en el modelo 2.0; salida 0 | [Reporte de Edge](pl2-08-hugo-ui-contrast-windows-2026-10-22/ui-contrast.json) |
| Build de API para el verificador web | Aprobado; salida 0 | `npm.cmd run build --workspace=apps/api` |
| Secretos en reportes | No se incluyen valores de contraseña/secreto, cookies ni tokens | Inspección de los tres JSON |

El primer bloqueo de A-17 no se ocultó: la segunda corrida se hizo con un fixture nuevo y aprobó el caso junto con los otros 89. El resultado no demuestra estabilidad 3/3 en Windows.

## Revisión posterior de PR #57

La extracción de `login()` y `summarize()` a `qa-web.ts` mantiene el flujo HTTP de cookies/CSRF; la matriz ampliada ejecutó correctamente el cliente real en ambos intentos. No encontré un defecto en esos cambios de `qa.ts`/`qa-web.ts`.

Sí observé un punto de seguimiento en la limpieza añadida en `qa-permissions.ts`: la función `quiet()` ignora excepciones y también el estado HTTP devuelto por cada llamada. Por ello, el reporte puede terminar sin indicar que una sesión, asignación o recurso no se liberó. Lo comuniqué en #32 para que Axel valore registrar esos fallos; no es un fallo detectado en las dos ejecuciones de este fixture.

## Alcance y límites

- Demuestra los 90 casos HTTP contra API y emuladores locales en Windows, con un intento parcial y una corrida completa aprobada.
- Demuestra el contraste web E en Microsoft Edge; UI-03c está omitido por la condición documentada del modelo 2.0.
- No acredita Firebase en nube, persistencia en un proyecto compartido ni hardware físico.
