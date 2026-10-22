# Evidencia — continuidad del historial del paciente y entorno reproducible (#31, #29, #34)

Fecha: 22 de octubre de 2026 (Guatemala). Autor: `@Javifa2324`. Issues relacionados: #31 (PL2-07), #29 (PL2-05), #34 (PL2-10).

Todo lo que sigue se ejecutó localmente. **No hay evidencia de navegador con backend real**: el recorrido de `tools/qa/hugo-history-acceptance.cjs` (Playwright + HTTP oficial) no se ejecutó en esta entrega porque necesita el entorno en vivo de QA (API en :3001, web en :5173, emuladores, credenciales y Edge). La validación visual del dashboard sigue en manos de los supervisores de #29 y de QA (#32, #33).

## Entorno

- Linux, Node v26.7.0, npm 11.19.0. El repositorio declara `.node-version` 24.15.0 y `engines.node >=24.0.0` (raíz, `apps/api`, `apps/web` y `tools/device-simulator`).
- La capa de datos se verifica sin backend ni emuladores con el modelo de servidor del historial de `apps/web/test/helpers.ts`.

## Punto de partida

Al tomar el encargo, `main` ya tenía la reescritura de la ventana de historial de `@gioore` (PR #56, `f085ab3`): una sola ventana con páginas, cursor y navegación por cursor, con recuperación del tramo perdido al volver de una pestaña oculta.

Medí el modelo vigente contra los criterios de QA antes de tocarlo (`apps/web/test/history-acceptance.test.ts` sobre `main`):

| Criterio | Estado en `main` | Evidencia |
| --- | --- | --- |
| HIST-01 (162 lecturas sin huecos) | **Cumple** | La prueba pasó sin cambios. |
| HIST-02 (1120 lecturas visibles) | **No cumple** | `expected 1000 to be greater than 1000`: al superar 1000 lecturas, la navegación descartaba páginas y la ventana se quedaba en 1000. |

## Correcciones entregadas

| Criterio | Corrección | Dónde |
| --- | --- | --- |
| HIST-02 | La navegación hacia atrás **conserva todo lo cargado**: `olderHistoryWindow` ya no descarta páginas y la ventana registra con `visitedFrom` qué páginas son de la persona usuaria. El límite de memoria (`MAX_HISTORY_SAMPLES`, `MAX_HISTORY_PAGES`) queda acotando solo el tramo que crece solo con el refresco automático. | `apps/web/src/features/patient-monitoring/history.ts` |
| HIST-02 (memoria) | El refresco periódico compacta su propio tramo en una página sintética (`compactRecent`) para no guardar páginas repetidas, conservando la página más antigua, que es la que aporta el cursor de continuación. | `apps/web/src/features/patient-monitoring/history.ts` |
| HIST-01 | Sin cambios de código: el modelo vigente ya recupera el tramo perdido. Se añadió la prueba de aceptación que lo fija. | `apps/web/test/history-acceptance.test.ts` |
| Cobertura | `coverageOf` ya no recorta por defecto: la cobertura declara lo que hay cargado y no inventa un truncamiento. | `apps/web/src/features/patient-monitoring/history.ts` |
| PL2-10 (#34) | `engines.node >=24.0.0` en los cuatro `package.json`; los scripts `lint` de `apps/api` y `apps/web` ya no son un `echo` (ejecutan `typecheck`, `build` y `test`); el simulador ejecuta `typecheck`, `build` y `test`; en la raíz, `npm run verify` encadena la verificación de todos los workspaces con la puerta de aceptación. | `package.json`, `apps/api/package.json`, `apps/web/package.json`, `tools/device-simulator/package.json`, `package-lock.json` |

### Pruebas de `@gioore` que hubo que ajustar

El criterio de QA «nada de lo recién cargado se esconde» es incompatible con la aserción «la ventana nunca supera 1000 lecturas» de `test/history-window.test.ts` y `test/history-hook.test.tsx`. Se actualizaron solo esas aserciones, con el motivo en el código:

- `HIST-02 permite visitar las 1120 lecturas…` → `HIST-02 recorre las 1120 lecturas sin descartar lo recién cargado`: la ventana conserva lo cargado y el recorrido llega al inicio real del expediente.
- `navega 1120 lecturas con una sola ventana en caché…`: la ventana conserva lo cargado y, al terminar, `hasMore` es `false` porque se alcanzó el inicio real (antes era `true` porque la ventana había descartado páginas recientes).

Las demás verificaciones de `@gioore` se mantienen sin cambios: recuperación de 47 muestras de una ausencia, ausencia mayor al límite con acceso por cursor, crecimiento acotado con miles de refrescos superpuestos, cancelación de la página pendiente al salir y una sola entrada en la caché.

## Puerta de aceptación local

```bash
node tools/qa/history-continuity-acceptance.cjs
```

**Resultado ejecutado (código de salida 0):**

```
== Aceptación local de la continuidad del historial (QA #31 / #29) ==
Node: v26.7.0 (el repositorio declara Node 24 LTS en engines)
Escenario: apps/web/test/history-acceptance.test.ts
Recorrido real con backend y navegador: tools/qa/hugo-history-acceptance.cjs

Comprobaciones estáticas:
  [OK] STATIC-01  El historial acumulado no se recorta al fusionar (hooks.ts)
  [OK] STATIC-02  La navegación conserva las páginas que la persona usuaria abrió (history.ts)
  [OK] STATIC-03  El refresco en vivo recupera el tramo perdido (history.ts)

Escenario de aceptación:
  [OK] HIST-01  La ventana en vivo recupera el tramo perdido y no deja huecos
  [OK] HIST-02  La paginación alcanza el inicio real sin recortar lo cargado

Pruebas ejecutadas: 2 · aprobadas: 2 · fallidas: 0
RESULTADO: ACEPTACIÓN APROBADA
```

Es el complemento sin dependencias del recorrido real de QA (`tools/qa/hugo-history-acceptance.cjs`), que se dejó intacto: ese reproduce el caso contra el endpoint oficial y el navegador, y necesita el entorno en vivo.

## Pruebas de la capa de datos (web)

```bash
npm test --workspace=apps/web
```

**Resultado ejecutado: 31 pruebas aprobadas en 8 archivos; 2 pruebas de integración omitidas sin sesión real.**

| Archivo | Qué verifica |
| --- | --- |
| `test/history.test.ts` | Orden del servidor con empate temporal, deduplicación (incluido el mismo ID en sesiones distintas), cobertura y truncamiento declarado, aislamiento de caché por paciente y rango, y que la cobertura no recorta el historial acumulado. |
| `test/history-window.test.ts` | Ventana continua: 162 lecturas tras dos refrescos, recorrido completo de 1120 lecturas sin descartar lo cargado, recuperación de ausencias y crecimiento acotado del tramo automático. |
| `test/history-hook.test.tsx` | Integración del hook: recuperación de más de veinte muestras por refresco, recuperación al volver de una pestaña oculta, navegación de 1120 lecturas y cancelación de la página pendiente al salir. |
| `test/series.test.ts` | Orden cronológico, nulos conservados sin convertirlos en cero, huecos por tiempo y por cambio de placa, series con lecturas de distintas placas. |
| `test/monitoring-api.test.ts` | Recorrido de varias páginas contra un modelo de servidor con empates temporales: sin duplicar ni perder muestras; envío de cursor, límite y filtros; la ventana en vivo pide menos que el archivo. |
| `test/polling.test.ts` | El plan de refresco solo activa con sesión activa y pestaña visible; las páginas acumuladas no entran en el plan. |
| `test/patient-monitoring-page.test.tsx` | La pantalla consume los hooks: última muestra, cobertura declarada, acumulación de páginas antiguas, reintento tras error de red. |
| `test/history-acceptance.test.ts` | Aceptación QA: HIST-01 (162 lecturas sin huecos, sin consultas extra en un refresco normal) e HIST-02 (1120 lecturas visibles, 12 páginas, `complete: true`). |

## Verificación de los workspaces (#34, PL2-10)

```bash
npm run verify
```

**Resultado ejecutado (código de salida 0):**

```
> pulsolink@0.1.0 verify
> npm run lint && node tools/qa/history-continuity-acceptance.cjs

> @pulsolink/api@0.1.0 lint
> npm run typecheck && npm run build && npm test
 Test Files  16 passed | 8 skipped (24)
      Tests  169 passed | 39 skipped (208)

> @pulsolink/web@0.1.0 lint
> npm run typecheck && npm run build && npm test
✓ built in 2.31s
 Test Files  8 passed | 1 skipped (9)
      Tests  31 passed | 2 skipped (33)

> @pulsolink/device-simulator@0.1.0 lint
> npm run typecheck && npm run build && npm test

  [OK] STATIC-01  El historial acumulado no se recorta al fusionar (hooks.ts)
  [OK] STATIC-02  La navegación conserva las páginas que la persona usuaria abrió (history.ts)
  [OK] STATIC-03  El refresco en vivo recupera el tramo perdido (history.ts)
  [OK] HIST-01  La ventana en vivo recupera el tramo perdido y no deja huecos
  [OK] HIST-02  La paginación alcanza el inicio real sin recortar lo cargado
RESULTADO: ACEPTACIÓN APROBADA
```

Comprobaciones por separado: `npm run typecheck` (api, web y simulador, sin errores de tipos), `npm run build` (api, web y simulador) y `npm run lint` (verificación real en los tres workspaces). Las pruebas omitidas son las que requieren emuladores de Firestore/Auth o una sesión real contra la API.

## Pendientes y límites

- **El recorrido real de QA no se ejecutó en esta entrega.** `node tools/qa/hugo-history-acceptance.cjs` necesita backend, web, emuladores, credenciales y Edge. La puerta local cubre los mismos criterios sobre la capa de datos, pero no sustituye la evidencia en navegador.
- Sin evidencia de navegador: no se verificó visualmente la pantalla con la ventana de historial nueva.
- Con navegación activa la ventana conserva todo lo que la persona usuaria abrió; el límite de memoria acota el tramo automático. Es el precio del criterio de QA (nada de lo recién cargado se esconde) y queda declarado en este documento.
- Los emuladores no acreditan disponibilidad de índices compuestos en Firestore Standard real.
- La prueba de integración se omite sin `PULSOLINK_*`; no debe contarse como aprobada cuando no se ejecutó.
- No se probó la placa física: las lecturas del historial provienen del emulador y del simulador.
