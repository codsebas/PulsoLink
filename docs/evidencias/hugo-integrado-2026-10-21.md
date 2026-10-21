# Aceptación integrada de Hugo — 21 de octubre de 2026

Base: `abc4d458315df19356354a6b2c5b60d6925f0efa`, con #49 y #47 integrados. Rama: `fix/hugo-integrated-acceptance`. Windows, Node 24.15.0, Java 21, Firebase CLI 15.34.0, Edge 155.0.4283.62. API/Firestore Standard/Auth locales, proyecto desechable `demo-pulsolink-hugo`; datos sintéticos. No nube ni placa física.

## Resultado de las instrucciones de coordinación

| Seguimiento | Resultado y evidencia |
| --- | --- |
| #32 / #45 | A-01–17 aprobados contra API oficial: identidad, credenciales, calidades, duplicados/conflictos y concurrencia idempotente |
| #32 / #46 | B-01–06 y JOINT-CON-17/JOINT-CONC-08 aprobados; ciclo real crear/iniciar/finalizar/cerrar/reasignar y lectura posterior por HTTP |
| #44 | CLI oficial ejecutado como proceso, conectado a API/Firestore/web; ver informe del simulador |
| #48 / #33 | Defecto adicional de página posterior reproducido y corregido; 9/9 casos extendidos después del arreglo |
| #29 / #33 | Dos fallos reproducidos con navegador y datos ingresados por HTTP; siguen abiertos para el responsable del dashboard |

[HTTP: 25/25](hugo-integrated-http-2026-10-21.json). El primer intento con timeout 5000 ms produjo 24 PASS y 1 FAIL en la carrera de finalización ([reporte conservado](hugo-integrated-http-timeout-2026-10-21.json)). La repetición con REQUEST_TIMEOUT_MS=30000 completó las tres rondas sin inconsistencia histórica. No se cambió el timeout predeterminado del simulador ni se afirma haber eliminado la latencia/intermitencia de concurrencia del emulador.

## Corrección adicional de Reintentar

1. Cargar 100 lecturas de `monitor-patient`.
2. Abortar únicamente requests con cursor; pulsar Cargar más antiguas.
3. Antes: el error ocultaba las 100 filas; el refresco del archivo tampoco solicitaba el cursor fallido.
4. Ahora: el mensaje de error acompaña las filas ya cargadas; Reintentar utiliza fetchNextPage cuando isFetchNextPageError, recuperando 200 filas. Los errores de carga inicial siguen usando refetch.
5. Tras recuperarse, un refresco manual y 11 segundos de observación no solicitan páginas de archivo sano.

[Antes: 8 PASS/1 FAIL](hugo-integrated-ui/before/results.json), [después: 9/9](hugo-integrated-ui/after/results.json), [captura recuperada](hugo-integrated-ui/after/later-page-recovered.png). Prueba de componente añadida para mantener las filas y reintentar el cursor sin descargar de nuevo la primera página. Las respuestas de datos provienen del servidor; Playwright solo pausa/aborta transporte en casos identificados.

## Defectos existentes #29 reproducidos

[Resultados](hugo-history-acceptance/results.json), [ventana en vivo](hugo-history-acceptance/live-window.png), [1120 lecturas](hugo-history-acceptance/history-1120.png).

- HIST-01: crear 120 lecturas por API y cargar ambas páginas. Ingresar 21, refrescar recientes; ingresar otras 21 y refrescar. La API recibió 162 y la tabla muestra 140, mientras afirma alcanzar el inicio. No se borraron lecturas de Firestore: se pierde cobertura visible al reemplazar la ventana de 20.
- HIST-02: completar 1120 lecturas por API, recargar y descargar 12 páginas. Solo 1000 filas visibles y Cargar más antiguas deshabilitado; no se pueden inspeccionar las 120 restantes desde esa navegación.

La entrega no redefine la retención/navegación del módulo de #29. Se devuelve evidencia a ese seguimiento y #33 sigue abierto. El regreso tras inactividad requiere la misma corrección de continuidad y su regresión posterior; no se presenta como aprobado por las pruebas anteriores.

## Comandos reproducibles

Preparar Node 24 y los emuladores/fixtures según [guía de Hugo](../qa/pl2-08-hugo.md). Mantener el mismo proyecto demo- en CLI, API y seed. Definir secretos solo en el entorno, QA_ALLOW_WRITES=true y QA_JOINT_DEVICE_SECRET como en esa guía. Para los scripts de navegador, Playwright debe estar instalado según la preparación anterior y disponible para Node.

```powershell
$env:REQUEST_TIMEOUT_MS='30000'
$env:QA_REPORT=Join-Path $PWD 'docs/evidencias/hugo-integrated-http-2026-10-21.json'
npm run qa --workspace=tools/device-simulator
# El CLI conserva su timeout por defecto en la demostración:
Remove-Item Env:REQUEST_TIMEOUT_MS
node tools/qa/hugo-simulator-integrated.cjs
$env:QA_UI_OUTPUT='docs/evidencias/hugo-integrated-ui/after'
node tools/qa/hugo-ui-extended.cjs
$env:QA_UI_OUTPUT='docs/evidencias/hugo-integrated-ui/base'
$env:QA_RUN_WEB_TESTS='true'
node tools/qa/hugo-ui.cjs
# Reproduce defectos conocidos; salida 1 es esperada mientras #29 siga pendiente.
node tools/qa/hugo-history-acceptance.cjs
npm run typecheck
npm run build
npm test --workspace=tools/device-simulator
```

No ejecutar las pruebas conjuntas y los scripts de demostración al mismo tiempo sobre las mismas placas dedicadas. El simulador usa qa-joint-device-1; la reproducción de historial usa qa-joint-device-2. Los scripts cierran únicamente las sesiones/asignaciones que crean y conservan historia. La demostración deshabilita y vuelve a habilitar la placa de QA tras cerrar su asignación.

## Verificaciones y límites

- Typecheck y build globales correctos; advertencia existente de bundle Vite >500 kB.
- Simulador: 26/26 pruebas.
- Web: 21/21, incluidas dos integraciones HTTP con sesión real de emulador.
- Navegador base: 13/13; extendido: 9/9. Incluye móvil 360/768 px, teclado, fechas, carga/vacío, logout y restricciones viewer.
- Un ensayo del runner supuso erróneamente que no_contact implicaba ausencia total de lecturas válidas. Se corrigió la aserción: temperatura válida mantiene conexión con lectura; unavailable en las tres magnitudes verifica el otro estado. No se modificó el producto por esa expectativa incorrecta.
- Reinicios locales del servidor restablecieron el limitador de login entre ejecuciones repetidas. No se deshabilitó ni cambió el límite del producto.
- Hardware #35, nube/índices efectivos, aceptación de los supervisores y corrección del dashboard #29 quedan pendientes. El merge y los checks locales no sustituyen esas aceptaciones.

## Demostración del simulador oficial

[Reporte y tráfico sin credenciales](hugo-integrated-simulator/results.json): 7/7 comprobaciones. [Conectado](hugo-integrated-simulator/connected.png), [desconectado](hugo-integrated-simulator/disconnected.png), [sin contacto](hugo-integrated-simulator/no-contact.png). El proceso ejecuta index.ts; el proxy local corta sockets durante 50 segundos. Se verifican ausencia de envíos sin sesión, muestras persistidas, stale, disconnected, recuperación sin ráfaga, no_contact/unavailable, finalización y rechazo de placa deshabilitada. No se simula hardware físico.

## Suite API sobre entorno limpio

El primer intento de suite usó un project ID diferente del emulador activo y lanzó Vitest desde la raíz con --root. Falló por configuración: Auth consultaba otro proyecto y los tests de CLI resolvían rutas relativas al cwd incorrecto. Se descartó como validación de producto y se repitió con un emulador nuevo, proyecto coincidente y el comando del workspace:

```powershell
$env:FIREBASE_PROJECT_ID='demo-pulsolink-hugo-tests'
npx firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink-hugo-tests --only firestore,auth 'npm run test --workspace=apps/api -- --no-file-parallelism'
```

La ejecución serial comprueba la suite integrada; no acredita resolver la intermitencia paralela documentada en #49.

Resultado final: **149/149 pruebas API aprobadas en 23 archivos, cero omitidas**, Node 24.15.0, 63.42 s. Emuladores detenidos al terminar.
