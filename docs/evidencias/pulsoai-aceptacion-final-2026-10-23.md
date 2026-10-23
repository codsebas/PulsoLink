# #72 — PulsoAI: fallos y aceptación final

Fecha: 23 de octubre de 2026 (Guatemala). Responsable: `@codsebas`.
Rama: `fix/pulsoai-acceptance`, sobre `main` `60390e20931eecd3851c429b8078b2aa116c280e`.
Entorno local: Windows/PowerShell, Node 24.22.1, Java 21.0.4,
Firebase CLI 15.34.0, Firestore Standard/Auth emulados, Edge headless y SPA compilada.
Solo pacientes ficticios y dispositivos simulados.

## Corrección y regresión

Un timeout después de recibir las cabeceras HTTP, mientras se leía el cuerpo de
Groq, se clasificaba como `INVALID_GENERATION` permanente. La regresión falló
antes del cambio y pasó después: ahora se conserva `PROVIDER_UNAVAILABLE`
transitorio tanto antes de las cabeceras como durante la lectura. El JSON
inválido y los planes que inventan u omiten hechos siguen rechazándose.

Se agregaron 39 casos de proveedor/worker, dos pruebas con persistencia
emulada y cuatro casos React. La [guía ejecutable](../qa/pulsoai-aceptacion-final.md)
describe la matriz, requisitos y comandos sin secretos.

## Ejecución

Se ejecutaron `npm run typecheck`, `npm run build` y `npm run lint` con Node 24.
Los dos primeros aprobaron; los scripts `lint` solo imprimen mensajes y no
representan un análisis estático adicional.

Para evitar interferir con emuladores existentes, se copiaron reglas e índices
a `.cache/` y se usaron puertos locales: Firestore 18128, websocket 19160,
Auth 19129, hub 14428 y logging 14528. Configuración de múltiples proyectos
habilitada para los fixtures aislados. Comando equivalente ejecutado:

```powershell
$env:FIREBASE_PROJECT_ID = 'demo-pulsoai-final'
$env:PULSOAI_QA_ALLOW_REAL_GROQ = 'true'
$env:PULSOLINK_PLAYWRIGHT_MODULE = (Resolve-Path '.cache/pulsoai-tools/node_modules/playwright').Path
node '<firebase-tools-15.34.0>/lib/bin/firebase.js' emulators:exec --config .cache/pulsoai-emulators.json --project demo-pulsoai-final --only firestore,auth 'node tools/qa/pulsoai-final-suite.cjs'
```

El runner se corrigió tras dos fallos de preparación: reclamaba trabajos
pendientes de otras pruebas y después intentaba login contra un proyecto
distinto al predeterminado del emulador Auth. La versión final ejecuta primero
el navegador con el proyecto predeterminado, seguido de API/web/simulador.
No se rebajaron las aserciones ni el presupuesto de concurrencia de 5 segundos.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| API con emuladores | 308 aprobadas, 0 omitidas |
| Web | 77 aprobadas más las 2 HTTP opt-in aprobadas por el navegador |
| Simulador | 32 aprobadas, 0 omitidas |
| Navegador con Groq real | PASS; una llamada, `openai/gpt-oss-20b`, `stop`, 1019 tokens |
| Carreras HTTP de cierre/ingestión | 6 aprobadas, entre 102 y 245 ms; historial igual a muestras aceptadas |
| Reinicio real de worker local | 11 comprobaciones aprobadas; proceso terminado durante generación y recuperación tras 299741 ms de espera real |
| HTTPS sobre `60390e2`, después de configurar la clave | 64 comprobaciones y 5 acciones de limpieza aprobadas |

Son 419 pruebas API/web/simulador ejecutadas; las 2 HTTP no se cuentan dos veces.
Informes: [tests](pulsoai-2026-10-23/tests.json),
[suite completa PASS](pulsoai-2026-10-23/suite.json),
[reinicio real](pulsoai-2026-10-23/restart.json),
[navegador local y consumo](pulsoai-2026-10-23/browser-local.json),
[HTTPS antes de integrar la corrección](pulsoai-2026-10-23/https-before-merge.json).
Capturas HTTPS revisadas: [escritorio](pulsoai-2026-10-23/mixed-desktop.png),
[móvil con resumen](pulsoai-2026-10-23/mixed-mobile.png) y
[sin contacto](pulsoai-2026-10-23/no_contact-mobile.png).

En HTTPS, vacía y sin valores válidos terminaron `insufficient_data`;
la mixta terminó `ready`, con promedios 77 bpm, 97 % y 31 °C. Se verificaron
persistencia independiente, cookie Secure/HttpOnly/SameSite=Lax, autenticación,
CSRF, idempotencia, recarga sin otro reclamo y ausencia de desbordamiento a 390 px.
El resultado final después de integrar debe registrarse en el
[issue #72](https://github.com/codsebas/PulsoLink/issues/72), con commit y deploy.
No cerrar únicamente por esta ejecución previa a la integración.

## Render

Servicio: `srv-dbd2oe3rjlhs73f52gm0`, My Workspace confirmado por el usuario.
Origen: `https://pulsolink-api.onrender.com`.
Proyecto Firebase: `pulsolink-pruebas-2026-7c8a31`.

Se guardaron `SESSION_SUMMARY_ENABLED=true` y
`GROQ_MODEL=openai/gpt-oss-20b` mediante actualización parcial del entorno.
La aceptación inicial conservó estadísticas pero terminó `disabled` en el
fixture mixto. El usuario incorporó privadamente `GROQ_API_KEY` y desplegó;
`dep-dbdqd529lscs73admcl0` quedó `live` sobre `60390e2`.

El verificador usa login real, cookies seguras, API oficial e inspección
independiente de Firestore. Cierra sus propias sesiones/asignación, revoca
la credencial efímera y deshabilita paciente/dispositivo ficticios; conserva
el historial. La clave, contraseña y cookies no se incluyen en los informes.

## Límites

Los errores del proveedor se inyectan: no se provocan cuotas ni fallos reales
en Groq. La recuperación de proceso se prueba con Firestore emulado y proveedor
inyectado; no demuestra un reinicio forzado del proceso de producción Render.
La prueba con Groq real se distingue explícitamente en sus informes.
Este trabajo no verifica firmware, sensores físicos ni criterios de otros issues.
