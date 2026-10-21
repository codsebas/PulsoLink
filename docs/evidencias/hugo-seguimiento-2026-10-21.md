# Seguimiento de los tres pendientes de Hugo — 21/10/2026

Base de producto: `f2959ea7bb647fd4f4ff275a4f58cf664196b0b3`, PR #50 sobre main abc4d45. Windows, Node 24.15.0, Edge 155, Java 21, Firebase CLI 15.34.0 y Auth/Firestore Standard emulados, proyecto desechable demo-pulsolink-hugo. No nube ni hardware.

## 1. Cambio de placa visto en navegador — PASS

[Resultados](hugo-followup/browser/results.json), [antes](hugo-followup/browser/before-reassignment.png), [después](hugo-followup/browser/after-reassignment.png).

El script crea un paciente y una asignación/sesión con D1 por HTTP administrativo, ingresa 120 muestras por el endpoint oficial y comprueba las 120 filas en la web. Finaliza/cierra, asigna D2 al mismo paciente, inicia otra sesión e ingresa cinco muestras. Tras recargar y paginar, la web muestra 120 filas de D1 + 5 de D2. Los 120 objetos históricos se comparan completos por HTTP y permanecen idénticos.

No se usó historia presembrada para este caso. La operación administrativa fue por API; la aceptación antes/después fue visual en navegador. No se atribuye a esta ejecución interacción con formularios de asignación.

## 2. Volver después de inactividad — FAIL reproducido, #29/#33

[Resultado y peticiones](hugo-followup/browser/results.json), [captura al volver](hugo-followup/browser/after-return.png).

Se utiliza un perfil nuevo de Edge, CDP con noDefaults=true y otra pestaña real. Es necesario evitar la emulación de foco que Playwright activa normalmente: con esa emulación la página permanece visible aunque otra pestaña esté delante. No se sobrescriben document.hidden/visibilityState ni se fabrican eventos.

Secuencia observada: visible → hidden → visible. Con 125 lecturas ya cargadas, se oculta el expediente, se ingresan 42 muestras por HTTP y se observa la pausa durante al menos 12 segundos. Después se vuelve sin recargar ni pulsar Actualizar y se observa otros 12 segundos.

- Cero peticiones de la página durante el intervalo oculto, tras un segundo de estabilización.
- Al volver se reanuda el tráfico; la ventana reciente solicita 20 lecturas, el archivo no se recarga.
- Persistidas: 167. Visibles: 145. Faltan 22 lecturas en la representación, no en Firestore.

La suspensión del polling funciona; la recuperación de cobertura al volver no. Se agrega esta reproducción al defecto de continuidad existente, sin duplicar issue ni presentarlo como aprobado.

## 3. Timeout de cinco segundos — reproducido y explicado hasta la capa transaccional

Tres ejecuciones consecutivas con REQUEST_TIMEOUT_MS=5000 sobre el servidor normal, sin instrumentar transacciones:

| Ejecución | PASS | FAIL | BLOCKED |
| --- | --- | --- | --- |
| [1](hugo-followup/concurrency/run-1.json) | 23 | 1 | 1 |
| [2](hugo-followup/concurrency/run-2.json) | 24 | 1 | 0 |
| [3](hugo-followup/concurrency/run-3.json) | 24 | 1 | 0 |

JOINT-CONC-08 falla en las tres por respuestas que exceden el timeout. En la primera también A-17 queda sin respuesta completa. Los abortos medidos ocurren a unos 5000–5012 ms. [Tiempos 1](hugo-followup/concurrency/timing-1.json), [2](hugo-followup/concurrency/timing-2.json), [3](hugo-followup/concurrency/timing-3.json).

Una ejecución normal con límite diagnóstico de 30000 ms pasa 25/25: [resultado](hugo-followup/concurrency/run-30s.json), [tiempos](hugo-followup/concurrency/timing-30s.json). En las carreras se observan respuestas HTTP correctas de 5251–7445 ms, sin inconsistencia histórica detectada por el ejecutor. El simulador conserva el timeout de 5000 ms y descarta muestras sin reenvío; aumentar el límite de diagnóstico no constituye una corrección del producto.

### Investigación del servidor

Se repitió la matriz con un preload temporal exclusivamente para emuladores, registrando duración y número de invocaciones del callback transaccional del SDK, además del orden de lectura de colecciones. No registra IDs de documentos, cuerpos, cabeceras, claves ni mensajes internos. El preload no modifica el número de intentos ni los datos devueltos.

[Resultado instrumentado 25/25](hugo-followup/concurrency/run-instrumented.json), [tiempos HTTP](hugo-followup/concurrency/timing-instrumented.json), [transacciones](hugo-followup/concurrency/transactions.jsonl).

Se observaron transacciones con **tres intentos** y duraciones de **6889, 7030, 7463 y 7651 ms**. Eso confirma que la espera excede el límite del cliente durante reintentos del SDK bajo concurrencia. No es únicamente una hipótesis basada en el timeout del navegador.

Lectura de código y traza:
- Ingestión: ingestionKeys/dispositivo → sesión → asignación/paciente.
- Finalización: sesión → dispositivo → asignación/paciente.

Ambos caminos leen/escriben documentos compartidos. El orden inverso es un candidato a agravar la contención, pero esta ejecución no demuestra un deadlock ni acredita que cambiar ese orden elimine el problema. La causa exacta de cada reintento de commit no se registró; no se inventa un código ABORTED que la traza no contiene. Corresponde a API/persistencia evaluar el orden de acceso y el presupuesto de tiempo, conservando atomicidad, idempotencia e historia. La evidencia es local y no predice latencia de Firestore en nube.

## Reproducción

Preparar los emuladores y fixtures con la [guía de Hugo](../qa/pl2-08-hugo.md); API :3001, web :5173, credenciales solo en variables del entorno. Ejecutar las tareas secuencialmente sobre las placas dedicadas libres. Playwright debe estar disponible; QA_EDGE_PATH permite indicar otro ejecutable Edge local.

```powershell
# Navegador real: salida 1 mientras el defecto de retorno siga presente.
node tools/qa/hugo-visibility-reassignment.cjs

# Medición HTTP sin instrumentar el backend:
$env:REQUEST_TIMEOUT_MS='5000'
$env:QA_REPORT=Join-Path $PWD 'work-report.json'
$env:QA_TIMING_REPORT=Join-Path $PWD 'work-timing.json'
node --require ./tools/qa/trace-http.cjs --import tsx tools/device-simulator/src/qa.ts
# Repetir tres veces guardando nombres distintos; luego repetir con 30000.

# Diagnóstico opcional: detener primero la API anterior.
$env:QA_TRANSACTION_REPORT=Join-Path $PWD 'work-transactions.jsonl'
node --require ./tools/qa/trace-transactions.cjs --import tsx apps/api/src/server.ts
# En otra terminal, repetir la matriz con el preload HTTP y timeout30000.
```

La traza transaccional publicada se limita temporalmente a la matriz instrumentada. El perfil de navegador es nuevo, está fuera del repositorio y se elimina al cerrar. Los scripts cierran solo las sesiones/asignaciones que crean. No se cambiaron contratos, lógica backend, timeout predeterminado ni funcionamiento del dashboard en este seguimiento; no se repitieron suites de producto sin cambios. Los tres scripts nuevos se ejecutaron realmente, además de comprobar su sintaxis.
