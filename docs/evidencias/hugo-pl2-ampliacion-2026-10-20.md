# Ampliación de la entrega de Hugo y corrección de recuperación de historial

Fecha local: 20 de octubre de 2026, America/Guatemala. Reportes en UTC del 21.
Base evaluada: `59ffa50312ac52b954868d1fdad79a3e65fa5d2a`, API original `ad4dede`.
Rama/entrega: [PR #47](https://github.com/codsebas/PulsoLink/pull/47).
Windows PowerShell, Node 24.15.0, Java 21, Firebase CLI 15.34.0, Edge 155.0.4283.62; Auth/Firestore locales con proyecto `demo-pulsolink-hugo`. Datos sintéticos, sin nube ni placa física.

## Trabajo completado

- Automatización HTTP de JOINT-CON-17 y JOINT-CONC-08, con placas dedicadas, precondiciones, creación de recursos propios y limpieza acotada. Incluye historia entre placas/pacientes, duplicado y conflicto después de reasignación, y tres carreras de finalización frente a cinco mediciones cada una.
- Timeout HTTP real del simulador: petición de medición retenida hasta abortarse, espera de reconexión y nueva secuencia sin reenvío. Casos explícitos de 500, 503 e identidad distinta en config.
- Pruebas del ejecutor QA que demuestran que detecta corrupción histórica y escrituras posteriores al cierre, además de impedir operaciones sobre placas ocupadas. Son dobles de prueba identificados, no evidencia de la API pendiente.
- QA real de filtros de fechas, validación, vacío, carga, error/recuperación de red, logout y navegación posterior al logout.
- Corrección de un defecto real encontrado en `usePatientHistory`: Reintentar recuperaba la ventana reciente pero no la consulta paginada fallida. Ahora reintenta también el archivo cuando está en error; un historial sano conserva sus páginas y no se vuelve a descargar en cada refresco.

## Resultados ejecutados

| Comando / comprobación | Resultado |
| --- | --- |
| npm test --workspace=tools/device-simulator | 26/26: 20 del cliente y 6 del ejecutor conjunto |
| npm run typecheck | Correcto en todos los workspaces |
| npm run build | Correcto; conserva advertencia Vite de bundle >500 kB |
| Prueba de regresión de recuperación, antes del arreglo | 1 fallida, reproduce la imposibilidad de reintentar el archivo |
| test/patient-monitoring-page.test.tsx, después | 4/4; recuperación y ausencia de descarga redundante |
| Suite web con cookie real y API emulada | 20/20, incluidas las dos integraciones HTTP |
| Navegador, matriz extendida | 8/8 después del arreglo; antes 7/8 |
| Regresión del navegador anterior | 13/13, incluida la ejecución de la suite web |
| Matriz HTTP 2.0.0 | 5 PASS, 8 FAIL, 12 BLOCKED; mismos bloqueos externos, ahora comprobados dinámicamente para los casos conjuntos |

No se volvió a ejecutar toda la suite API de 148 pruebas: no se modificó lógica del servidor; se amplió únicamente su script de fixtures y se ejecutó contra los emuladores. El resultado de 148/148 pertenece a la [ejecución anterior](hugo-pl2-2026-10-20.md). Los tipos del script ampliado y el aprovisionamiento real sí se comprobaron en esta ampliación.

## Defecto de interfaz y regresión

Seguimiento: [#48](https://github.com/codsebas/PulsoLink/issues/48), corregido en esta rama y pendiente de integración.

Reproducción antes del arreglo:
1. Entrar como viewer y abrir `/monitoring/monitor-patient`.
2. Abortar las peticiones HTTP de `measurements` desde Playwright y recargar.
3. Confirmar el mensaje de error; retirar el bloqueo y pulsar Reintentar.
4. Esperado: vuelve el historial. Obtenido: sigue el error porque solo se reconsulta `live`, mientras `archive.isError` permanece activo.

[Reporte antes](hugo-ui-extended/results-before-fix.json) · [captura antes](hugo-ui-extended/UI-X06-network-error-recovery-failed.png).

La corrección añade una reconsulta del archivo solo cuando `archive.isError` es verdadero. Se añadieron dos pruebas de componente: recuperación del archivo y refresco de historial sano limitado a `limit=20`, sin nueva petición de `limit=100`. Se observó primero el fallo de la prueba de recuperación y luego las cuatro pruebas aprobadas.

[Reporte después, 8/8](hugo-ui-extended/results.json) · [captura recuperada](hugo-ui-extended/network-recovered.png) · [regresión anterior 13/13](hugo-ui-extended/base-regression.json).

## Matriz extendida de navegador

| ID | Evidencia observada |
| --- | --- |
| UI-X01 | Rango Guatemala convertido a límites UTC exactos; 45 filas coincidentes con las 240 lecturas de API, from inclusivo y to exclusivo |
| UI-X02 | from >= to muestra error y no envía el rango inválido a la API; se permite el polling normal |
| UI-X03 | Rango futuro vacío no conserva las filas anteriores |
| UI-X04 | Desde el inicio registrado limpia ambos campos y recupera 100 lecturas |
| UI-X05 | Petición real retenida: muestra Cargando historial; al liberarla carga datos reales |
| UI-X06 | Peticiones abortadas: error visible; restablecer red y Reintentar recupera 100 lecturas |
| UI-X07 | Logout HTTP 204, cookie de sesión eliminada, sin filas/paciente visible; auth/me 401 |
| UI-X08 | Atrás y acceso directo protegido después del logout no muestran historia; vuelven al login |

Las pausas y abortos son inyección de fallos de transporte, sin respuestas de datos inventadas. No equivalen a cortar la red del dispositivo IoT ni acreditan reconexión física.

Capturas: [rango](hugo-ui-extended/date-range.png), [carga](hugo-ui-extended/loading.png), [error de red](hugo-ui-extended/network-error.png), [logout](hugo-ui-extended/logged-out.png).

## Reproducir

Seguir [la preparación de la matriz](../qa/pl2-08-hugo.md), usando el mismo proyecto demo- en CLI, servidor y fixtures. El seed ahora incluye las dos placas libres para los casos conjuntos. En el entorno que conserva secretos solo locales:

```powershell
$env:QA_JOINT_DEVICE_SECRET=$env:DEMO_DEVICE_SECRET
$env:QA_REPORT=Join-Path (Get-Location) 'docs/evidencias/hugo-pl2-http-extended.json'
npm run qa --workspace=tools/device-simulator

# Playwright instalado externamente según la guía anterior
$env:QA_PASSWORD=$env:DEMO_FIXTURE_PASSWORD
node tools/qa/hugo-ui-extended.cjs
npm test --workspace=tools/device-simulator
```

## Pendientes que no se pueden acreditar en esta ejecución

El endpoint oficial GET /assignments sigue devolviendo 404: ambos casos conjuntos se declaran BLOCKED antes de modificar recursos. El código de los casos y su detección de defectos sí están probados. Persisten [#45](https://github.com/codsebas/PulsoLink/issues/45) y [#46](https://github.com/codsebas/PulsoLink/issues/46); tras su integración basta repetir la matriz con el fixture disponible. Los criterios físicos de #35 requieren placa/sensores y los criterios oficiales de #44/#32 necesitan la API compatible. El PR continúa sujeto a revisión de otro integrante.
