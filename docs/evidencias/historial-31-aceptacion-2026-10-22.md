# Aceptación de historial HIST-01/HIST-02 — #31 (PL2-07)

Fecha: 22 de octubre de 2026 (Guatemala). Autor: `@Javifa2324`. Issues: #31 (responsable), #29, #33 y #34.

Repetición independiente de la aceptación de historial sobre `main` (`3db477a`) después de la corrección del ejecutor en #61 y de la ventana acotada de #56. **No se modificó código de producto, pruebas ni el ejecutor oficial.**

## Resultado

| Caso | Esperado | Obtenido | Estado |
| --- | --- | --- | --- |
| HIST-01 | 162 lecturas disponibles y cobertura exacta tras dos ventanas nuevas | La API recibió 162; la interfaz muestra 162; afirma alcanzar el inicio | **PASS** |
| HIST-02 | Recorrer las 1120 lecturas con un máximo de 1000 simultáneas | 12 páginas; 1120 lecturas inspeccionadas; 920 visibles al final; máximo 1000 | **PASS** |

Salida del ejecutor: `exit 0`. Resultado crudo en [results.json](hugo-history-acceptance-2026-10-22/results.json), con capturas [live-window.png](hugo-history-acceptance-2026-10-22/live-window.png) y [history-1120.png](hugo-history-acceptance-2026-10-22/history-1120.png).

## Entorno

- Linux, Node 26.7.0 (cumple `engines.node >= 24.0.0`), npm 11.19.0.
- Firebase CLI 15.34.0; Firestore Emulator 1.22.0 y Auth Emulator, proyecto desechable `demo-pulsolink-hugo`.
- API en `http://localhost:3001` y web en `http://localhost:5173`, con Auth/Firestore emulados.
- Chromium 156 (Playwright 1.64.1) headless. Datos sintéticos; sin nube ni placa física.

## Comandos ejecutados

```bash
npm test --workspace=apps/web        # 43 aprobadas, 2 omitidas; exit 0
npm run typecheck --workspace=apps/web  # exit 0
node tools/qa/hugo-history-acceptance.cjs # exit 0; HIST-01 PASS, HIST-02 PASS
```

## Adaptación local declarada

`tools/qa/hugo-history-acceptance.cjs` abre Microsoft Edge con `chromium.launch({channel:'msedge'})`. Edge no está disponible en este entorno Linux. Para ejecutar la misma lógica se usó una **copia local del ejecutor** en la que solo se quitó `channel:'msedge'`, dejando `chromium.launch({headless:true})` con el Chromium de Playwright. No se cambiaron escenarios, esperas, aserciones, datos ni el archivo versionado del repositorio.

El JSON generado conserva la etiqueta fija del ejecutor (`base: "abc4d45 + corrección retry"`). La ejecución real se hizo sobre `main` `3db477a`.

## Límites

- No se repitió en Windows/Edge; la lógica y las aserciones son las del ejecutor oficial, pero el binario del navegador fue Chromium en Linux.
- Los emuladores no acreditan índices ni latencia de Firestore Standard real.
- Datos sintéticos. No sustituye la aceptación visual del dashboard de #29 ni la revisión de accesibilidad de #33.
