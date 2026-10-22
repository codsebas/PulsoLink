# PL2-14 — Auditoría responsiva comparable entre versiones

Issue: [#74](https://github.com/codsebas/PulsoLink/issues/74). Responsable: `@AxelHerrera11`.

Herramienta de QA para medir, de forma reproducible, cómo se ve y se usa la web en móvil, tablet y escritorio, y para comparar dos versiones (antes y después de un PR). **Registra métricas; no aprueba ni rechaza un diseño por sí sola.**

## Qué mide

Recorre como admin las rutas `/`, `/monitoring`, `/monitoring/monitor-patient`, `/patients`, `/devices`, `/assignments`, `/sessions`, `/admin/users` y `/admin/audit` a 360×800, 768×1024 y 1440×900. También mide `/login` sin sesión a 360 px.

| Métrica | Significado | Mejor |
| --- | --- | --- |
| `horizontalOverflowPx` | Píxeles que la página desborda en horizontal | 0 |
| `smallTargets` / `interactiveTargets` | Controles (enlaces, botones, campos) con ancho o alto menor de 44 px | Menos |
| `headerHeightPx`, `headerSticky` | Altura de la cabecera y si queda fija al desplazar | Menos en móvil |
| `tablesNeedingHorizontalScroll` | Tablas más anchas que su contenedor | Menos |
| `tinyTextElements` | Elementos con texto de menos de 12 px | Menos |
| `h1Count` | Encabezados `h1` | 1 |
| `pageHeightPx` | Altura total de la página | Informativa (depende de los datos) |

Se mide solo la geometría y las etiquetas de los controles; no se copian datos de pacientes, cookies ni tokens.

## Cómo ejecutarla

Con Node.js 24, Java 21 y dependencias instaladas, desde la raíz:

```powershell
npm ci; npm run build
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink-audit'
$env:PULSOLINK_PLAYWRIGHT_MODULE = '<ruta>\node_modules\playwright'   # o Playwright en PATH
$env:PULSOLINK_RESPONSIVE_AUDIT = 'true'
$env:PULSOLINK_EVIDENCE_DIR = "$PWD\.cache\ui-responsive-audit"
# Opcionales: PULSOLINK_BROWSER_CHANNEL=chrome|msedge, PULSOLINK_AUDIT_SCREENSHOTS=viewport|full|none,
# PULSOLINK_AUDIT_SCREENSHOT_WIDTHS=360 (solo esos anchos), PULSOLINK_ENVIRONMENT='descripción'
npx -y firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink-audit --only firestore,auth 'node tools/firebase/verify-patient-browser.cjs'
```

El orquestador (`tools/firebase/verify-patient-browser.cjs`) siembra datos ficticios, arranca API y Vite contra emuladores nuevos e inicia sesión de verdad. Después ejecuta `tools/qa/ui-responsive-audit.cjs` y escribe `audit.json`, más capturas si se piden, en `PULSOLINK_EVIDENCE_DIR`.

## Cómo comparar dos versiones

```powershell
node tools/qa/ui-responsive-compare.cjs <antes>\audit.json <después>\audit.json --out comparacion.md
```

- Genera una tabla Markdown lista para pegar en el PR, solo con las rutas que cambiaron (`--all` las muestra todas).
- ✅ indica mejora y ⚠️ regresión.
- `--fail-on-regression` devuelve código 1 si alguna métrica empeora.
- La altura de página no cuenta como regresión.
- Pruebas del comparador: `node --test tools/qa/ui-responsive-compare.test.cjs`.

**Procedimiento por PR de #74:**
1. Medir la rama base y la rama del PR con los mismos datos y el mismo navegador.
2. Pegar la comparación en la descripción del PR.
3. Versionar solo el `audit.json` de referencia cuando cambie la línea base, y capturas a 360 px si aportan.

## Línea base

[`docs/evidencias/pl2-14-ui-responsive/baseline-accecfb/`](../evidencias/pl2-14-ui-responsive/baseline-accecfb/audit.json): `main` en `accecfb`, Chrome 155, macOS, emuladores. Incluye capturas a 360 px.

| Ancho | Desbordamiento | Cabecera | Controles <44 px | Tablas con scroll horizontal | Textos <12 px |
| --- | --- | --- | --- | --- | --- |
| 360 | 0 px en todas las rutas | 149 px, fija | 163 de 170 | 7 | 30 |
| 768 | 0 px | 149 px, fija | 148 de 157 | 3 | 46 |
| 1440 | 0 px | 121 px, fija | 156 de 157 | 0 | 44 |

**Reproducibilidad:** dos ejecuciones consecutivas sobre el mismo commit dieron una comparación sin diferencias (0 mejoras, 0 regresiones, misma altura de página).

**Límites:** mide una sesión admin con el conjunto de datos ficticios del orquestador. No sustituye la revisión visual ni la de accesibilidad con lector de pantalla. Comparar entre máquinas o navegadores distintos puede introducir diferencias de fuente y redondeo.
