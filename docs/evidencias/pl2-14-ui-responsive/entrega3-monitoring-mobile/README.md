# PL2-14 entrega 3 — Detalle del paciente en móvil (#74)

Fecha de ejecución: 2026-10-22. Responsable: `@AxelHerrera11`.
Entorno: macOS (zsh), Node.js 24.14.1, Google Chrome 155 con Playwright 1.64.1 (temporal, fuera del repositorio), emuladores Auth/Firestore Standard nuevos en cada ejecución. Sin nube ni hardware.

## Qué se midió

- `audit.json`: auditoría responsiva de la rama `feat/monitoring-mobile`. **Nota:** el campo `commit` muestra `a6a3c6a` (la punta de la entrega 2, sobre la que está apilada) porque se midió sobre el árbol de trabajo con los cambios todavía sin commit.
- `comparacion.md`: comparación con la [medición de la entrega 2](../entrega2-responsive-tables/audit.json). Resultado: **4 mejoras y 0 regresiones**, todas en `/monitoring/monitor-patient`:
  - textos de menos de 12 px: de 22 a 0 (360), de 28 a 0 (768) y de 26 a 1 (1440);
  - la tabla deja de necesitar desplazamiento horizontal a 360 px;
  - la altura de la página baja de 9469 a 5672 px a 360 px (informativa).
- Capturas a 360 px (recortes de una captura de página completa): [gráficas con marcadores](screenshots/360_monitor-patient-graficas.png) y [lista compacta](screenshots/360_monitor-patient-lista.png).

## Comprobaciones ejecutadas sobre la rama

| Comprobación | Resultado |
| --- | --- |
| HIST-01 / HIST-02 (`tools/qa/hugo-history-acceptance.cjs`; copia local que solo cambia `channel:'msedge'` por `'chrome'`) | PASS: 162 lecturas recibidas y visibles; 1120 inspeccionadas en 12 páginas con un máximo de 1000 simultáneas |
| Aceptación de interfaz de #33 (`PULSOLINK_UI_ACCEPTANCE_ONLY`) | 17/17 (incluye `tbody tr`, la región desplazable y el teclado en el historial a escritorio) |
| Sección E de PL2-08 (`PULSOLINK_UI_CONTRAST_ONLY`) | Aprobada |
| Pruebas web | 61 aprobadas (3 nuevas de `HistoryReadings`), 2 omitidas |

## Observaciones

- Las gráficas muestran un marcador en cada valor puntual. El zigzag de la línea se debe a que los datos sintéticos del fixture son cíclicos. Quitar del todo la línea de unión (dejar solo puntos) es una decisión de diseño de #29/#31.
- En móvil la lista dibuja 20 lecturas por tanda ("Mostrar 20 más"). Las lecturas cargadas en memoria, la ventana de 1000 y la paginación del historial no cambian.
