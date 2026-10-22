# Capa de datos de monitoreo e historial — #31 (PL2-07)

Autor: `@Javifa2324`. Supervisor de frontend: `@Mar-03` y `@AxelHerrera11`. Supervisor de backend: `@codsebas`.
Estado: implementación entregada en `feat/pl2-07-datos-monitoreo`; el diseño visual del dashboard de #29 sigue pendiente de validación de los supervisores.

## Objetivo

Entregar a quien integra el dashboard una capa de datos confiable para indicadores y gráficas, sin que necesite conocer Firestore ni el detalle de las rutas HTTP. La capa vive en `apps/web/src/features/patient-monitoring/` y usa el cliente HTTP común con cookies de sesión y CSRF (contrato B 2.0.0).

## Módulos

| Archivo | Responsabilidad |
| --- | --- |
| `api.ts` | Accesos HTTP tipados: `fetchPatientLatest`, `fetchPatientMeasurements`, `fetchPatient`, `fetchActiveSession`, `recordPatientAccess`. Tamaño de página (100) y ventana en vivo (20) definidos aquí. |
| `keys.ts` | Claves de consulta. Toda clave incluye paciente y rango, de modo que cambiar de expediente o de intervalo nunca mezcla ni conserva datos del anterior. |
| `history.ts` | Funciones puras: identidad de lectura (`sessionId/id`), ruta del documento, orden del servidor, deduplicación, fusión de páginas, ventana del historial (`recentHistoryWindow`, `olderHistoryWindow`, `windowReadings`) y declaración de cobertura. |
| `series.ts` | Series cronológicas por magnitud: nulos conservados, huecos por desconexión o cambio de placa, y `trendPoints` para gráficas combinadas. |
| `hooks.ts` | Hooks de TanStack Query: `usePatientAccess`, `usePatientLatest`, `usePatientLiveWindow`, `usePatientHistory`, `useDocumentVisible` y el plan de polling. |

## Modelo de paginación e historial

El servidor entrega `receivedAt DESC` y desempata por la ruta completa del documento (`sessions/{sessionId}/measurements/{id}`). El cliente reproduce ese orden:

- **Identidad de lectura:** `sessionId/id`. El ID de medición solo es único dentro de su sesión; deduplicar por `id` perdería historial.
- **Fusión de páginas:** `mergeMeasurements` deduplica por identidad y conserva el orden del servidor. Las páginas se acumulan, no se reemplazan: el botón «Cargar más antiguas» añade la siguiente página del cursor.
- **Ventana única y acotada:** el historial se sostiene en una sola ventana (`HistoryWindow`) con las páginas cargadas, el cursor de continuación y el índice de la primera página que la persona usuaria abrió con «Cargar más antiguas» (`visitedFrom`).
- **Refresco en vivo:** cada tick pide la página más reciente (20 lecturas) y, si no alcanza la frontera ya cargada, sigue pidiendo páginas hasta solaparla. Así se recupera el tramo que llegó con la pestaña oculta o durante una desconexión, sin perder muestras intermedias. Un refresco normal hace una sola petición.
- **Navegación hacia atrás:** `olderHistoryWindow` sigue el cursor del servidor y **conserva todo lo cargado**. Lo recién descargado no se descarta ni se esconde, y el recorrido llega al inicio real del expediente (criterio de QA HIST-02).
- **Última muestra:** `latest` se refresca cada 2 s mientras haya sesión activa y la pestaña esté visible. `deviceOnline` (≤45 s), `stale` (>10 s) y `connectionState` los decide el backend; el frontend solo los presenta.
- **Límite de memoria:** `MAX_HISTORY_SAMPLES` (1000) y `MAX_HISTORY_PAGES` (50) acotan el tramo que crece solo con el refresco automático. Con navegación activa la ventana conserva todo lo que la persona usuaria pidió ver: el recorte por un lado abriría un hueco o escondería las páginas recién descargadas.
- **Cobertura declarada:** lecturas cargadas, páginas cargadas, intervalo exacto (`oldestReceivedAt`–`newestReceivedAt`), si hay más páginas y si se alcanzó el inicio del intervalo.

## Filtros temporales

`from` inclusivo y `to` exclusivo, en ISO UTC. La pantalla convierte la hora local de Guatemala (UTC−6) con `rangeFromLocal` y rechaza rangos invertidos. El cursor del servidor está ligado a los filtros: cambiar de rango reinicia el recorrido y no conserva lecturas del intervalo anterior.

## Series y honestidad de los datos

- Un valor `valid` se representa con su número; `no_contact`, `invalid` y `unavailable` se conservan como `null` y nunca como cero.
- Un tramo se interrumpe cuando pasan más de 10 s, o cuando cambian sesión, asignación o placa. El hueco se marca con un punto nulo y `connectNulls=false`: la gráfica no une tramos desconectados.
- Las gráficas son de valores puntuales. No son una onda PPG de alta frecuencia ni un electrocardiograma. La temperatura es superficial y la SpO₂ es estimada.

## Integración para otras vistas

```ts
const history = usePatientHistory(patientId, range, { enabled: true, poll: Boolean(activeSession) });
history.readings;      // lecturas deduplicadas en orden del servidor
history.coverage;      // cobertura declarada
history.series;        // series por magnitud con huecos
history.hasMore;       // hay páginas pendientes
history.loadMore();    // carga la siguiente página
history.refresh();     // refresca solo la ventana en vivo
```

El registro de apertura (`usePatientAccess`) es idempotente por `viewId` y debe completarse antes de mostrar el expediente. El polling nunca llama a esa operación.

## Fuera de alcance

El diseño visual del dashboard (jerarquía de tarjetas, colores, navegación) sigue siendo el de la propuesta de #29 y espera revisión de los supervisores. Esta entrega no modifica esa propuesta: cambia cómo se obtienen, acumulan y declaran los datos.

## Verificación

Las verificaciones de esta capa están en `apps/web/test/` (paginación con empates temporales, filtros, nulos y calidad, series con huecos, aislamiento de caché, plan de polling, continuidad de la ventana e integración de la pantalla) y en `apps/web/test/monitoring-api.integration.test.ts`, que se omite salvo que se provea una sesión real.

Los criterios de aceptación de QA tienen dos puertas:

```bash
# Recorrido real contra el backend y el navegador (entorno en vivo de QA)
node tools/qa/hugo-history-acceptance.cjs

# Puerta local sin dependencias: mismo escenario sobre la capa de datos
node tools/qa/history-continuity-acceptance.cjs
```

La puerta local corre `apps/web/test/history-acceptance.test.ts` contra el modelo de servidor del historial y verifica:

- **HIST-01:** con 162 lecturas, tras dos refrescos con lecturas nuevas (pestaña oculta) el historial queda sin huecos y con las 162 lecturas; un refresco normal no genera consultas extra.
- **HIST-02:** con 1120 lecturas, «Cargar más antiguas» llega al inicio real del expediente (12 páginas, 1120 lecturas visibles) y la cobertura declara `complete: true` sin truncar nada.

El detalle de comandos y resultados está en [evidencias](../evidencias/monitoreo-pl2-07.md).
