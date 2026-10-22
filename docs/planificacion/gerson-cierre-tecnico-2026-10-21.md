# Gerson — entrega técnica y aceptación pendiente

Actualización del 21 de octubre de 2026 (Guatemala), posterior al seguimiento
del día 20. Base: `main 93ff901`. Esta entrega no cierra issues ni acredita
aprobaciones de otras personas.

## #29: continuidad y navegación del historial

Se modifica el bloque de Gerson/Javier autorizado por coordinación: `hooks.ts`,
`history.ts`, pruebas y el verificador de integración de Gerson. No se modifican
tarjetas, encabezado ni maquetación de `PatientMonitoringPage.tsx`.

- La primera petición descarga 100 lecturas. El polling conserva su intervalo
  de 10 segundos y solicita 20; si falta continuidad, sigue los cursores hasta
  solapar la frontera ya cargada. No vuelve a descargar todo el archivo.
- `visibilitychange` recupera ese tramo al volver de una pestaña oculta. Los
  datos siguen aislados por paciente/rango; se conservan orden y desempate por
  ruta, nulos y separación de sesiones en las series.
- Hay una única ventana en caché, con un máximo de 1000 lecturas únicas y 50
  páginas completas. También se limita la retención física a esas páginas:
  no existe un archivo infinito oculto detrás de un `slice(0, 1000)`.
- «Cargar más antiguas» sigue funcionando después de 1000. Al llenarse la
  ventana se liberan páginas recientes y se muestran las antiguas. El cursor
  del servidor mantiene acceso al resto del expediente.
- Al navegar fuera de la ventana reciente se pausa la actualización de ese
  historial para que no desplace la página que se está leyendo. Los indicadores
  de última lectura siguen con su polling independiente.
- «Refrescar lecturas recientes» vuelve al tramo reciente cuando se navegó hacia
  atrás. La cobertura muestra las filas y fechas de la ventana actual; alcanzar
  el inicio significa alcanzar la lectura más antigua del rango, no retener
  simultáneamente todas las lecturas del expediente.
- Si falla una página posterior se conservan las filas y se reintenta el mismo
  cursor. Al salir se cancela la navegación para evitar repoblar la caché tras
  un cambio de paciente o logout.

### Validación ejecutada

Windows, Node.js 24.15.0, Java 21, Firebase CLI 15.34.0. Los datos son ficticios.

| Comando | Resultado |
| --- | --- |
| `./tools/firebase/verify-gerson.ps1` | Tipos y build de los tres workspaces; 208 pruebas API, 24 archivos, sin omisiones, con Auth/Firestore Standard emulados. |
| `npm run test --workspace=apps/web -- --maxWorkers=2` | 28 aprobadas; 2 de integración HTTP requieren sesión/API y se ejecutan por separado en el verificador de navegador. |
| `./tools/firebase/verify-patient-integration.ps1 -SkipChecks` | Navegador Edge real → proxy Vite → Express → Auth/Firestore emulados; dos pruebas HTTP reales aprobadas, semilla repetida sin cambios, historial entre dos placas, permisos y logout. |

La última ejecución usó Playwright desde el paquete ya instalado, mediante
`PULSOLINK_PLAYWRIGHT_MODULE`, y `PULSOLINK_BROWSER_CHANNEL=msedge`. Para un
equipo nuevo, instalar Playwright desde npm y el navegador correspondiente;
el verificador admite un módulo instalado mediante esa variable y exige puertos
libres 13001/15173 y emuladores desechables 18080/19099.

Regresión en navegador con tráfico real, sin interceptar respuestas:

- 240 lecturas de semilla + dos nuevas = 242; dos incrementos de 21 por
  `POST /api/v1/device/measurements` conservan las **284** filas visibles.
- Se continúa por la misma ruta oficial hasta **1120**. Se recorre el archivo
  por los controles de la página y se reconocen las **1120 filas distintas**;
  el máximo simultáneo es **1000**, y regresar a recientes restaura la navegación.
- Viewer recibe 403 en usuarios y auditoría. Hay un evento por apertura real
  (dos aperturas en esta prueba), sin multiplicarlo por polling. Al salir del
  paciente se detiene el polling; logout protege el expediente de nuevo.
- Se verifican tres estados de conexión, idempotencia, nulos ópticos con
  temperatura independiente y ausencia de overflow a 375×812. Esto no sustituye
  la revisión de estilos y de 360×800 del bloque visual de Keily.

Las nuevas regresiones comprueban 162 lecturas tras dos incrementos de 21,
recuperación de 47 después de visibilidad simulada en jsdom, navegación de 1120,
ausencia de más de 1000 muestras y repetición de ventanas superpuestas sin
crecimiento ilimitado. Las pruebas de la pantalla conservan los casos de
recuperación de red y de reintento de la página siguiente.

El build advierte del tamaño del bundle existente; jsdom avisa de que Recharts
no tiene dimensiones reales. Esos avisos no se presentan como una validación
visual. La simulación de visibilidad en jsdom no demuestra un cambio de pestaña
real: su aceptación final corresponde a QA.

## #25: base Firebase y aprovisionamiento

Los emuladores, identidades admin/viewer, aprovisionamiento repetible, restricciones
de credenciales, interfaces/DTO y orden de integración están en las entregas
anteriores (#39/#43). La suite ejecutada vuelve a comprobar repetición sin
cambiar contraseñas, perfiles deshabilitados ni secretos de dispositivos.

El [PR #55](https://github.com/codsebas/PulsoLink/pull/55) agrega la configuración
del proyecto real `pulsolink-pruebas-2026-7c8a31`, Firestore Standard y Auth de
correo/contraseña. Sus reglas, 58 índices y pruebas cloud ya están desplegados;
el PR fue integrado en `main 66c7e08` durante esta entrega. El arreglo web se
actualiza sobre ese merge; las pruebas descritas se ejecutaron antes, sobre
`93ff901` más el arreglo de historial.
Las claves privadas permanecen fuera del repositorio.

Pendiente de aceptación externa: que otro integrante reproduzca los comandos
documentados y confirme la integración de interfaces con Didhyer/Marielos.
Esta ejecución del mismo autor no sustituye esa reproducción independiente.

## #26: persistencia e historia durable

La suite real de emuladores confirma exclusividad concurrente, reserva y cierre,
deduplicación y conflictos, historia de dos placas sin reescribir IDs, paginación,
filtros, reglas y migración repetible con respaldo. La integración HTTP prueba
también las relaciones y permisos de la API objetivo.

La prueba de nube del #55 distingue su alcance: login, creación/lectura/listado
de paciente, auditoría, viewer 403 y acceso directo Firestore 403. No equivale a
repetir toda la matriz de transacciones en la nube.

Pendiente: aceptación de Sebastián/Didhyer de los criterios ya implementados.
La observación de latencia [#51](https://github.com/codsebas/PulsoLink/issues/51)
sigue abierta, sin responsable asignado: pasar las pruebas de consistencia no
demuestra resolver el presupuesto de cinco segundos. Este PR no altera tiempos
del producto ni la política de descarte de muestras.

## #34: parte de Gerson y límites compartidos

Se verificaron Node 24, los comandos existentes, emuladores Standard, la semilla
repetible y la migración con respaldo en pruebas. La configuración cloud y las
diferencias entre local/nube/despliegue se entregan en #55.

No hay legado en el nuevo proyecto cloud que requiera aplicar una migración:
no ejecutar la herramienta contra datos compartidos sin inventario, respaldo y
ventana acordados. Las pruebas de migración emplean datos desechables.

Siguen con sus responsables la automatización/CI y manifiestos (Javier), el
alojamiento, mismo origen y HTTPS (Sebastián), QA independiente (#32/#33),
aprobación visual de Marielos/Axel y demostración física (#35). Solicitar las
revisiones del PR a Marielos, Axel y Sebastián, sin merge directo.
