# Evidencia — capa de datos de monitoreo e historial (#31, PL2-07)

Fecha: 20 de octubre de 2026 (Guatemala). Autor: `@Javifa2324`. Issues relacionados: #31 (responsable), #29 y #34 (coordinación).

Todo lo que sigue se ejecutó localmente. **No hay evidencia de navegador (Playwright), de nube ni de placa física**: la validación visual del dashboard sigue en manos de los supervisores de #29 y de QA (#32, #33).

## Entorno

- Linux, Node v26.7.0, npm 11.19.0 (el repositorio declara `.node-version` 24.15.0 y `engines >=22`).
- Firebase CLI 15.34.0, Firestore Emulator 1.22.0 y Auth Emulator, proyecto desechable `demo-pulsolink`.
- Backend local `apps/api` con `tsx` en `http://localhost:3001` y emuladores en `127.0.0.1:18080` / `127.0.0.1:19099`.
- Dependencias añadidas en `apps/web`: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom` (solo desarrollo).

## Pruebas de la capa de datos (web)

```bash
npm run test --workspace=apps/web
```

**Resultado ejecutado: 16 pruebas aprobadas en 5 archivos; 2 pruebas de integración omitidas sin sesión real.**

| Archivo | Qué verifica |
| --- | --- |
| `test/history.test.ts` | Orden del servidor con empate temporal, deduplicación (incluido el mismo ID en sesiones distintas), cobertura y truncamiento declarado, aislamiento de caché por paciente y rango. |
| `test/series.test.ts` | Orden cronológico, nulos conservados sin convertirlos en cero, huecos por tiempo y por cambio de placa, series con lecturas de distintas placas. |
| `test/monitoring-api.test.ts` | Recorrido de varias páginas contra un modelo de servidor con empates temporales: sin duplicar ni perder muestras; envío de cursor, límite y filtros; la ventana en vivo pide menos que el archivo. |
| `test/polling.test.ts` | El plan de refresco solo activa con sesión activa y pestaña visible; las páginas acumuladas no entran en el plan. |
| `test/patient-monitoring-page.test.tsx` | La pantalla consume los hooks: muestra la última muestra, declara la cobertura y accumulates páginas antiguas al pedir más historial. |

## Integración con la API real (emuladores)

```bash
npx firebase-tools@15.34.0 emulators:start --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth
npx tsx src/scripts/seed-emulators.ts        # desde apps/api, con FIREBASE_* y DEMO_* definidos
npx tsx src/server.ts                          # API local con COOKIE_SECURE=false
# login demo-viewer por HTTP (cookie de sesión) y:
PULSOLINK_API_URL=http://localhost:3001/api/v1 \
PULSOLINK_SESSION_COOKIE="pulsolink_session=…" \
PULSOLINK_PATIENT_ID=monitor-patient \
npx vitest run test/monitoring-api.integration.test.ts   # desde apps/web
```

**Resultado ejecutado:** la prueba de integración se ejecutó contra la API local y el emulador de Firestore con 240 lecturas sembradas y approved:

```
páginas: 3  lecturas: 240  cobertura: { loaded: 240, pagesLoaded: 3, hasMore: false, complete: true, truncated: false, dropped: 0 }
```

La prueba comprueba que el recorrido de páginas no duplica ni pierde lecturas, que el orden del cliente coincide con el del servidor (`receivedAt DESC`, ruta completa `DESC`) y que la calidad de cada magnitud se conserva (un valor no válido sigue siendo `null`).

## Suite del backend con emuladores

```bash
npx firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api'
```

**Resultado ejecutado: 127 pruebas aprobadas en 19 archivos.** La capa de datos del frontend no modifica el backend; esta ejecución confirma que la semilla añadida y los endpoints de historial siguen contando con la suite existente.

## Comprobaciones de calidad

```bash
npm run typecheck   # workspaces api y web
npm run build       # compilación de producción (web y simulador)
npm run lint
```

**Resultado ejecutado:** sin errores de tipos, compilación correcta y lint correcto.

## Datos de prueba añadidos

`apps/api/src/scripts/monitoring-fixtures.ts` siembra un paciente seudónimo (`monitor-patient`) con dos placas simuladas y dos sesiones: 240 lecturas con tres lecturas por milisegundo (empate temporal), una desconexión de quince segundos entre las placas y lecturas sin contacto óptico. Con el límite de página de 100 el historial exige tres páginas. Todo es sintético, se crea en una sola transacción con marcador y solo en emuladores desechables.

## Pendientes y límites

- La validación visual del dashboard de #29/#33 sigue pendiente de los supervisores. Los casos de historial HIST-01/HIST-02 sí se repitieron después en navegador: ver [aceptación del 22 de octubre](historial-31-aceptacion-2026-10-22.md).
- Los emuladores no acreditan disponibilidad de índices compuestos en Firestore Standard real.
- La prueba de integración se omite sin `PULSOLINK_*`; no debe contarse como aprobada cuando no se ejecutó.
- No se probó la placa física: las lecturas del historial provienen del emulador y del simulador.

## Aceptación de navegador posterior (22 de octubre de 2026)

La repetición independiente de HIST-01/HIST-02 sobre `main` `00be19f` y Node 24.22.1 terminó con `exit 0`: HIST-01 mostró las 162 lecturas y HIST-02 recorrió 1120 lecturas con un máximo de 1000 simultáneas. Se usaron Auth/Firestore emulados y Chromium/Playwright; el ejecutor oficial se copió localmente solo para sustituir el canal `msedge`, no disponible en Linux, y para tomar la base de git. Detalle, comandos y capturas en [historial-31-aceptacion-2026-10-22.md](historial-31-aceptacion-2026-10-22.md).
