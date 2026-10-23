# PulsoAI: cierre del fallo de concurrencia y aceptación

Seguimiento #72, PR #76, relacionado con #51/#32. Base main integrada: 3db477a (#78). Trabajo aislado en rama local fix/pulsoai-concurrency por cambios concurrentes del checkout principal.

## Corrección

Se mantiene el presupuesto de 5000 ms. Ingestión y transición de la misma sesión se ejecutan por turnos dentro del proceso API, usando un coordinador compartido por cliente Firestore/sesión. Las sesiones distintas no se bloquean entre sí. Límite de 32 solicitudes vivas; saturación devuelve RATE_LIMITED/429 y Retry-After: 1. La cola se libera incluso ante error y no retiene muestras offline.

No se quitaron transacciones, validaciones, auditoría, deduplicación, reservas ni alta atómica del trabajo PulsoAI. Firestore sigue siendo la garantía de consistencia entre procesos. La optimización local no promete el mismo presupuesto entre réplicas o bajo interrupción del proveedor; el despliegue previsto es un proceso API. No se modificó el timeout de las pruebas para aprobarlas.

## Verificación ejecutada

Node 24.22.1, Java 21, Auth y Firestore **Standard emulados**, proyecto desechable. Dependencias del lockfile reutilizadas por junction de node_modules, sin modificar dependencias del proyecto. Las pruebas no usan pacientes reales ni Firestore cloud.

| Comprobación | Resultado |
| --- | --- |
| Typecheck todos los workspaces | PASS |
| Build API y web | PASS; advertencia existente de bundle >500 kB |
| API completa con emuladores, ejecución serial | **267/267 PASS**, 31 archivos |
| Caso original JOINT-CONC-08 | PASS con el presupuesto original <5000 ms; duración completa de prueba 314 ms |
| Seis carreras de repositorio | **123, 141, 138, 204, 203, 192 ms**; ambos órdenes y todas <5000 ms |
| Web completa | **45 PASS, 2 omitidas** de integración HTTP; no se cuentan las omitidas como aprobadas |
| Simulador | **32/32 PASS** |
| FIFO, separación de sesiones/clientes, error y saturación | 2 pruebas unitarias PASS |

### Recorrido con Groq real y navegador

Edge headless, SPA compilada/Express, cookie y CSRF reales con Firebase Auth Emulator; lecturas por repositorio transaccional. Groq real: **una llamada**, openai/gpt-oss-20b, finish_reason stop, **1007 tokens** (862 entrada + 145 salida). El plan restringido pasa validación de todos los hechos. Firestore conserva el texto; se muestra “Resumen generado por PulsoAI” y al recargar no se hace otra llamada. Móvil 390 px sin overflow.

Después se probaron seis carreras por **rutas HTTP oficiales** con cookies/CSRF para finish y credencial bearer propia del dispositivo. Timeout de cada solicitud: 5000 ms; cero ticks adicionales del worker, sin llamadas extra a Groq.

| Orden de emisión | Ronda | Tiempo total | Lecturas aceptadas / persistidas |
| --- | ---: | ---: | ---: |
| finish primero | 1 | 180 ms | 0 / 0 |
| finish primero | 2 | 319 ms | 3 / 3 |
| finish primero | 3 | 173 ms | 2 / 2 |
| muestras primero | 1 | 269 ms | 5 / 5 |
| muestras primero | 2 | 274 ms | 5 / 5 |
| muestras primero | 3 | 226 ms | 5 / 5 |

El orden de emisión no garantiza el de llegada por red. Se aceptan solo muestras anteriores al cierre; respuestas rechazadas son 409 SESSION_NOT_ACTIVE. En las seis rondas el conteo coincide y receivedAt no supera finishedAt. Repetir finish conserva la fecha y el mismo trabajo pendiente. La prueba de repositorio comprueba además duplicados después del cierre.

### Cierre de las dos pruebas web HTTP omitidas

Se amplió el runner para ejecutar también las dos pruebas opt-in con una cookie auténtica de Auth Emulator y más de 100 lecturas por paciente. Se guardan las credenciales exclusivamente en el entorno del subproceso, nunca en argumentos o reportes. Se exige reporte Vitest con exactamente **2 PASS y 0 omitidas**. Se mantiene la sesión del fixture activa durante la consulta de latest y se finaliza después del ensayo.

Resultado final: las **47 pruebas web se ejecutaron y aprobaron** entre la suite de 45 y estas dos integraciones HTTP. El ensayo ampliado vuelve a pasar Groq, persistencia, recarga y seis carreras HTTP: **275, 185, 191, 297, 272, 307 ms**, todas bajo 5000 ms. Última ejecución: una llamada Groq, **1024 tokens**; el dato de 1007 tokens de la sección anterior corresponde al primer recorrido aprobado, no al consumo total de la investigación.

Un intento de esta ampliación falló por cerrar el fixture antes de consultar latest (que solo devuelve lecturas activas); se corrigió el orden del runner, sin cambiar el producto. Ese intento llegó a llamar a Groq; no se afirma un total de tokens de todas las ejecuciones.

[Resultado final ampliado](pulsoai-concurrencia/results-web-http.json) · [Reporte Vitest de las dos pruebas HTTP](pulsoai-concurrencia/web-http-tests.json).

[Resultado sanitizado y rondas HTTP](pulsoai-concurrencia/results.json) · [Escritorio](pulsoai-concurrencia/desktop.png) · [Móvil](pulsoai-concurrencia/mobile.png).

## Reproducción y límites

Plan en docs/planificacion/pulsoai-cierre-concurrencia.md. Comandos desde raíz PowerShell:

~~~powershell
npx --yes --package=node@24 --call 'npm run typecheck && npm run build:deploy'
$env:NODE_ENV='test'
$env:FIREBASE_PROJECT_ID='demo-pulsoai-concurrency'
npx --yes --package=node@24 --package=firebase-tools --call 'firebase emulators:exec --only firestore,auth --config firebase/emulators.test.json --project demo-pulsoai-concurrency "npm test --workspace=apps/api -- --fileParallelism=false"'
npx --yes --package=node@24 --call 'npm test --workspace=apps/web && npm test --workspace=tools/device-simulator'
$env:FIREBASE_PROJECT_ID='demo-pulsoai-concurrency-ui'
$env:PULSOAI_QA_ALLOW_REAL_GROQ='true'
# Opcionales: PULSOAI_QA_ENV_FILE = ruta privada al .env; PULSOLINK_PLAYWRIGHT_MODULE = módulo Playwright local.
npx --yes --package=node@24 --package=firebase-tools --call 'firebase emulators:exec --only firestore,auth --config firebase/emulators.test.json --project demo-pulsoai-concurrency-ui "node tools/qa/pulsoai-acceptance.cjs"'
~~~

En esta ejecución se usaron configuraciones ignoradas con puertos alternativos/libres para no interferir con otros emuladores. El runner copia el build a una carpeta temporal: sendFile rechaza por seguridad rutas absolutas con segmentos ocultos como .codex; no se relajó esa protección. El intento inicial de navegador falló en /login por esa ruta antes de llamar a Groq; el posterior con copia temporal pasó. Otro intento de arranque colisionó con puertos ocupados; se usaron puertos libres sin detener procesos ajenos.

Esta aceptación resuelve el bloqueo local de concurrencia. No certifica Render, carga distribuida ni hardware. El PR puede pasar a revisión; para publicar quedan la integración del PR, configurar GROQ_API_KEY/GROQ_MODEL/SESSION_SUMMARY_ENABLED en Render y ejecutar el recorrido HTTPS allí. No se fusionó ni desplegó por estas pruebas.

## Revisión previa al merge de #76

Se incorporó main `6995e5a` (incluye #79, #80, #81 y #82) y después `498e1bf` (#83, tablas móviles). Dependencias #26, #27, #29, #31, #34 y #51 cerradas en GitHub. #28 sigue abierto para aceptación cloud, sin observaciones bloqueantes de backend en emuladores; #35 y el diseño #74 no bloquean esta integración.

Con Node 24.22.1, typecheck y build de todos los workspaces pasan. La primera ejecución de `npm run verify` dentro de Auth/Firestore Standard emulados falló con archivos API en paralelo: un timeout de aprovisionamiento de 5000 ms, su fallo posterior de autenticación y una recuperación de usuario con completed=0. `users-service` y `users-auth-emulator` consultan operaciones pendientes del mismo proyecto y podían procesar los fixtures ajenos. Web: 55 aprobadas y 2 HTTP omitidas; simulador: 32 aprobadas.

Se cambió únicamente el orden entre archivos del script API a `vitest run --fileParallelism=false`, documentado en desarrollo-local.md. No se cambiaron aserciones ni timeouts. Repetición mediante `emulators:exec ... 'npm test'`: salida 0, **API 267/267**, web **55 aprobadas/2 omitidas**, simulador **32/32**. El caso JOINT-CONC-08 tarda 352 ms; seis carreras PulsoAI: 194, 126, 176, 293, 225 y 241 ms. Las carreras dentro de cada prueba continúan concurrentes. No se volvió a llamar a Groq en esta revisión; el recorrido real y las dos pruebas HTTP opt-in anteriores conservan su evidencia, sin presentarlos como repetidos sobre la base nueva.

GitHub no registra revisiones humanas ni checks de CI para #76, y main no tiene protección ni rulesets obligatorios. La aprobación técnica se basa en esta revisión y ejecución local; la solicitud del usuario autoriza fusionar una vez conformes las comprobaciones. La configuración y aceptación HTTPS de Render siguen pendientes y #72 debe permanecer abierto hasta completarlas.

Tras incorporar #83, se repitieron typecheck, build y suite completa del frontend: **60 aprobadas y 2 HTTP omitidas**, salida 0. API y simulador no cambiaron respecto de la ejecución emulada aprobada. Se conserva la advertencia de bundle superior a 500 kB.
